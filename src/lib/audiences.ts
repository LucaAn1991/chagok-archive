/**
 * 대상(audience) 정의 — ② 대상 선택 단계의 단일 출처 (08-28 확정).
 *
 * - `label`  : 칩에 보이는 전부. 부제·설명·툴팁을 붙이지 않는다 — 길면 선택이 피곤해진다
 * - `prompt` : 실AI가 캡션·카드를 만들 때 프롬프트에 들어갈 서술.
 *              @TODO: lib/prompts.ts(실AI 프롬프트 조립)가 생기면 거기서 참조한다
 *
 * 클라이언트·서버가 함께 쓴다. 비밀이 아니므로 server-only를 걸지 않는다.
 */
export const AUDIENCES = [
  {
    id: "knows_me",
    label: "나를 아는 사람",
    prompt: "이미 화자를 아는 사이. 배경 설명과 자기소개 금지. 근황을 나누듯.",
  },
  {
    id: "stranger",
    label: "나를 모르는 사람",
    prompt: "화자를 처음 봄. 첫 문장에 멈춰 세울 훅. 화자가 누구인지 한 줄로 드러낼 것.",
  },
  {
    id: "seeker",
    label: "이 주제를 찾는 사람",
    prompt: "검색·해시태그 유입. 정보 밀도 최우선. 목록·숫자 허용. 검색될 단어를 본문에 포함.",
  },
] as const;

export type AudienceId = (typeof AUDIENCES)[number]["id"];

/**
 * 콘텐츠 유형 5종 — 이 밖의 값은 존재하면 안 된다 (08-31 확정).
 * 카드 표시줄 «{label}에게 · {유형}»의 유형 자리에 쓴다.
 */
export type ContentType = "신상품" | "정보/팁" | "후기/사례" | "일상/비하인드" | "이벤트/공지";

/**
 * 대상 → 기본 콘텐츠 유형. 반환 타입이 ContentType이라 5종 밖 값이 나올 수 없다.
 * @TODO: 실AI가 카드 내용을 보고 정하게 되면 이 임시 매핑은 폴백으로만 남는다
 */
export function contentTypeForAudience(label: string): ContentType {
  const meta = AUDIENCES.find((a) => a.label === label);
  if (meta?.id === "seeker") return "정보/팁";
  return "일상/비하인드";
}

export const AUDIENCE_DEFAULT = "stranger";
export const MAX_CARDS_PER_RUN = 8;

/**
 * 대상 label → 생성 지시. 기본 3종은 각자의 prompt를,
 * 사용자가 직접 쓴 대상은 아래 최소 지시를 쓴다 (08-28 확정).
 * 실AI·모의 양쪽이 이 함수 하나를 거친다.
 */
export function audiencePrompt(label: string): string {
  const meta = AUDIENCES.find((a) => a.label === label);
  if (meta) return meta.prompt;
  return `이 게시물은 "${label}"에게 하는 이야기다. 그 사람이 지금 처한 상황을 짐작해서, 그 사람만 알아들을 수 있는 구체적인 이야기로 쓸 것.`;
}


/**
 * 세분화 대상(Targeting)을 프롬프트 한 문단으로 (09-03).
 *
 * 있는 항목만 적는다 — 비운 항목은 «아무 말도 안 하는» 게 맞다. 시간대는 약한
 * 신호라 «거든다» 정도로만 말한다(말투를 통째로 바꾸라고 하지 않는다).
 * 서버(claude)·목 양쪽이 이 함수 하나를 거친다.
 */
import type { Targeting } from "@/types";

/**
 * 칩 여러 개를 한 마디로 (09-04) — `["20대","30대"]` → `20대·30대`.
 * **문자열 하나도 받는다** — 09-03에 저장된 문서를 Firestore에서 그대로 읽어
 * 넘기는 자리가 있어서, 배열만 가정하면 옛 기획의 대상이 조용히 사라진다.
 */
function joinChoices(v: string[] | string | undefined): string {
  if (!v) return "";
  return (Array.isArray(v) ? v : [v]).filter(Boolean).join("·");
}

export function targetingPrompt(t: Targeting | undefined | null): string {
  if (!t) return "";
  const bits: string[] = [];
  const age = joinChoices(t.ageRange);
  const gender = joinChoices(t.gender);
  if (age) bits.push(`이 사람은 ${age}다`);
  if (gender) bits.push(`성별은 ${gender}`);
  if (t.tone) bits.push(`말은 ${t.tone} 건넨다`);
  if (bits.length === 0 && !t.timeOfDay) return "";
  const lines = [
    bits.length ? `읽는 사람을 더 좁히면: ${bits.join(", ")}. 그에 맞는 말투·단어·예시를 골라라.` : "",
    t.timeOfDay ? `${t.timeOfDay}에 보는 콘텐츠다 — 그 시간의 결을 살짝 거들되, 억지로 시간을 언급하진 마라.` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
