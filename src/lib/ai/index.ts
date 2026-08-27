import "server-only";

import type { PlanningAI } from "./types";
import { mockPlanningAI } from "./mock";

/**
 * AI 구현 선택 — 서버 전용.
 *
 * 지금은 항상 모의 AI다 (ANTHROPIC_API_KEY 발급 전).
 * @TODO: 키 발급 후 — @anthropic-ai/sdk 설치(허락 필요) + claude-opus-5 실구현(PLAN §9)을
 *        만들고, ANTHROPIC_API_KEY 유무로 여기서 분기한다. 화면·API는 손대지 않는다.
 */
export function getPlanningAI(): { ai: PlanningAI; isMock: boolean } {
  return { ai: mockPlanningAI, isMock: true };
}

export type { PlanProposal, PlanTurnResult, PlanningContext } from "./types";
