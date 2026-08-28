import "server-only";

import { AUDIENCES, AUDIENCE_DEFAULT, MAX_CARDS_PER_RUN } from "@/lib/audiences";
import type { CardDraft, PlanningAI, PlanProposal, PlanTurnResult } from "./types";

/**
 * 대본형 모의 AI — ANTHROPIC_API_KEY 없이 F2·F3 흐름 전체를 돌리기 위한 구현.
 *
 * 진짜 AI가 아니다. 응답은 주제 문자열을 끼워 넣은 고정 문구다.
 * 고정 문구는 어떤 주제·분야에도 성립하는 것만 쓴다 (08-27 피드백).
 * 실구현이 붙으면 후보·기획의도는 주제를 이해하고 실시간으로 만들어진다.
 */

/** 받침 유무로 조사를 고른다 — 한글이 아니면 뒤 조사를 쓴다 (예: 을/를 → 를) */
function particle(word: string, withBatchim: string, without: string): string {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return without;
  return (last - 0xac00) % 28 > 0 ? withBatchim : without;
}

/** 사용자가 쓴 아이디어 문장을 주제로 다듬는 흉내 — 앞뒤 공백 제거 + 길이 제한 */
function toTopic(idea: string): string {
  const trimmed = idea.trim().replace(/\s+/g, " ");
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

/*
 * ② 단계 후보의 단일 출처는 lib/audiences.ts다 (08-28 확정).
 * 목적은 화면에서 고르지 않는다 — 대상에 딸려오므로 AI가 정하고,
 * 기획안 카드에서 수정할 수 있다.
 */

/** 대상별 기본 목적 — 직접 입력한 대상은 공감 얻기로 둔다 */
const PURPOSE_BY_AUDIENCE: Record<string, string> = {
  "나를 아는 사람": "공감 얻기",
  "나를 모르는 사람": "팔로우 유도",
  "이 주제를 찾는 사람": "정보 전달",
};

function purposesFor(audiences: string[]): string[] {
  const picked = audiences.map((a) => PURPOSE_BY_AUDIENCE[a] ?? "공감 얻기");
  return [...new Set(picked)];
}

function candidates(): PlanProposal {
  return { audiences: AUDIENCES.map((a) => a.label), purposes: [] };
}

const DEFAULT_AUDIENCE_LABEL =
  AUDIENCES.find((a) => a.id === AUDIENCE_DEFAULT)?.label ?? AUDIENCES[0].label;

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
      reply: `「${topic}」 좋은데요! 누구에게 말할지만 정하면 바로 카드로 만들 수 있어요.\n\n아래에서 골라주세요. 안 고르셔도 제가 알아서 정할게요.`,
      topic,
      proposal: candidates(),
    };
  },

  async selectionTurn(topic: string, selected: PlanProposal): Promise<PlanTurnResult> {
    // 빈 선택이면 AI가 알아서 정하고 넘어간다 (IA 2.1-②)
    const audiences =
      selected.audiences.length > 0 ? selected.audiences : [DEFAULT_AUDIENCE_LABEL];
    // 목적은 대상에 딸려온다 (08-28 확정) — 기획안 카드에서 수정 가능
    const purposes = purposesFor(audiences);
    const picked = selected.audiences.length === 0;
    const intent = `「${topic}」${particle(topic, "을", "를")} ${audiences[0]}의 눈높이에서 ${purposes[0]} 중심으로 풀어내는 시리즈`;

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
    // 주제 × 대상 = 대상당 정확히 1장 — ② 버튼이 약속한 「카드 N장」과 맞춘다 (08-28).
    // 한 번에 만드는 상한은 MAX_CARDS_PER_RUN. 진짜 AI도 이 두 규칙을 따른다
    const short = topic.length > 9 ? `${topic.slice(0, 9)}…` : topic;
    return audiences.slice(0, MAX_CARDS_PER_RUN).map((audience, i) => ({
      title: `${topic} — ${audience}${particle(audience, "을", "를")} 위한 이야기`,
      shortTitle: `${short} ${i + 1}`,
      audience,
      intent: intent || `「${topic}」${particle(topic, "을", "를")} ${audience}의 눈높이에서 ${purposes[0] ?? "공감 얻기"} 중심으로 풀어낸다`,
    }));
  },
};
