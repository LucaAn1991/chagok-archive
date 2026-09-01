import type { Timestamp } from "firebase/firestore";
import type { StockPick } from "./card";

/** 기획 세션. 대화 1회 = plan 1건 → card N장 */
export type Plan = {
  id: string; // 자동 생성 ID
  userId: string; // 소유자 uid

  type: PlanType; // 'series' 일반 기획 | 'record' 기록형(F12)

  topic: string; // 주제. ① 단계에서 확정
  audiences: string[]; // 대상. ② 단계 멀티 선택 (라벨 후보 3개 + 기타 직접 입력)
  purposes: string[]; // 목적. 선택하지 않는다 — AI가 대상에 맞춰 정함, 기획안 카드에서 수정
  intent: string; // 기획의도. AI가 생성. 카드 상세에서만 노출 (DESIGN.md §6)
  seriesTitle: string; // 시리즈 제목. 놓친 카드 화면에서 묶는 기준

  messages: PlanMessage[]; // 대화 히스토리 전문. 「지난 기획 상세」에서 그대로 보여준다
  cardCount: number; // 생성된 카드 수. 하한 1 · 상한 없음

  /**
   * 기획 단계에서 올린 사진 (08-31). 순서 = 배열 순서.
   *
   * 카드를 만들 때 **주소만 물려준다** — 대상이 3명이면 카드가 3장인데
   * 같은 사진을 3벌 저장할 이유가 없다. 파일은 `plans/{planId}/photos/`에 한 번만 있다.
   *
   * 스톡은 여기 담기지 않는다 — 출처(사진가·사진 페이지)를 함께 들고 있어야 해서
   * 문자열 배열에 섞을 수 없다. 고른 스톡은 아래 `stockPhoto`에 따로 둔다.
   */
  photoUrls: string[];

  /**
   * 기획 단계에서 고른 스톡 사진 한 장 (09-01). 고르지 않았으면 null.
   *
   * 후보는 주제로 Pexels를 검색해 만든다 (`GET /api/plans/[planId]/stock`).
   * 카드를 만들 때 **주소와 출처를 그대로 물려준다** — 사진처럼 한 벌만 둔다.
   *
   * 제작 단계의 스톡 검색을 대체하지 않는다. 이건 «첫 장»이고,
   * 나머지 이미지 자리는 슬라이드 내용에 맞춰 따로 찾는다 (`lib/ai/slides.ts`).
   */
  stockPhoto: StockPick | null;

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
  /** 'system'은 상태 변경 기록(주제 변경 등) — 말풍선이 아니라 가운데 라인으로 그린다 (08-28) */
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: Timestamp;
};
