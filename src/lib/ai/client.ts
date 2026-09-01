import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude 호출의 공용 바닥 — 기획(F2·F3)·캡션(F7)·슬라이드(F8)가 함께 쓴다.
 *
 * 여기 모아둔 이유: 재시도 정책·구조화 출력·거부 처리를 기능마다 따로 쓰면
 * 서로 어긋난다. 규칙은 한 곳에 두고 각 기능은 «무엇을 물을지»만 정한다.
 *
 * 키는 서버에서만 읽는다. `NEXT_PUBLIC_` 접두사를 절대 붙이지 않는다 (CLAUDE.md 보안 2).
 */

export const MODEL = "claude-opus-5";

/**
 * 노력 수준 (PLAN.md §9).
 * - `low`  : 사용자가 화면에서 기다리는 대화 턴
 * - `medium`: 결과물로 남는 것 — 카드·캡션·슬라이드
 */
export type Effort = "low" | "medium";

/** 작은 JSON만 받지만 상한을 낮게 잡으면 생각이 잘려 응답이 깨진다 */
const MAX_TOKENS = 16000;

/** 키가 있는지만 본다. 유효한지는 첫 호출에서 드러난다 */
export function isClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * 이 제품이 누구를 돕는지 — 모든 호출에 공통으로 깔린다.
 *
 * 기획 대화든 캡션이든 **같은 사람이 쓴 것처럼** 읽혀야 한다.
 * 기능마다 말투 규칙을 따로 쓰면 화면을 옮길 때마다 톤이 튄다.
 * 근거: PRD §3 톤앤매너 — 「먼저 정리해서 건네주되, 앞에 나서지 않는다」.
 */
export const BASE_SYSTEM = [
  "너는 «차곡»의 기획 도우미다. 인스타그램을 운영해야 하지만 마케팅이 본업이 아닌 1인 운영자를 돕는다.",
  "",
  "말투 규칙:",
  "- 한국어로만 답한다. 존댓말을 쓰되 딱딱하지 않게.",
  "- 마케팅 용어(타깃·퍼널·톤앤매너·인게이지먼트)를 쓰지 않는다. 사용자는 그 말을 모르고 배우고 싶어하지도 않는다.",
  "- 빈칸을 던지지 않는다. 먼저 정리해서 건네고, 사용자는 고치기만 하면 되게 한다.",
  "- 앞에 나서지 않는다. 감탄사·이모지를 남발하지 않는다.",
].join("\n");

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // 키는 환경에서 읽는다 — 생성자에 하드코딩하지 않는다
  if (!client) client = new Anthropic();
  return client;
}

/* ── 스키마 도우미 ─────────────────────────────────────────
   additionalProperties: false + required로 모양을 못박는다.
   느슨하게 두면 모델이 필드를 덧붙여 파싱 이후 코드가 흔들린다.

   ⚠️ **배열 개수는 스키마로 못 정한다.** 구조화 출력은 `minItems`를 0이나 1
   외의 값으로 받지 않는다("For 'array' type, 'minItems' values other than
   0 or 1 are not supported"). 개수는 프롬프트로 요청하고 **코드에서 맞춘다.**  */

export function obj(properties: Record<string, unknown>, required: string[]) {
  return { type: "object", properties, required, additionalProperties: false };
}

export const STR = { type: "string" } as const;
export const STR_ARRAY = { type: "array", items: STR } as const;

/** 답이 만들어지는 동안 글자를 흘려보내는 콜백 */
export type OnText = (delta: string) => void;

/**
 * 아직 끝나지 않은 JSON에서 `reply` 문자열만 뽑아낸다.
 *
 * 스트리밍으로 오는 건 `{"reply":"안녕하` 같은 **깨진 JSON**이라 `JSON.parse`가 안 된다.
 * 스트리밍을 쓰는 스키마는 `reply`를 첫 속성으로 두어 가장 먼저 흘러나오게 한다.
 *
 * 못 찾으면 null — 그때는 스트리밍만 포기하고 완성본을 기다린다.
 * 이 함수가 틀려도 최종 결과는 `JSON.parse`가 따로 만든다.
 */
function extractPartialReply(buffer: string): string | null {
  const at = buffer.indexOf('"reply"');
  if (at < 0) return null;

  let i = at + '"reply"'.length;
  while (i < buffer.length && buffer[i] !== '"') {
    if (!":  \n\r\t".includes(buffer[i])) return null; // 예상 못 한 모양
    i++;
  }
  if (i >= buffer.length) return null;
  i++;

  const ESCAPES: Record<string, string> = {
    n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/",
  };

  let out = "";
  while (i < buffer.length) {
    const c = buffer[i];
    if (c === '"') return out; // 문자열이 끝났다
    if (c !== "\\") {
      out += c;
      i++;
      continue;
    }
    const next = buffer[i + 1];
    if (next === undefined) break; // 이스케이프가 잘렸다 — 다음 조각을 기다린다
    if (next === "u") {
      if (i + 5 >= buffer.length) break;
      out += String.fromCharCode(parseInt(buffer.slice(i + 2, i + 6), 16));
      i += 6;
      continue;
    }
    out += ESCAPES[next] ?? next;
    i += 2;
  }
  return out; // 아직 오는 중
}

/** 다시 시도해봐야 같은 결과인 실패 — 재시도 루프를 그냥 통과시킨다 */
export class NonRetryableError extends Error {}

export type CallOptions = {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  effort: Effort;
  /** 있으면 `reply`를 만들어지는 대로 흘려보낸다 (대화 턴 전용) */
  onText?: OnText;
};

/**
 * 한 번 호출하고 JSON으로 받는다. 실패하면 **한 번만** 다시 시도한다 (§9 · PRD §5-7).
 *
 * 재시도해도 안 되면 던진다 — 호출한 route가 잡아서 「다시 시도」를 사용자에게 넘긴다.
 * 여기서 조용히 기본값을 돌려주면 사용자는 AI가 만든 줄 알게 된다.
 *
 * 재시도해도 소용없는 셋은 즉시 던진다: 요청 형식 오류·인증 실패·안전 거부.
 *
 * 전송은 항상 스트리밍이다 — `max_tokens`가 클 때 요청 시간 초과를 피할 수 있고,
 * `onText`를 넘기면 그대로 화면까지 흘려보낼 수 있다.
 */
export async function callJson<T>({
  system,
  user,
  schema,
  effort,
  onText,
}: CallOptions): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const stream = getClient().messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: user }],
        thinking: { type: "adaptive" },
        output_config: { effort, format: { type: "json_schema", schema } },
      });

      if (onText) {
        // 재시도로 두 번째 호출이 되면 앞서 흘려보낸 글자와 겹친다.
        // 그래서 «지금까지 보낸 길이»를 시도마다 새로 센다
        let buffer = "";
        let sent = 0;
        stream.on("text", (delta) => {
          buffer += delta;
          const reply = extractPartialReply(buffer);
          if (reply === null || reply.length <= sent) return;
          onText(reply.slice(sent));
          sent = reply.length;
        });
      }

      const response = await stream.finalMessage();

      if (response.stop_reason === "refusal") {
        throw new NonRetryableError("AI가 이 요청에는 답하지 않았어요.");
      }

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      return JSON.parse(text) as T;
    } catch (e) {
      if (
        e instanceof NonRetryableError ||
        e instanceof Anthropic.BadRequestError ||
        e instanceof Anthropic.AuthenticationError
      ) {
        throw e;
      }
      lastError = e;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("AI 호출에 실패했어요.");
}
