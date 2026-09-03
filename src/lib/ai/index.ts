import "server-only";

import type { PlanningAI } from "./types";
import { mockPlanningAI } from "./mock";
import { claudePlanningAI } from "./claude";

/**
 * AI 구현 선택 — 서버 전용.
 *
 * `ANTHROPIC_API_KEY`가 있으면 실제 Claude(`claude-opus-5`), 없으면 모의 AI다.
 * 두 구현이 같은 인터페이스라 화면·API는 어느 쪽이 붙었는지 모른다.
 *
 * `isMock`은 화면이 «지금 보는 건 샘플»이라고 알리는 데 쓴다 —
 * 가짜 응답을 진짜처럼 보이게 두면 안 된다.
 */
export function getPlanningAI(): { ai: PlanningAI; isMock: boolean } {
  if (isPlanningClaudeConfigured()) {
    return { ai: claudePlanningAI, isMock: false };
  }
  return { ai: mockPlanningAI, isMock: true };
}

/** 키가 있는지만 본다. 유효한지는 첫 호출에서 드러난다 */
export function isPlanningClaudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type {
  PlanProposal,
  PlanTurnResult,
  PlanningContext,
  RefineDraftInput,
  RefineDraftResult,
  DraftVariant,
} from "./types";
