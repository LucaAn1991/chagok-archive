import "server-only";

import type { CardDraft, PlanningAI, PlanProposal, PlanTurnResult } from "./types";

/**
 * 대본형 모의 AI — ANTHROPIC_API_KEY 없이 F2·F3 흐름 전체를 돌리기 위한 구현.
 *
 * 진짜 AI가 아니다. 응답은 주제 문자열을 끼워 넣은 고정 문구다.
 * 고정 문구는 어떤 주제·분야에도 성립하는 것만 쓴다 (08-27 피드백).
 * 실구현이 붙으면 후보·기획의도는 주제를 이해하고 실시간으로 만들어진다.
 */

/** 사용자가 쓴 아이디어 문장을 주제로 다듬는 흉내 — 앞뒤 공백 제거 + 길이 제한 */
function toTopic(idea: string): string {
  const trimmed = idea.trim().replace(/\s+/g, " ");
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

/** ② 단계 후보 — 어떤 주제에도 어색하지 않은 일반 문구만 */
function candidates(): PlanProposal {
  return {
    audiences: [
      "이 주제가 처음인 사람",
      "자주 접해본 사람",
      "혼자서는 방법을 모르겠는 사람",
      "이미 익숙하지만 새 자극이 필요한 사람",
    ],
    purposes: ["정보 전달", "공감 얻기", "팔로우 유도", "저장 유도"],
  };
}

export const mockPlanningAI: PlanningAI = {
  async greeting(): Promise<PlanTurnResult> {
    // ① 열린 질문 금지 — 후보 4개를 제시한다 (IA 2.1-①)
    return {
      reply: "오늘은 어떤 이야기를 해볼까요? 아래에서 골라도 되고, 직접 적어도 돼요.",
      topicSuggestions: [
        "요즘 자주 받는 질문에 답하기",
        "최근에 새로 알게 된 것 공유",
        "자주 하는 실수와 해결법",
        "나만의 루틴 공개",
      ],
    };
  },

  async ideaTurn(idea: string): Promise<PlanTurnResult> {
    const topic = toTopic(idea);
    return {
      reply: `「${topic}」 좋은데요! 누구에게 어떤 목적으로 전할지만 정하면 바로 카드로 만들 수 있어요.\n\n아래에서 골라주세요. 안 고르셔도 제가 알아서 정할게요.`,
      topic,
      proposal: candidates(),
    };
  },

  async selectionTurn(topic: string, selected: PlanProposal): Promise<PlanTurnResult> {
    // 빈 선택이면 AI가 알아서 정하고 넘어간다 (IA 2.1-②)
    const pool = candidates();
    const audiences =
      selected.audiences.length > 0 ? selected.audiences : pool.audiences.slice(0, 2);
    const purposes = selected.purposes.length > 0 ? selected.purposes : ["공감 얻기"];
    const picked = selected.audiences.length === 0 && selected.purposes.length === 0;
    const intent = `「${topic}」을(를) ${audiences[0]}의 눈높이에서 ${purposes[0]} 중심으로 풀어내는 시리즈`;

    return {
      reply: [
        picked
          ? `제가 이렇게 골랐어요 — ${audiences.join(" · ")}에게, ${purposes.join(" · ")}. 바꾸고 싶으면 기획안 카드에서 고칠 수 있어요.`
          : `${audiences.join(" · ")}에게 ${purposes.join(" · ")} 방향으로 정리했어요.`,
        "",
        "마음에 들면 아래 「이대로 카드 만들기」를 눌러주세요.",
      ].join("\n"),
      topic,
      audiences,
      purposes,
      intent,
      seriesTitle: topic,
      readyToConfirm: true,
    };
  },

  async generateCards({ topic, audiences, purposes, intent }): Promise<CardDraft[]> {
    // 주제 × 대상 — 대상마다 2장씩. 진짜 AI는 주제를 이해하고 장수·각도를 스스로 정한다
    const angles = ["첫 이야기", "한 걸음 더"];
    const short = topic.length > 9 ? `${topic.slice(0, 9)}…` : topic;
    return audiences.flatMap((audience, ai_) =>
      angles.map((angle, i) => ({
        title: `${topic} — ${audience}를 위한 ${angle}`,
        shortTitle: `${short} ${ai_ * angles.length + i + 1}`,
        audience,
        intent: intent || `「${topic}」을(를) ${audience}의 눈높이에서 ${purposes[0] ?? "공감 얻기"} 중심으로 풀어낸다`,
      })),
    );
  },
};
