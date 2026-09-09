import { AUDIENCES } from "@/lib/audiences";

/**
 * 사용자 원문 → 주제 (09-09 확정).
 *
 * 예전에는 사용자가 적은 말을 Claude가 「주제 한 줄」로 다듬었다(`ideaTurn`). 그 호출에
 * 온보딩 분야가 컨텍스트로 붙어 있어, 짧게 적으면 분야로 빈칸을 메운 주제가 나왔다
 * (「요즘 생각」 → 「고양이와 지내며 드는 요즘 생각」). 지금은 **AI를 부르지 않고
 * 원문을 그대로 주제로 쓴다.** 요약·바꿔 쓰기를 하지 않는다 — 공백만 정리하고
 * 너무 길면 뒤를 자른다. 분야는 ② 목적·의도를 정할 때만 참고한다(`selectionTurn`).
 *
 * 클라이언트·서버가 함께 읽는다. 비밀이 아니므로 server-only를 걸지 않는다.
 */

/**
 * 주제 길이 상한. 온보딩 「콘텐츠 방향」과 같은 200자 — 주제는 프롬프트와 지난 기획
 * 목록에만 쓰이고, 목록은 따로 줄여 보여주므로(`shortenForList`) 이 정도면 넉넉하다.
 */
export const TOPIC_MAX_LENGTH = 200;

/** 공백만 정리하고 상한을 넘으면 자른다. 말을 바꾸지 않는다 */
export function topicFromText(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  return normalized.length > TOPIC_MAX_LENGTH ? normalized.slice(0, TOPIC_MAX_LENGTH) : normalized;
}

/**
 * 주제를 받았을 때의 고정 답변. 예전 `ideaTurn`이 AI에게 시키던 것과 같은 내용이다 —
 * 받았다는 것, 이제 «누구에게 말할지»만 고르면 된다는 것, 안 골라도 정해준다는 것.
 * @TODO: [실제 카피 확인 필요 — 모의 AI의 문장을 다음 단계(기획안)에 맞게 손본 임시 문구]
 */
export const TOPIC_ACCEPTED_REPLY =
  "좋아요, 이 이야기로 정리해볼게요. 이제 누구에게 말할지만 골라주세요. 안 고르셔도 제가 알아서 정할게요.";

/**
 * ② 대상 후보 — 고정 목록 (08-28 확정, lib/audiences.ts 단일 출처).
 * 예전에도 AI가 정하지 않았다 — `ideaTurn`이 이 목록을 그대로 돌려줬을 뿐이다.
 */
export function audienceCandidates(): { audiences: string[]; purposes: string[] } {
  return { audiences: AUDIENCES.map((a) => a.label), purposes: [] };
}
