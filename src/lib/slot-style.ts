import type { SlotStyle } from "../types/card";
import type { FontId } from "../types/user";

/** 줄마다 고를 수 있는 폰트 — 값은 `lib/render/font-registry.ts`와 같아야 한다 */
export const FONT_IDS = [
  "pretendard",
  "nanum-square-neo",
  "nanum-myeongjo",
  "custom",
] as const satisfies readonly FontId[];

/**
 * 슬롯별 글자 조절 — 툴바가 고르는 값 (08-31 · DESIGN.md §12).
 *
 * **전부 «몇 단계 중 하나»다.** 숫자를 자유롭게 넣게 하면 §0의
 * «요소마다 자유값으로 바꾸게 한다» 금지에 걸리고, 실제로도 디자인이 무너진다
 * (제목 12px, 본문 200px 같은 조합이 나온다).
 *
 * 색을 `#RRGGBB`로 받지 않고 **역할 3종**으로 받는 것도 같은 이유다.
 * 브랜드 색이 바뀌면 이미 만든 카드도 따라 바뀌어야 하는데,
 * 색을 박아두면 그 카드만 옛 색으로 남는다.
 *
 * 서버·화면·렌더러가 이 파일 하나를 본다.
 */

export const SIZE_STEPS = ["xs", "s", "m", "l", "xl"] as const;
export const WEIGHTS = ["regular", "bold"] as const;
export const ALIGNS = ["left", "center", "right"] as const;
export const COLORS = ["ink", "sub", "accent"] as const;
export const TRACKINGS = ["tight", "normal", "wide"] as const;
export const LINE_HEIGHTS = ["tight", "normal", "loose"] as const;
export const OPACITIES = ["100", "75", "50", "25"] as const;

/** 기준 크기에 곱한다. 레이아웃이 정한 «제목이 본문보다 크다»는 관계는 유지된다 */
export const SIZE_SCALE: Record<(typeof SIZE_STEPS)[number], number> = {
  xs: 0.72,
  s: 0.86,
  m: 1,
  l: 1.2,
  xl: 1.45,
};

/** 테마의 자간에 더한다(px). 테마마다 기준이 달라서 곱하지 않고 더한다 */
export const TRACKING_DELTA: Record<(typeof TRACKINGS)[number], number> = {
  tight: -1.5,
  normal: 0,
  wide: 2,
};

export const SIZE_LABELS: Record<(typeof SIZE_STEPS)[number], string> = {
  xs: "아주 작게",
  s: "작게",
  m: "보통",
  l: "크게",
  xl: "아주 크게",
};

export const ALIGN_LABELS: Record<(typeof ALIGNS)[number], string> = {
  left: "왼쪽",
  center: "가운데",
  right: "오른쪽",
};

export const COLOR_LABELS: Record<(typeof COLORS)[number], string> = {
  ink: "기본",
  sub: "여리게",
  accent: "강조",
};

export const TRACKING_LABELS: Record<(typeof TRACKINGS)[number], string> = {
  tight: "좁게",
  normal: "보통",
  wide: "넓게",
};

/** 줄 간격 배수 — 테마 값을 덮는다 */
export const LINE_HEIGHT_VALUE: Record<(typeof LINE_HEIGHTS)[number], number> = {
  tight: 1.15,
  normal: 1.4,
  loose: 1.75,
};

export const LINE_HEIGHT_LABELS: Record<(typeof LINE_HEIGHTS)[number], string> = {
  tight: "좁게",
  normal: "보통",
  loose: "넓게",
};

export const OPACITY_VALUE: Record<(typeof OPACITIES)[number], number> = {
  "100": 1,
  "75": 0.75,
  "50": 0.5,
  "25": 0.25,
};

/** 아무것도 안 고른 상태 — 레이아웃·테마가 정한 그대로 그린다 */
/**
 * 아무것도 안 고른 상태 — 레이아웃·테마가 정한 그대로 그린다.
 *
 * 타입을 `Required`로 좁히지 않는다. 조절값을 덮어쓴 결과가 이 상수의
 * 리터럴 타입("m" 하나)으로 좁혀지면 «크게»를 못 넣는다.
 */
export type ResolvedSlotStyle = {
  size: (typeof SIZE_STEPS)[number];
  weight: (typeof WEIGHTS)[number];
  align: (typeof ALIGNS)[number];
  color: (typeof COLORS)[number];
  tracking: (typeof TRACKINGS)[number];
  lineHeight: (typeof LINE_HEIGHTS)[number];
  opacity: (typeof OPACITIES)[number];
  underline: boolean;
  strike: boolean;
  colorHex?: string;
  fontId?: SlotStyle["fontId"];
};

export const DEFAULT_SLOT_STYLE: ResolvedSlotStyle = {
  size: "m",
  weight: "regular",
  align: "left",
  color: "ink",
  tracking: "normal",
  underline: false,
  strike: false,
  lineHeight: "normal",
  opacity: "100",
};

/**
 * 값이 정해진 것 중 하나인지 확인하고, 아닌 키는 버린다.
 * 서버가 이걸로 요청을 거른다 — 화면이 막아둔 것을 믿지 않는다.
 */
export function parseSlotStyle(raw: unknown): SlotStyle | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const out: SlotStyle = {};

  const pick = <T extends readonly string[]>(v: unknown, allowed: T) =>
    typeof v === "string" && (allowed as readonly string[]).includes(v)
      ? (v as T[number])
      : undefined;

  const size = pick(r.size, SIZE_STEPS);
  const weight = pick(r.weight, WEIGHTS);
  const align = pick(r.align, ALIGNS);
  const color = pick(r.color, COLORS);
  const tracking = pick(r.tracking, TRACKINGS);
  const lineHeight = pick(r.lineHeight, LINE_HEIGHTS);
  const opacity = pick(r.opacity, OPACITIES);
  const fontId = pick(r.fontId, FONT_IDS);

  if (size) out.size = size;
  if (weight) out.weight = weight;
  if (align) out.align = align;
  if (color) out.color = color;
  if (tracking) out.tracking = tracking;
  if (lineHeight) out.lineHeight = lineHeight;
  if (opacity) out.opacity = opacity;
  if (fontId) out.fontId = fontId;
  if (r.underline === true) out.underline = true;
  if (r.strike === true) out.strike = true;
  // 직접 찍은 색은 형식이 맞을 때만 — 아니면 역할 색으로 그린다
  if (typeof r.colorHex === "string" && /^#[0-9a-fA-F]{6}$/.test(r.colorHex)) {
    out.colorHex = r.colorHex.toUpperCase();
  }

  // 아무 값도 못 건졌으면 «조절 없음»으로 본다 — 빈 객체를 저장할 이유가 없다
  return Object.keys(out).length > 0 ? out : null;
}

/** 이 슬롯이 기본값에서 벗어나 있는가 — 화면에 「조절됨」을 표시하려고 */
export function isAdjusted(style: SlotStyle | undefined): boolean {
  return Boolean(style && Object.keys(style).length > 0);
}
