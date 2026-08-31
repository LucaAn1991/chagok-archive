import type { ToneKey } from "@/types";

/**
 * 말투(tone) 정의 — 설정 화면과 AI 프롬프트의 **단일 출처** (`audiences.ts`와 같은 구조).
 *
 * - `label`  : 설정 화면 카드에 보이는 이름
 * - `sample` : 사용자가 «키»가 아니라 «문장»을 보고 고르게 하는 예시
 * - `prompt` : 실제 생성 때 프롬프트에 들어갈 지시
 *
 * 클라이언트·서버가 함께 쓴다. 비밀이 아니므로 server-only를 걸지 않는다.
 *
 * @TODO: `sample`·`prompt` 문구는 아직 확정 카피가 아니다
 *   (PLAN.md §12 「값이 비어 있는 것」 5번 — 말투 4종의 키·예시 문장 미확정).
 *   키 4개는 `User` 타입에 확정돼 있고 문구만 임시다. 확정되면 이 파일만 고치면 된다.
 */
export const TONES = [
  {
    key: "friendly",
    label: "친근한",
    sample: "오늘도 들러주셔서 고마워요. 같이 해봐요!",
    prompt: "옆에서 말 걸듯 편하게. 반말은 쓰지 않되 거리감을 두지 않는다.",
  },
  {
    key: "calm",
    label: "차분한",
    sample: "오늘은 이런 이야기를 준비했습니다.",
    prompt: "담담하고 조용하게. 과장·감탄사 없이 사실과 생각을 차례로 놓는다.",
  },
  {
    key: "energetic",
    label: "활기찬",
    sample: "자, 오늘도 시작해볼까요? 진짜 좋아요!",
    prompt: "밝고 힘 있게. 짧은 문장으로 리듬을 만든다. 다만 호들갑스럽지 않게.",
  },
  {
    key: "professional",
    label: "전문적인",
    sample: "핵심만 정리했습니다. 세 가지만 확인하세요.",
    prompt: "군더더기 없이 핵심부터. 근거와 순서를 분명히 한다. 어려운 용어는 쓰지 않는다.",
  },
] as const satisfies readonly {
  key: ToneKey;
  label: string;
  sample: string;
  prompt: string;
}[];

/**
 * 말투 → 프롬프트 지시문. 안 정했으면(null) null —
 * 지시문 자체를 넣지 않아 기본 말투로 둔다.
 */
export function toneDirective(tone: ToneKey | null): string | null {
  const meta = TONES.find((t) => t.key === tone);
  return meta ? `말투는 «${meta.label}»으로. ${meta.prompt}` : null;
}
