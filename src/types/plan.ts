import type { Timestamp } from "firebase/firestore";

/** 기획 세션. 대화 1회 = plan 1건 → card N장 */
export type Plan = {
  id: string; // 자동 생성 ID
  userId: string; // 소유자 uid

  type: PlanType; // 'series' 일반 기획 | 'record' 기록형(F12)

  topic: string; // 주제. ① 단계에서 확정
  audiences: string[]; // 대상. ② 단계 멀티 선택 (후보 4~5개 + 기타 직접 입력)
  purposes: string[]; // 목적. ② 단계 멀티 선택
  intent: string; // 기획의도. AI가 생성. 카드 상세에서만 노출 (DESIGN.md §6)
  seriesTitle: string; // 시리즈 제목. 놓친 카드 화면에서 묶는 기준

  messages: PlanMessage[]; // 대화 히스토리 전문. 「지난 기획 상세」에서 그대로 보여준다
  cardCount: number; // 생성된 카드 수. 하한 1 · 상한 없음

  /** 기록형(type='record')일 때만 채워진다 */
  recordDays: number | null; // 며칠치를 미리 깔지. @TODO: PRD §9 미결 5 — 3개월이면 90장
  templateVarNames: string[]; // 템플릿 변수 이름 목록. 카드 상세에서 입력칸이 자동 렌더링된다

  status: PlanStatus; // 'draft' 대화 중 | 'confirmed' 확정되어 카드가 생성됨
  createdAt: Timestamp; // TTV 측정 시작점 (PRD §5-3)
  confirmedAt: Timestamp | null;
};

export type PlanType = "series" | "record";
export type PlanStatus = "draft" | "confirmed";

export type PlanMessage = {
  role: "user" | "assistant";
  text: string;
  createdAt: Timestamp;
};
