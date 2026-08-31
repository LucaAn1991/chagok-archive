import type { Timestamp } from "firebase/firestore";

/** 콘텐츠 카드 — 만들고 올리는 단위. 발행률의 분모가 된다 */
export type Card = {
  id: string; // 자동 생성 ID
  userId: string; // 소유자 uid. 캘린더 조회의 기준
  planId: string; // 생성 출처. 카드 상세 → 「지난 기획 상세」로 이동

  title: string; // 카드 주제 (전체 길이)
  shortTitle: string; // 12자 내외. 캘린더 월간 칸이 좁아 원 제목은 6~9자에서 잘린다
  audience: string; // 이 카드가 겨냥한 대상 1개 (plan.audiences 중 하나)
  intent: string; // 기획의도. 카드 상세에서만 노출

  scheduledDate: string; // 예정일 'YYYY-MM-DD'. 캘린더 배치(F4)가 부여, 드래그로 변경
  status: CardStatus;
  publishIntent: PublishIntent; // status와 별개 필드 (DESIGN.md §11)

  visualType: VisualType; // 이미지 폴백 사슬의 판정 결과 (DESIGN.md §12)
  photoUrls: string[]; // 사용자가 올린 사진. 순서 = 배열 순서 (F13)
  extraNote: string; // «이번에 꼭 넣을 내용» 자유 입력 (F13)
  templateVars: Record<string, string>; // 기록형의 그날 값. plan.templateVarNames와 짝을 이룬다

  caption: Caption | null; // 캡션 생성(F7) 전에는 null
  slides: Slide[]; // 카드뉴스 5~8장 (F8). 생성 전에는 빈 배열

  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt: Timestamp | null; // 「올렸어요」를 누른 시각. 발행률 집계의 근거
};

/**
 * 기획 완료 → 제작 완료 → 업로드 대기 → 발행 완료
 *     └───────────┴────────────┴──────→ 버림 (어느 단계에서든)
 *
 * 「제작 중」은 없다. 렌더링이 0.05초라 로딩이지 상태가 아니다 (DESIGN.md §11).
 * overdue도 상태가 아니다 — scheduledDate < today && status != 'published' 로 계산한다.
 */
export type CardStatus =
  | "planned"
  | "crafted"
  | "pending"
  | "published"
  | "discarded";

/** status와 합치면 「제작 완료」가 '아니오'와 '미응답' 둘을 뜻하게 되어 분모가 흐려진다 */
export type PublishIntent = null | "yes" | "no";

export type VisualType =
  | "user_photo_preferred"
  | "stock_recommended"
  | "text_only";

export type Caption = {
  hook: string; // 첫 문장
  body: string;
  cta: string;
  hashtags: string[]; // 칩으로 표시 · 삭제·추가 가능
};

export type Slide = {
  order: number; // 0부터. 순서 변경 시 이 값을 다시 매긴다
  layoutId: LayoutId; // 레이아웃 6종 중 하나
  texts: Record<string, string>; // 레이아웃의 텍스트 슬롯별 내용. 글자 «내용»만 수정 가능
  imageUrl: string | null; // 'text-only'면 null
  /**
   * 스톡 사진을 쓴 슬라이드의 출처 (08-31).
   *
   * **Pexels API 약관이 사진가 크레딧을 요구한다.** 나중에 표시하려 할 때
   * 다시 조회할 방법이 없으므로 생성 시점에 함께 저장한다.
   * 사용자 사진이거나 사진이 없으면 null.
   */
  imageCredit?: StockCredit | null;
};

/** 스톡 사진 출처 — 사진가 이름과 사진 페이지 주소 */
export type StockCredit = {
  photographer: string;
  sourceUrl: string;
};

/**
 * 카드뉴스 레이아웃 6종 (PLAN.md §2-3, 08-27 확정).
 * 사용자는 6종 중 «고르는» 것만 가능하고 직접 만들 수는 없다 (DESIGN.md §12).
 */
export type LayoutId =
  | "cover" // 표지 — 첫 장. 캡션의 hook을 크게 싣는다
  | "text-only" // 글자만. 이미지 폴백 3순위의 착지점 (DESIGN.md §12)
  | "image-top" // 위 이미지 + 아래 글
  | "image-full" // 전면 이미지 + 오버레이 글
  | "list" // 번호 목록 — «3가지 이유» 같은 구조
  | "closing"; // 마무리 — 캡션의 cta·팔로우 유도
// @TODO: 각 레이아웃의 texts 슬롯 키·여백·글자 크기·이미지 비율은 시안 대기 (DESIGN.md §18)
