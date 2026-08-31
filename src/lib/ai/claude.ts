import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { AUDIENCES, AUDIENCE_DEFAULT, audiencePrompt } from "@/lib/audiences";
import type {
  CardDraft,
  OnText,
  PlanningAI,
  PlanProposal,
  PlanTurnResult,
} from "./types";

/**
 * Anthropic Claude 실구현 (PLAN.md §9).
 *
 * `mock.ts`와 **같은 인터페이스**를 채운다 — 화면·API는 어느 쪽이 붙었는지 모른다.
 * 어느 것을 쓸지는 `index.ts`가 `ANTHROPIC_API_KEY` 유무로 고른다.
 *
 * 설계에서 지킨 것:
 * - **구조화 출력을 강제한다** (§9) — 자유 텍스트를 파싱하면 형식이 조금만 흔들려도
 *   F3가 통째로 실패한다. `output_config.format`에 JSON 스키마를 넘긴다.
 * - **자동 1회 재시도** (§9 · PRD §5-7) — 그 다음 실패는 사용자가 누른다.
 * - **노력 수준을 작업별로 조절** (§9 위험 3 대응) — 대화 턴은 빨라야 하므로 낮게,
 *   카드 생성은 결과물이 남으므로 한 단계 높게.
 *
 * 키는 서버에서만 읽는다. `NEXT_PUBLIC_` 접두사를 절대 붙이지 않는다 (CLAUDE.md 보안 2).
 */

const MODEL = "claude-opus-5";

/** 대화 턴 — 화면에서 기다리는 시간이라 낮게. 카드 생성은 한 단계 위 */
const EFFORT_TURN = "low" as const;
const EFFORT_CARD = "medium" as const;

/** 작은 JSON만 받지만 상한을 낮게 잡으면 생각이 잘려 응답이 깨진다 */
const MAX_TOKENS = 16000;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // 키는 환경에서 읽는다 — 생성자에 하드코딩하지 않는다
  if (!client) client = new Anthropic();
  return client;
}

/** 이 제품이 무엇인지 — 모든 호출에 공통으로 깔린다 */
const BASE_SYSTEM = [
  "너는 «차곡»의 기획 도우미다. 인스타그램을 운영해야 하지만 마케팅이 본업이 아닌 1인 운영자를 돕는다.",
  "",
  "말투 규칙:",
  "- 한국어로만 답한다. 존댓말을 쓰되 딱딱하지 않게.",
  "- 마케팅 용어(타깃·퍼널·톤앤매너·인게이지먼트)를 쓰지 않는다. 사용자는 그 말을 모르고 배우고 싶어하지도 않는다.",
  "- 빈칸을 던지지 않는다. 먼저 정리해서 건네고, 사용자는 고치기만 하면 되게 한다.",
  "- 앞에 나서지 않는다. 감탄사·이모지를 남발하지 않는다.",
].join("\n");

/** 온보딩에서 받은 맥락을 시스템 프롬프트 꼬리에 붙인다 */
function contextBlock(ctx: { field: string; tone: string }): string {
  const lines = ["", "사용자 정보:"];
  lines.push(`- 만드는 콘텐츠: ${ctx.field || "(아직 안 밝힘)"}`);
  if (ctx.tone) lines.push(`- 선호하는 말투: ${ctx.tone}`);
  return lines.join("\n");
}

type CallOptions = {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  effort: typeof EFFORT_TURN | typeof EFFORT_CARD;
  /** 있으면 reply를 만들어지는 대로 흘려보낸다 */
  onText?: OnText;
};

/**
 * 아직 끝나지 않은 JSON에서 `reply` 문자열만 뽑아낸다.
 *
 * 스트리밍으로 오는 건 `{"reply":"안녕하` 같은 **깨진 JSON**이라 `JSON.parse`가 안 된다.
 * 모든 스키마가 `reply`를 첫 속성으로 두어 가장 먼저 흘러나오게 해뒀다.
 *
 * 못 찾으면 null — 그때는 스트리밍만 포기하고 완성본을 기다린다.
 * 이 함수가 틀려도 최종 결과는 `JSON.parse`가 따로 만든다.
 */
function extractPartialReply(buffer: string): string | null {
  const at = buffer.indexOf('"reply"');
  if (at < 0) return null;

  // "reply" 다음의 콜론·공백을 건너뛰고 여는 따옴표를 찾는다
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
class NonRetryableError extends Error {}

/**
 * 한 번 호출하고 JSON으로 받는다. 실패하면 **한 번만** 다시 시도한다 (§9 · PRD §5-7).
 *
 * 재시도해도 안 되면 던진다 — 호출한 route가 잡아서 「다시 시도」를 사용자에게 넘긴다.
 * 여기서 조용히 기본값을 돌려주면 사용자는 AI가 만든 줄 알게 된다.
 *
 * 재시도해도 소용없는 셋은 즉시 던진다: 요청 형식 오류·인증 실패·안전 거부.
 */
async function callJson<T>({ system, user, schema, effort, onText }: CallOptions): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const stream = getClient().messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: user }],
        thinking: { type: "adaptive" },
        output_config: {
          effort,
          format: { type: "json_schema", schema },
        },
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
        throw new NonRetryableError("AI가 이 요청에는 답하지 않았어요. 다른 주제로 해볼까요?");
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

/* ── 스키마 ────────────────────────────────────────────────
   additionalProperties: false + required로 모양을 못박는다.
   느슨하게 두면 모델이 필드를 덧붙여 파싱 이후 코드가 흔들린다.

   ⚠️ **배열 개수는 스키마로 못 정한다.** 구조화 출력은 `minItems`를 0이나 1
   외의 값으로 받지 않는다("For 'array' type, 'minItems' values other than
   0 or 1 are not supported"). 개수는 프롬프트로 요청하고 **코드에서 맞춘다.**  */

function obj(properties: Record<string, unknown>, required: string[]) {
  return { type: "object", properties, required, additionalProperties: false };
}

const STR = { type: "string" } as const;
const STR_ARRAY = { type: "array", items: STR } as const;

const GREETING_SCHEMA = obj({ reply: STR, topicSuggestions: STR_ARRAY }, [
  "reply",
  "topicSuggestions",
]);

const IDEA_SCHEMA = obj({ reply: STR, topic: STR }, ["reply", "topic"]);

const SELECTION_SCHEMA = obj(
  { reply: STR, purposes: STR_ARRAY, intent: STR, seriesTitle: STR },
  ["reply", "purposes", "intent", "seriesTitle"],
);

const CARD_SCHEMA = obj({ title: STR, shortTitle: STR, intent: STR }, [
  "title",
  "shortTitle",
  "intent",
]);

/** ② 단계 대상 후보는 AI가 만들지 않는다 — lib/audiences.ts가 단일 출처 (08-28) */
function candidates(): PlanProposal {
  return { audiences: AUDIENCES.map((a) => a.label), purposes: [] };
}

const DEFAULT_AUDIENCE_LABEL =
  AUDIENCES.find((a) => a.id === AUDIENCE_DEFAULT)?.label ?? AUDIENCES[0].label;

export const claudePlanningAI: PlanningAI = {
  async greeting(ctx, onText): Promise<PlanTurnResult> {
    const result = await callJson<{ reply: string; topicSuggestions: string[] }>({
      system: BASE_SYSTEM + contextBlock(ctx),
      user: [
        "대화를 시작하는 첫 인사를 쓰고, 오늘 올릴 만한 주제 후보 3개를 함께 내라.",
        "",
        "주제 후보 규칙 (어기면 쓸 수 없다):",
        "- **이미 사용자 안에 있는 재료만** 가리킨다 — 겪은 것 / 느낀 것 / 찍어둔 것.",
        "- 없는 걸 새로 만들게 하는 주제 금지 («노하우 공유», «해결법 정리», «비법 공개» 류).",
        "- 외부 트렌드·뉴스·콘텐츠 마케팅 템플릿에서 가져오지 않는다.",
        "- 각 후보는 **띄어쓰기 포함 16자 이내**. 칩 한 줄에 들어가야 한다.",
        "- 사용자가 만드는 콘텐츠 분야를 반영하되, 억지로 끼워 넣지 않는다.",
        "",
        "reply는 두 문장 이내. 아래에서 골라도 되고 직접 적어도 된다는 점을 알려라.",
      ].join("\n"),
      schema: GREETING_SCHEMA,
      effort: EFFORT_TURN,
      onText,
    });

    /*
      개수·길이를 스키마로 못 박았으므로 여기서 맞춘다.
      16자를 넘는 칩은 두 줄로 접혀 화면이 흔들린다 — 길이로 먼저 거르고,
      3개가 안 되면 걸러낸 것이라도 채워 넣는다(빈 칩 줄이 더 나쁘다).
    */
    const all = result.topicSuggestions.filter((t) => typeof t === "string" && t.trim());
    const fits = all.filter((t) => t.length <= 16);
    const topicSuggestions = [...fits, ...all.filter((t) => !fits.includes(t))].slice(0, 3);

    return { reply: result.reply, topicSuggestions };
  },

  async ideaTurn(idea, ctx, onText): Promise<PlanTurnResult> {
    const result = await callJson<{ reply: string; topic: string }>({
      system: BASE_SYSTEM + contextBlock(ctx),
      user: [
        "사용자가 오늘 올리고 싶은 것을 이렇게 적었다:",
        `"""${idea}"""`,
        "",
        "할 일:",
        "1. 이 말을 **주제 한 줄**로 다듬어라 (topic). 40자 이내. 사용자가 쓴 말을 살리고 새 소재를 지어내지 않는다.",
        "2. 그 주제를 받았다는 것과, 이제 «누구에게 말할지»만 정하면 된다는 것을 알리는 reply를 써라.",
        "",
        "reply 규칙: 세 문장 이내. 안 골라도 AI가 알아서 정한다는 점을 반드시 알린다.",
      ].join("\n"),
      schema: IDEA_SCHEMA,
      effort: EFFORT_TURN,
      onText,
    });

    return {
      reply: result.reply,
      topic: result.topic.slice(0, 40),
      proposal: candidates(),
    };
  },

  async selectionTurn(topic, selected, ctx, onText): Promise<PlanTurnResult> {
    // 안 고르면 AI가 정한다 (IA 2.1-②) — 빈 배열을 그대로 넘기지 않고 여기서 메운다
    const autoPicked = selected.audiences.length === 0;
    const audiences = autoPicked ? [DEFAULT_AUDIENCE_LABEL] : selected.audiences;

    const result = await callJson<{
      reply: string;
      purposes: string[];
      intent: string;
      seriesTitle: string;
    }>({
      system: BASE_SYSTEM + contextBlock(ctx),
      user: [
        `주제: ${topic}`,
        `말할 대상: ${audiences.join(", ")}`,
        autoPicked ? "(사용자가 고르지 않아 기본값으로 정했다. reply에서 그렇게 골랐다고 알려라.)" : "",
        "",
        "대상별 지시:",
        ...audiences.map((a) => `- ${a}: ${audiencePrompt(a)}`),
        "",
        "할 일:",
        "1. purposes — 이 주제를 이 대상에게 말하는 **목적**을 1~3개. 짧은 명사구로 (예: 공감 얻기, 정보 전달, 팔로우 유도). 사용자가 고르는 항목이 아니라 네가 정한다.",
        "2. intent — 이 시리즈의 기획의도를 한 문장으로. 카드 상세에만 보인다.",
        "3. seriesTitle — 나중에 카드들을 묶어 보여줄 제목. 주제를 살려 짧게.",
        "4. reply — 어떻게 정했는지 알리고, 「이대로 카드 만들기」를 누르라고 안내. 세 문장 이내.",
      ]
        .filter(Boolean)
        .join("\n"),
      schema: SELECTION_SCHEMA,
      effort: EFFORT_TURN,
      onText,
    });

    // 목적은 1~3개. 스키마로 못 정해서 여기서 자른다 — 비면 화면에 빈 자리가 남는다
    const purposes = result.purposes.filter((p) => typeof p === "string" && p.trim()).slice(0, 3);

    return {
      reply: result.reply,
      topic,
      audiences,
      purposes: purposes.length > 0 ? purposes : ["공감 얻기"],
      intent: result.intent,
      seriesTitle: result.seriesTitle,
      readyToConfirm: true,
    };
  },

  async generateCard({ topic, audience, purposes, intent }): Promise<CardDraft> {
    const result = await callJson<{ title: string; shortTitle: string; intent: string }>({
      system: BASE_SYSTEM,
      user: [
        `주제: ${topic}`,
        `이 카드의 대상: ${audience}`,
        `대상별 지시: ${audiencePrompt(audience)}`,
        purposes.length ? `목적: ${purposes.join(", ")}` : "",
        intent ? `시리즈 기획의도(참고): ${intent}` : "",
        "",
        "이 대상 한 명을 위한 게시물 카드 하나를 만들어라.",
        "",
        "- title — 게시물 제목. 대상별 지시를 반영해 이 사람에게 말 거는 제목으로.",
        "- shortTitle — **12자 이내.** 캘린더 칸이 좁아 길면 잘린다.",
        "  ⚠️ **같은 주제로 만든 다른 카드들이 캘린더에 나란히 놓인다.** 주제만 반복하면",
        "  전부 같은 글자가 되어 구분할 수 없다. **이 카드만의 각도**가 드러나게 지어라.",
        "- intent — 이 카드 하나의 기획의도 한 문장. 시리즈 기획의도를 그대로 베끼지 않는다.",
      ]
        .filter(Boolean)
        .join("\n"),
      schema: CARD_SCHEMA,
      effort: EFFORT_CARD,
    });

    return {
      title: result.title,
      // 12자 규칙은 화면이 깨지는 문제라 여기서 한 번 더 자른다 (DESIGN §8)
      shortTitle: result.shortTitle.length > 12 ? `${result.shortTitle.slice(0, 11)}…` : result.shortTitle,
      audience,
      intent: result.intent,
    };
  },
};
