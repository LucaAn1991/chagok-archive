import type { FontId } from "./user";

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

  /**
   * 올릴 날짜 'YYYY-MM-DD' — **없을 수 있다** (09-01 홈 분류 개편).
   * 날짜를 정하지 않은 카드가 정상 상태다 — 임의의 기본 날짜를 넣지 않는다.
   * 캘린더 배치(F4)·홈 「날짜 정해주기」가 부여하고, 캘린더 드래그로 바꾼다.
   */
  scheduledDate?: string;
  status: CardStatus;
  publishIntent: PublishIntent; // status와 별개 필드 (DESIGN.md §11)

  /**
   * 산출물 테마 (08-31). 카드 한 장 전체에 같은 테마가 적용된다 —
   * 슬라이드마다 다른 테마를 주면 한 묶음으로 안 보인다.
   * 생성 시 온보딩 취향에서 정해지고, 제작 결과 화면에서 바꿀 수 있다.
   */
  themeId: ThemeId;
  /**
   * 이 카드만의 배경색 (08-31). `#RRGGBB` · 없으면 계정의 「내 스타일」을 따른다.
   *
   * 계정 스타일이 기본이고 이건 예외다 — 「이번 건만 어둡게」 같은 경우를 위해 둔다.
   * **글자색은 여기서도 저장하지 않는다.** 배경 명도로 계산한다 (DESIGN.md §12).
   */
  bgOverride?: string | null;
  /** 구성 템플릿 (08-31). null이면 AI가 장수·순서를 알아서 정한다 */
  templateId: TemplateId | null;
  /**
   * 비주얼 스타일 (09-02). **기획 단계에서 고른 값이 그대로 넘어온다** —
   * 카드마다 다시 고르지 않는다. 한 기획에서 나온 카드는 같은 분위기여야
   * 한 묶음으로 보인다.
   *
   * null이면 고르지 않은 것 — 옛 카드가 전부 여기 해당하고, 그때는 `themeId`로 그린다.
   */
  styleId: StyleId | null;
  visualType: VisualType; // 이미지 폴백 사슬의 판정 결과 (DESIGN.md §12)
  photoUrls: string[]; // 사용자가 올린 사진. 순서 = 배열 순서 (F13)
  /**
   * 기획 단계에서 고른 스톡 사진 (09-01). 고르지 않았으면 null.
   *
   * 폴백 사슬(DESIGN §12) 안에서의 자리: 올린 사진을 먼저 다 쓰고,
   * 남은 이미지 자리의 **첫 장**을 이걸로 채운다. 그 뒤는 슬라이드 내용에 맞춰
   * 검색한 스톡이 이어받는다 (`lib/ai/slides.ts`).
   */
  stockPhoto: StockPick | null;
  extraNote: string; // «이번에 꼭 넣을 내용» 자유 입력 (F13)
  templateVars: Record<string, string>; // 기록형의 그날 값. plan.templateVarNames와 짝을 이룬다

  caption: Caption | null; // 캡션 생성(F7) 전에는 null
  slides: Slide[]; // 카드뉴스 5~8장 (F8). 생성 전에는 빈 배열

  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt: Timestamp | null; // 「올렸어요」를 누른 시각. 발행률 집계의 근거
};

/**
 * 제작 대기 → 업로드 대기 → 발행 완료
 *     └──────────┴──────→ 버림 (어느 단계에서든)
 *
 * 「제작 중」은 없다. 렌더링이 0.05초라 로딩이지 상태가 아니다 (DESIGN.md §11).
 * 「제작 완료(crafted)」도 없앴다 (08-31) — 제작이 끝나면 바로 업로드 대기다.
 *   발행 의향의 '아니오'·'미응답' 구분은 publishIntent가 따로 든다.
 * overdue도 상태가 아니다 — scheduledDate < today && status != 'published' 로 계산한다.
 */
export type CardStatus =
  | "planned"
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
  /**
   * 슬롯별 글자 조절 (08-31 · DESIGN.md §12). 키는 슬롯 이름(`title`·`body`…).
   *
   * **없는 슬롯은 레이아웃·테마가 정한 그대로 그린다.** 전부 «몇 단계 중 하나»고
   * 자유값이 아니다 — 색도 `#RRGGBB`가 아니라 역할 3종(기본·여리게·강조)이라
   * 브랜드 색을 바꾸면 이미 만든 카드도 따라 바뀐다.
   *
   * 값의 뜻과 검증은 `lib/slot-style.ts`.
   */
  styleOverrides?: Record<string, SlotStyle>;
  /**
   * 자유 배치 요소 (08-31 · 편집기).
   *
   * **있으면 레이아웃 대신 이걸로 그린다.** 슬라이드마다 켤 수 있고,
   * 끄면(이 필드를 지우면) 다시 `layoutId`가 정한 대로 돌아간다 —
   * 레이아웃·테마·템플릿을 걷어내지 않으려는 것이다.
   *
   * 좌표는 **0~1 비율**이다. 캔버스가 1080이든 편집 화면이 320이든 같은 값을 쓴다.
   */
  elements?: SlideElement[];

  /**
   * 이 장의 그림이 **어떻게 만들어졌는가** (09-02).
   *
   * - `rendered` — 우리 렌더러(satori)가 `layoutId`·`texts`로 그린다. **기본값**이고
   *   옛 카드가 전부 여기 해당한다. 값이 없으면 이것으로 본다.
   * - `generated` — 시안 템플릿의 글자를 바꿔 만든 완성 PNG. `generatedUrl`에 주소가 있다.
   *
   * **왜 남기는가** — 이미지 생성은 장마다 실패할 수 있어서(6장 중 1~2장이 실측),
   * 실패한 장은 렌더러로 물러선다. 한 카드 안에 두 종류가 섞이므로 **어느 장이
   * 어느 쪽인지** 알아야 「이 장만 다시 만들기」가 가능하다.
   */
  origin?: SlideOrigin;
  /**
   * 완성된 카드 이미지 주소 (09-02). `origin === 'generated'`일 때만 채워진다.
   *
   * ⚠️ **`imageUrl`과 다르다.** `imageUrl`은 슬라이드 «안에 들어가는 사진»이고,
   * 이건 글자까지 다 얹힌 **한 장 전체**다. 이름을 헷갈리면 사진 자리에 완성 카드가
   * 들어가는 사고가 난다.
   *
   * 파일은 `cards/{cardId}/slides/{order}.png` (PLAN §7).
   */
  generatedUrl?: string | null;
  /**
   * 어느 템플릿 장을 **쓰기로 했는가** (0부터). `origin`과 무관하게 남긴다 —
   * 시안 생성이 실패해 렌더러로 물러선 장도 「이 장 다시 만들기」를 누르면
   * 같은 템플릿으로 돌아가야 한다 (`lib/render/template-sheets.ts`).
   */
  sheetIndex?: number | null;
  /**
   * 그 템플릿 장의 글자 자리에 넣기로 한 문구 (09-02). 슬롯 순서 그대로.
   *
   * **다시 만들 때 그대로 쓴다.** `texts`는 렌더러 슬롯에 맞춰 옮겨 담은 것이라
   * 시안 슬롯으로 되돌릴 수 없다 — 「제목 / 본문」 둘로 뭉개진 값에서
   * 「배지 · 큰 제목 · 부제 · 하단 영문」 네 자리를 복원할 방법이 없다.
   */
  sheetLines?: string[] | null;
};

/**
 * 그림을 만든 방식 (09-02).
 *
 * 기본은 `rendered`다 — 값이 없는 옛 카드도 그렇게 읽는다.
 * `generated`가 실패하면 그 장만 `rendered`로 내려앉는다
 * (DESIGN.md §12 「어디서 멈춰도 완성된다」).
 */
export type SlideOrigin = "rendered" | "generated";

/**
 * 자유 배치 요소 하나.
 *
 * `slot`은 «원래 어느 줄이었는지»다. 문구 편집칸과 이어 두려고 남긴다 —
 * 자유 배치로 바꿔도 「제목」이 뭔지는 알아야 한다.
 */
export type SlideElement = {
  id: string;
  kind: "text" | "image" | "shape";
  /** 0~1 비율. 왼쪽 위 기준 */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 겹칠 때 순서. 클수록 위 */
  z: number;
  /** kind가 'text'일 때 */
  text?: string;
  slot?: string;
  style?: SlotStyle;
  /** kind가 'image'일 때. null이면 회색 면 */
  imageUrl?: string | null;
  /**
   * kind가 'shape'일 때의 모서리 둥글기 (08-31). 짧은 변 대비 0~0.5 비율.
   *
   * **도형 종류를 따로 두지 않는다.** 0이면 사각형, 0.5면 원, 그 사이면
   * 둥근 사각형이고, 납작하게 줄이면 선이 된다. 종류를 나누면 «원을 타원으로»
   * 같은 경우에 규칙이 하나 더 생긴다.
   *
   * 색·투명도는 `style`(colorHex·color·opacity)을 글자와 똑같이 쓴다.
   */
  radius?: number;
};

/** 슬롯 하나의 조절값. 안 고른 항목은 없다 (undefined) */
export type SlotStyle = {
  size?: "xs" | "s" | "m" | "l" | "xl";
  /**
   * 글자 크기를 px로 직접 (08-31). **있으면 `size` 단계를 이긴다.**
   * 1080 캔버스 기준이라 «그려지는 그 크기»다 — 테마 배율도 곱하지 않는다.
   */
  sizePx?: number;
  weight?: "regular" | "bold";
  align?: "left" | "center" | "right";
  /** 역할 색 — 브랜드 색이 바뀌면 따라 바뀐다 */
  color?: "ink" | "sub" | "accent";
  /**
   * 직접 찍은 색 `#RRGGBB` (08-31). **있으면 `color`보다 이긴다.**
   * 역할 색과 달리 브랜드를 바꿔도 따라오지 않는다 — 그게 «직접 찍었다»는 뜻이다.
   */
  colorHex?: string;
  tracking?: "tight" | "normal" | "wide";
  underline?: boolean;
  strike?: boolean;
  lineHeight?: "tight" | "normal" | "loose";
  /** 흐리게 — 100·75·50·25 (%) */
  opacity?: "100" | "75" | "50" | "25";
  /** 이 줄만 다른 폰트 (08-31). 없으면 계정의 「내 스타일」 폰트 */
  fontId?: FontId;
};

/** 스톡 사진 출처 — 사진가 이름과 사진 페이지 주소 */
export type StockCredit = {
  photographer: string;
  sourceUrl: string;
};

/**
 * 기획 단계에서 **사용자가 직접 고른** 스톡 사진 한 장 (09-01).
 *
 * 주소만 들고 있으면 안 된다 — Pexels 약관이 사진가 크레딧을 요구하는데,
 * 나중에 이 주소로 사진가를 되찾을 방법이 없다 (`lib/stock/index.ts`).
 */
export type StockPick = StockCredit & { imageUrl: string };

/**
 * 카드뉴스 «테마» 3종 (08-31 신설).
 *
 * 레이아웃이 «무엇을 어디에 놓는가»라면 테마는 «어떤 색·글자 비율로 그리는가»다.
 * 레이아웃과 마찬가지로 **고르는 것만 가능하고 직접 만들 수는 없다** —
 * 색을 직접 지정하게 하면 DESIGN.md §0의 «디자인 편집기 아님»을 어긴다.
 *
 * id는 온보딩 취향의 `Direction`(lib/style-examples.ts)과 같은 말을 쓴다.
 * 실제 색·글자 값은 `lib/render/themes.ts`.
 */
export type ThemeId = "warm" | "editorial" | "graphic";

/**
 * 카드뉴스 «구성» 템플릿 (08-31).
 *
 * 몇 장을 어떤 순서로, 각 장이 무슨 일을 하는지. `null`이면 **AI가 알아서 구성한다**
 * (지금까지의 방식) — 옛 카드가 전부 여기 해당한다.
 *
 * id는 `lib/style-examples.ts`의 `ContentFormat`과 같은 말을 쓴다.
 * 실제 구성은 `lib/card-templates.ts`.
 */
export type TemplateId = "informational" | "diary" | "statement" | "editorial";

/**
 * 카드뉴스 «비주얼 스타일» 6종 (09-02). **기획 단계에서 고른다.**
 *
 * 템플릿이 «몇 장을 어떤 순서로»라면 스타일은 **«어떤 분위기로»**다 —
 * 색·글꼴·껍데기에 더해 **문구의 길이와 말투까지** 한 벌로 정한다.
 * 테마(`ThemeId`)가 색·글자 비율만 다루는 것보다 넓다.
 *
 * `null`이면 고르지 않은 것 — 옛 카드가 전부 여기 해당한다. 실제 값은
 * `lib/render/card-styles.ts`.
 */
export type StyleId =
  | "bold-graphic"
  | "photo-frame"
  | "serif-soft"
  | "promo"
  | "pixel"
  | "character";

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
