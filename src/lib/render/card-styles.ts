import type { StyleId } from "../../types/card";
import type { FontId } from "../../types/user";
import type { Theme } from "./themes";
import type { Ornament } from "./ornaments";

/**
 * 카드뉴스 «비주얼 스타일» 6종 (09-02).
 *
 * **테마·템플릿과 다른 세 번째 축이다.** 셋을 헷갈리면 같은 걸 두 군데서 고르게 된다.
 *
 * | | 무엇을 정하나 | 고르는 자리 |
 * |---|---|---|
 * | **스타일** (여기) | 전체 분위기 — 색·글꼴·껍데기·문구의 말투까지 한 벌 | **기획 단계** ③ |
 * | 템플릿 (`card-templates.ts`) | 구성 — 몇 장을, 어떤 순서로 | 제작 결과 |
 * | 테마 (`themes.ts`) | 색·글자 비율만 | 제작 결과 |
 *
 * 값은 눈대중이 아니라 시안 이미지의 **주요 색을 실측해서** 옮겼다.
 *
 * **`copyRules`가 이 파일의 핵심이다.** 스타일은 색만 바꾸는 게 아니라 *문구의 길이와
 * 말투*를 바꾼다 — 「외치는」 스타일에 세 줄짜리 설명문을 넣으면 레이아웃이 무너진다.
 * 이 줄들이 카드 생성 프롬프트에 그대로 들어간다.
 *
 * **더미 문구를 담지 않는다** (`card-templates.ts`와 같은 원칙) — 틀과 «어떻게 쓸지»만
 * 담고 문구는 AI가 쓴다. DESIGN.md §0 «사용자가 빈칸부터 채우게 만든다» 금지.
 */

/* `StyleId`는 다른 id들과 같이 `types/card.ts`에 둔다 — 여기서 다시 선언하지 않는다 */
export type { StyleId };

/**
 * 이 스타일을 그리는 데 아직 없는 것.
 *
 * **비어 있으면 지금 그대로 그려진다.** 비어 있지 않으면 화면에서 「준비 중」으로
 * 내려앉는다 — 시안처럼 안 나올 걸 알면서 고르게 두면 사용자를 속이는 것이다.
 * 에셋이 들어오는 대로 이 배열만 비우면 곧바로 열린다.
 */
export type MissingAsset = {
  /** 무엇이 필요한가 */
  what: string;
  /** 왜 지금 못 만드는가 */
  why: string;
};

/*
  `Theme`에서 `id`만 빼고 물려받는다. 그대로 교차시키면 `id`가
  `ThemeId & StyleId` = `never`가 되어 아무 값도 못 넣는다.
  색·글자 규칙은 테마와 같은 모양이라 렌더러가 둘을 구분 없이 받는다.
*/
export type CardStyle = Omit<Theme, "id"> & {
  id: StyleId;
  /**
   * 이 분위기의 글꼴. 「내 스타일」에서 따로 고른 게 있으면 그쪽이 이긴다
   * (계정 톤이 가장 우선 — DESIGN.md §12).
   */
  fontId: FontId;
  /**
   * 카드 위아래에 얹는 껍데기 — 브랜드명·핸들·하단 라벨.
   * null이면 얹지 않는다. 값은 사용자 설정에서 채운다(문구를 지어내지 않는다).
   */
  chrome: { topLeft: boolean; topRight: boolean; bottom: boolean } | null;
  /** 카드 생성 프롬프트에 들어갈 줄 — 이 스타일이 문구에 거는 제약 */
  copyRules: string[];
  /**
   * 카드 위에 얹는 도형·그림 (09-02). 시안과의 거리는 대부분 여기서 좁혀진다.
   * 파일이 없는 그림은 조용히 빠지므로, 에셋이 아직 없어도 카드는 완성된다.
   */
  ornaments?: Ornament[];
  /** 비어 있으면 바로 쓸 수 있다 */
  missing: MissingAsset[];
};

/* ── 지금 그대로 그려지는 것 ─────────────────────────────── */

/** 시안 2 — #E1E1E1 33% · #000000 26% · #006AFF 20% (실측) */
const BOLD_GRAPHIC: CardStyle = {
  id: "bold-graphic",
  fontId: "black-han-sans",
  label: "대문자",
  hint: "파란 도형과 굵은 글씨 — 힘 있게 말할 때",
  color: {
    bg: "#E1E1E1",
    ink: "#000000",
    sub: "#4A4A4A",
    soft: "#D2D2D2",
    scrim: "rgba(0,0,0,0.50)",
    accent: "#006AFF",
  },
  type: { scale: 1.2, tracking: -2, lineHeight: 1.25, pad: 96, align: "left" },
  chrome: { topLeft: true, topRight: true, bottom: true },
  copyRules: [
    "제목은 두세 줄. 한 줄에 4~7자만 넣는다. 줄바꿈 위치를 직접 정한다.",
    "조사나 어미로 줄을 끝내지 않는다 — 낱말 단위로 끊는다.",
    "본문은 두 줄 이내. 설명하지 말고 단정한다.",
  ],
  /*
    시안 2의 아래쪽 두 블록. 글자 **뒤에** 깔아 바탕을 만든다 —
    앞에 두면 본문을 덮는다. 사진이 있는 장에서는 뺀다(사진이 이미 면을 채운다).
  */
  ornaments: [
    { kind: "shape", fill: "accent", radius: 0.05, x: 0.09, y: 0.74, w: 0.38, h: 0.2,
      behind: true, skipWhenImage: true, layouts: ["cover", "closing"] },
    { kind: "shape", fill: "ink", radius: 0.05, x: 0.53, y: 0.74, w: 0.38, h: 0.2,
      behind: true, skipWhenImage: true, layouts: ["cover", "closing"] },
  ],
  missing: [],
};

/** 시안 4 — #0B0B0A 14% (사진이 화면을 덮는다) */
const PHOTO_FRAME: CardStyle = {
  id: "photo-frame",
  fontId: "pretendard",
  label: "사진 위",
  hint: "찍은 사진 위에 글씨 — 가게·메뉴를 보여줄 때",
  color: {
    bg: "#0B0B0A",
    ink: "#FFFFFF",
    sub: "#D8D5D0",
    soft: "#1A1512",
    scrim: "rgba(0,0,0,0.38)",
    accent: "#F5C518",
  },
  type: { scale: 1.05, tracking: -0.5, lineHeight: 1.35, pad: 88, align: "left" },
  chrome: { topLeft: true, topRight: false, bottom: false },
  copyRules: [
    "사진이 주인공이다. 제목은 두 줄, 한 줄에 10자 안팎.",
    "사진에 이미 보이는 것을 글로 다시 말하지 않는다.",
    "강조할 낱말 하나만 고른다 — 그 낱말에만 강조색이 붙는다.",
  ],
  /*
    시안 4의 «코너 프레임» — 사진 위에 네 귀퉁이 꺾쇠를 얹어 시선을 가둔다.
    ㄱ자를 그리는 도형이 satori에 없어서 **가로·세로 막대 두 개로 한 귀퉁이**를 만든다.
  */
  ornaments: [
    { kind: "shape", fill: "ink", x: 0.26, y: 0.14, w: 0.11, h: 0.006, layouts: ["cover", "image-full"] },
    { kind: "shape", fill: "ink", x: 0.26, y: 0.14, w: 0.006, h: 0.08, layouts: ["cover", "image-full"] },
    { kind: "shape", fill: "ink", x: 0.63, y: 0.14, w: 0.11, h: 0.006, layouts: ["cover", "image-full"] },
    { kind: "shape", fill: "ink", x: 0.734, y: 0.14, w: 0.006, h: 0.08, layouts: ["cover", "image-full"] },
  ],
  missing: [],
};

/** 시안 5 — #ECEBEA 33% · #F0EFED 17% (밝은 뉴트럴) */
const SERIF_SOFT: CardStyle = {
  id: "serif-soft",
  fontId: "nanum-myeongjo",
  label: "감성",
  hint: "명조와 둥근 사진틀 — 차분하게 소개할 때",
  color: {
    bg: "#ECEBEA",
    ink: "#2A2724",
    sub: "#7A756E",
    soft: "#DDDDDB",
    scrim: "rgba(42,39,36,0.35)",
    accent: "#8A857D",
  },
  type: { scale: 1.0, tracking: 0.5, lineHeight: 1.75, pad: 136, align: "center" },
  chrome: { topLeft: true, topRight: false, bottom: true },
  copyRules: [
    "제목은 20자 안팎, 두 줄까지.",
    "본문은 3~4줄. 문장으로 쓴다 — 낱말만 던지지 않는다.",
    "담담하게. 느낌표를 쓰지 않는다.",
  ],
  /*
    시안 5의 아치. satori에 «위만 둥근 마스크»가 없어서 **아주 큰 둥글기의 면**을
    글자 뒤에 깔아 근사한다 — 아래쪽 곡률까지 같지는 않다(§Ⓑ의 한계).
  */
  ornaments: [
    { kind: "shape", fill: "soft", radius: 0.3, x: 0.3, y: 0.2, w: 0.4, h: 0.44,
      behind: true, skipWhenImage: true, layouts: ["cover"] },
  ],
  missing: [],
};

/* ── 에셋이 있어야 시안대로 나오는 것 ────────────────────── */

/** 시안 3 — #000000 53% · 파스텔 홀로그램(#CAF8F8 · #F7CAE5) */
const PROMO: CardStyle = {
  id: "promo",
  fontId: "pretendard",
  label: "세일",
  hint: "검정 바탕에 큰 숫자 — 할인·이벤트를 알릴 때",
  color: {
    bg: "#000000",
    ink: "#FFFFFF",
    sub: "#B9B9B9",
    soft: "#141414",
    scrim: "rgba(0,0,0,0.55)",
    accent: "#F7CAE5",
  },
  type: { scale: 1.35, tracking: -1, lineHeight: 1.2, pad: 96, align: "center" },
  chrome: { topLeft: false, topRight: false, bottom: true },
  copyRules: [
    "숫자를 앞에 세운다 — 할인율·기간·수량 중 하나가 반드시 제목에 들어간다.",
    "제목 위에 한 줄 안내를 붙인다(무엇에 대한 행사인지).",
    "본문은 한 줄. 조건이 있으면 그 조건만 적는다.",
  ],
  /*
    숫자 그림은 09-02에 만들었다(`assets/promo-0.png` … `promo-percent.png`).
    다만 지금은 **장식으로 % 하나만** 얹는다 — 제목의 숫자를 뽑아 그림으로
    조립하는 건 별개 작업이고, 그때 이 자리를 대체한다.
    @TODO: 제목에서 숫자를 찾아 promo-*.png로 조립 (「50%」 → 5·0·% 세 장)
  */
  ornaments: [
    { kind: "image", file: "promo-percent.png", x: 0.62, y: 0.6, w: 0.3,
      rotate: -10, layouts: ["cover"], skipWhenImage: true },
  ],
  missing: [],
};

/** 시안 1 — #FEFEFE 48% · #FEEFC5 12% · 파스텔 말풍선 */
const PIXEL: CardStyle = {
  id: "pixel",
  fontId: "galmuri",
  label: "도트",
  hint: "픽셀 그림과 말풍선 — 가볍고 장난스럽게",
  color: {
    bg: "#FEEFC5",
    ink: "#030303",
    sub: "#5A5A5A",
    soft: "#FFFFFF",
    scrim: "rgba(3,3,3,0.40)",
    accent: "#B6D3FF",
  },
  type: { scale: 1.1, tracking: 0, lineHeight: 1.5, pad: 104, align: "center" },
  chrome: { topLeft: true, topRight: false, bottom: false },
  copyRules: [
    "짧게. 제목 한 줄, 본문 한두 줄.",
    "말하듯 쓴다 — 문어체를 쓰지 않는다.",
    "이모지를 쓰지 않는다. 분위기는 그림이 낸다.",
  ],
  /*
    시안 1처럼 캐릭터를 모서리에 흩는다. 말풍선은 **글자 뒤**에 깔아
    글이 그 안에 놓인 것처럼 보이게 한다 — 진짜로 담는 건 아니고, 크기가
    문구 길이를 따라가지 않으므로 넘칠 수 있다(Ⓑ의 한계).
  */
  ornaments: [
    { kind: "image", file: "pixel-worried.png", x: 0.04, y: 0.06, w: 0.17, rotate: -8,
      layouts: ["cover"] },
    { kind: "image", file: "pixel-happy.png", x: 0.79, y: 0.74, w: 0.17, rotate: 6,
      layouts: ["cover"] },
    { kind: "image", file: "pixel-surprised.png", x: 0.8, y: 0.05, w: 0.15, rotate: 10,
      layouts: ["text-only", "list"] },
    { kind: "image", file: "pixel-left.png", x: 0.1, y: 0.28, w: 0.8, behind: true,
      skipWhenImage: true, layouts: ["text-only"] },
  ],
  // 픽셀 글꼴은 갈무리 11(OFL)로, 그림은 gpt-image-2로 — 09-02에 둘 다 해결
  missing: [],
};

/** 시안 6 — #FEFEFE 43% · #CACACA 16% · 점선 카드 */
const CHARACTER: CardStyle = {
  id: "character",
  fontId: "pretendard",
  label: "캐릭터",
  hint: "점선 카드와 마스코트 — 편하게 설명할 때",
  color: {
    bg: "#CACACA",
    ink: "#3A3939",
    sub: "#7C7C7C",
    soft: "#FEFEFE",
    scrim: "rgba(58,57,57,0.40)",
    accent: "#F2705B",
  },
  type: { scale: 1.05, tracking: -0.5, lineHeight: 1.45, pad: 112, align: "center" },
  chrome: { topLeft: false, topRight: false, bottom: false },
  copyRules: [
    "설명하는 말투. 한 장에 한 가지만 말한다.",
    "제목은 두 줄까지, 아래 줄을 더 굵게 쓴다.",
    "본문은 두 줄 이내로 짧게.",
  ],
  /*
    시안 6의 흰 카드면 + 마스코트. 카드면을 **글자 뒤**에 깔고 그 위에 글을 얹는다.
    점선 테두리는 satori가 `borderStyle: dashed`를 지원하지 않아 실선으로 간다.
    자세는 장마다 바꿔 같은 그림이 반복되지 않게 한다.
  */
  ornaments: [
    { kind: "shape", fill: "soft", radius: 0.04, x: 0.06, y: 0.06, w: 0.88, h: 0.88,
      border: { width: 3, color: "sub" }, behind: true },
    { kind: "image", file: "mascot-wave.png", x: 0.6, y: 0.56, w: 0.26, layouts: ["cover"] },
    { kind: "image", file: "mascot-point.png", x: 0.66, y: 0.62, w: 0.25,
      layouts: ["text-only"], skipWhenImage: true },
    { kind: "image", file: "mascot-thumbsup.png", x: 0.64, y: 0.6, w: 0.26, layouts: ["closing"] },
  ],
  // 마스코트를 09-02에 gpt-image-2로 만들었다 (`assets/mascot-*.png`)
  missing: [],
};

export const CARD_STYLES: Record<StyleId, CardStyle> = {
  "bold-graphic": BOLD_GRAPHIC,
  "photo-frame": PHOTO_FRAME,
  "serif-soft": SERIF_SOFT,
  promo: PROMO,
  pixel: PIXEL,
  character: CHARACTER,
};

/**
 * 화면에 그릴 순서 — **지금 쓸 수 있는 것이 앞**이다.
 * 「준비 중」이 맨 앞에 오면 고를 수 없는 것부터 보게 된다.
 */
export const STYLE_ORDER: StyleId[] = [
  "bold-graphic",
  "photo-frame",
  "serif-soft",
  "promo",
  "pixel",
  "character",
];

export const DEFAULT_STYLE_ID: StyleId = "bold-graphic";

/** 에셋이 다 갖춰져 지금 고를 수 있는가 */
export function isReady(style: CardStyle): boolean {
  return style.missing.length === 0;
}

/** 모르는 값이 들어와도 화면이 비지 않게 한다 — 옛 카드엔 styleId가 아예 없다 */
export function resolveStyle(id: string | undefined | null): CardStyle {
  return CARD_STYLES[id as StyleId] ?? CARD_STYLES[DEFAULT_STYLE_ID];
}
