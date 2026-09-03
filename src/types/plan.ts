import type { Timestamp } from "firebase/firestore";
import type { StockPick, StyleId } from "./card";

/**
 * 대상별 기획안 — ③ 단계 산출물 (09-02).
 *
 * **이건 원래도 만들고 있던 값이다.** 예전에는 「이대로 카드 만들기」를 누르는 순간
 * `generateCard()`가 대상마다 돌아 곧바로 카드로 저장됐다 — 사용자는 자기가 뭘 받게
 * 될지 **보지 못한 채** 결과를 받았다. 그 중간 산출물을 화면으로 꺼낸 것이 이 타입이다.
 *
 * 흐름: ③ 대상마다 하나씩 만든다 → ④ 여러 개 고른다 → ⑤ 고른 것만 다듬는다
 *       → ⑧ `chosen`인 것만 카드가 된다.
 *
 * 다듬기(⑤)는 **건너뛸 수 있다.** 대상을 셋 고르면 다듬기도 세 번인데, 매번 강제하면
 * 그 자리가 곧 이탈 구간이 된다. 안 다듬으면 ③에서 만든 값이 그대로 카드가 된다.
 */
/**
 * 대상 세분화 (09-03) — 「누구에게」를 더 좁힌다. 전부 선택이라 비워도 된다.
 *
 * 지금 「대상」(audience)은 «관계»(나를 아는/모르는/찾는)인데, 여기에 «누구인지»를
 * 더한다. 카피 말투·단어가 「20대 여성」과 「40대 남성」에서 달라야 하기 때문이다.
 *
 * **다듬기(⑤)에서 받는다.** 필수 질문지로 세우지 않는다 — 「빈칸을 주지 않는다」는
 * 채워 넣기가 아니라 «막다른 화면을 안 준다»는 뜻이다. 비우면 지금처럼 흐른다.
 *
 * 카드까지 그대로 물려줘서(`Card.targeting`) **제작 시 문구 생성**에도 쓴다 —
 * 다듬기 대화만 좋아지고 정작 카드 글자는 안 바뀌면 반쪽이다.
 */
export type Targeting = {
  /** 연령대. 예: "20대". 카피 말투에 가장 크게 작용 */
  ageRange?: string;
  /** 성별. "여성" | "남성" | 비우면 무관 */
  gender?: string;
  /** 말투 결. 예: "가볍게" | "진지하게" | "전문가처럼" | "친근하게" */
  tone?: string;
  /** 보는 시간대. 예: "저녁". 약한 신호라 «거든다» 수준으로만 쓴다 */
  timeOfDay?: string;
};

/**
 * 홍보 대상 (09-03) — 카드의 브랜드/상품 자리에 넣을 이름.
 *
 * 브랜드명은 «회사 이름»이면 안 바뀌지만 «상품명»이면 기획마다 다르다 —
 * 그래서 계정에 박아두지 않고 **기획 단계(⑤)에서 받는다.**
 *
 * 자리에 들어갈 값의 우선순위:
 *   ① brandName (홍보 O)  → 그대로
 *   ② handle (홍보 X)      → 인스타 계정명 @handle
 *   ③ 둘 다 비움          → 계정 닉네임(이메일 앞부분). 서버가 그때 채운다
 */
export type Promo = {
  /** 홍보하려는 상품·브랜드명. 있으면 브랜드 자리에 이걸 넣는다 */
  brandName?: string;
  /** 인스타그램 계정명(@ 없이). 홍보 대상이 없을 때 브랜드 자리에 쓴다 */
  handle?: string;
};

export type PlanDraft = {
  /** 이 기획안의 대상. `plan.audiences` 중 하나 */
  audience: string;
  /** 게시물 제목. ⑤에서 고칠 수 있다 */
  title: string;
  /** 캘린더 월간 칸용 12자 (DESIGN §8). 제목이 바뀌면 함께 다시 짓는다 */
  shortTitle: string;
  /** 이 카드 하나의 기획의도. ⑤에서 고칠 수 있다 */
  intent: string;
  /**
   * ⑤에서 더한 «이번에 꼭 넣을 것». 카드의 `extraNote`로 그대로 넘어가
   * 슬라이드 문구 프롬프트에 들어간다 (`lib/ai/sheet-copy.ts`).
   */
  extraNote: string;
  /**
   * ⑤에서 정한 카드 장수. null이면 템플릿이 정한다(4~7장).
   *
   * **4~7장 밖은 받지 않는다.** 템플릿 한 벌이 6장인데 표지가 고정이라,
   * 그보다 적으면 이야기가 안 되고 많으면 쓸 시트가 없다.
   * 범위를 벗어난 값은 조용히 깎지 말고 **왜 안 되는지 그 자리에서 말한다.**
   */
  slideCount: number | null;
  /** ④에서 골랐나. 고른 것만 카드가 된다 */
  chosen: boolean;
  /** ⑤에서 좁힌 대상 (09-03). 비어 있을 수 있다 */
  targeting?: Targeting;
  /** ⑤에서 받은 홍보 대상 (상품·브랜드명 / 인스타 계정명) (09-03) */
  promo?: Promo;
};

/**
 * 다듬기 후보 — **바꿀 거리를 미리 차려준다** (09-02).
 *
 * 빈 입력창만 주면 사용자는 무엇을 고칠 수 있는지 모른다. ③에서 기획안을 차려주고
 * ⑤에서만 빈칸을 주는 것은 앞뒤가 안 맞는다 (DESIGN.md §1 「빈칸을 주지 않는다」,
 * IA 2.1 「열린 질문 금지」).
 *
 * 같은 주제·같은 대상을 **다른 각도로** 다시 잡은 것들이다. 골라도 되고, 이걸 보고
 * «이런 것도 되는구나» 알고 나서 직접 적어도 된다.
 */
export type DraftVariant = {
  /** 무엇이 다른지 한마디로 (예: 「경고보다 준비물 중심으로」) */
  angle: string;
  title: string;
  shortTitle: string;
  intent: string;
};

/** 기획 세션. 대화 1회 = plan 1건 → card N장 */
export type Plan = {
  id: string; // 자동 생성 ID
  userId: string; // 소유자 uid

  type: PlanType; // 'series' 일반 기획 | 'record' 기록형(F12)

  topic: string; // 주제. ① 단계에서 확정
  audiences: string[]; // 대상. ② 단계 멀티 선택 (라벨 후보 3개 + 기타 직접 입력)
  purposes: string[]; // 목적. 선택하지 않는다 — AI가 대상에 맞춰 정함, 기획안 카드에서 수정
  intent: string; // 기획의도. AI가 생성. 카드 상세에서만 노출 (DESIGN.md §6)

  /**
   * 대상별 기획안 (09-02). ③에서 만들고 ④에서 고른다. 비어 있으면 아직 ②까지만 온 기획.
   *
   * **확정(⑧) 때 AI를 다시 부르지 않는다** — 여기 있는 값을 그대로 카드로 옮긴다.
   * 예전에는 confirm이 대상마다 `generateCard()`를 돌려서 누른 뒤 한참을 기다렸다.
   */
  drafts: PlanDraft[];
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
   * 기획 단계에서 고른 스톡 사진 (09-01 · **09-02에 여러 장으로**).
   *
   * 후보는 주제로 Pexels를 검색해 만든다 (`GET /api/plans/[planId]/stock`).
   * 카드를 만들 때 **주소와 출처를 그대로 물려준다** — 사진처럼 한 벌만 둔다.
   *
   * **한 장에서 여러 장으로 늘렸다 (09-02).** 카드뉴스가 4~7장인데 사진이 한 장뿐이면
   * 같은 그림이 계속 나온다. 올린 사진과 함께 시안의 사진 자리를 채우는 재료가 된다
   * (폴백 사슬은 그대로 — 올린 사진이 먼저다, DESIGN §12).
   */
  stockPhotos: StockPick[];

  /**
   * 고른 비주얼 스타일 (09-02). ③ 단계에서 정한다. 고르지 않았으면 null.
   *
   * **여기서 한 번만 고른다.** 이 기획에서 나온 카드 전부가 같은 값을 물려받아서
   * (`card.styleId`) 한 묶음으로 보인다. 카드마다 다시 고르게 하면 시리즈가
   * 제각각이 되고, 「좁혀주는 제품」(제품 원칙)과도 어긋난다.
   *
   * 색·글꼴만 정하는 게 아니라 **문구의 길이와 말투까지** 정한다 —
   * 각 스타일의 `copyRules`가 카드 생성 프롬프트에 들어간다
   * (`lib/render/card-styles.ts`).
   */
  styleId: StyleId | null;

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
