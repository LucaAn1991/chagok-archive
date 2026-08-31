import type { ThemeId } from "../../types/card";
import type { Brand, StyleAttributes } from "../../types/user";

/**
 * 카드뉴스 산출물의 «테마» 3종 — 색과 글자 비율.
 *
 * **UI 팔레트와 별개다.** PRD.md §3 — *"UI 팔레트는 도구를 쓸 때 보는 색이지
 * 산출물의 색이 아니다. 사용자가 만드는 카드뉴스가 베리색일 필요는 없다."*
 * PLAN.md 08-28도 «게시물 캔버스 안 색은 브랜드 토큰의 의도적 예외»로 못박았다.
 * 그래서 DESIGN.md §0의 «색 하드코딩 금지»가 여기엔 적용되지 않는다 —
 * CSS 변수는 브라우저 안에서만 살고, 여기 값은 satori가 PNG로 굽는다.
 *
 * 3종의 이름은 새로 짓지 않았다. PLAN.md 08-28에서 이미 확정한
 * visual direction 3종(Warm Lifestyle · Modern Editorial · Clean Typography)이고,
 * `lib/style-examples.ts`의 `Direction`과 **같은 id를 쓴다** — 어휘가 두 벌이 되면
 * 온보딩에서 고른 취향과 산출물 테마가 결국 어긋난다.
 *
 * 사용자에게는 내부 이름을 보여주지 않는다 (style-examples.ts와 같은 원칙).
 * `label`·`hint`가 화면에 나가는 문구다.
 */

export type Theme = {
  id: ThemeId;
  /** 화면에 보이는 이름 — 내부 이름(warm·editorial…)은 노출하지 않는다 */
  label: string;
  /** 칩 아래 한 줄 설명 */
  hint: string;
  color: {
    bg: string;
    ink: string;
    sub: string;
    /** 사진이 없을 때의 자리 면 · list의 번호 원 */
    soft: string;
    /** image-full 글자 가독용 덮개 */
    scrim: string;
    /**
     * 강조색 (08-31). 슬롯 툴바에서 「강조」를 고른 글자에 쓴다.
     * 「내 스타일」이 없으면 테마의 기본 강조색을 쓴다.
     */
    accent: string;
  };
  type: {
    /** 모든 글자 크기에 곱한다. 레이아웃 구조는 건드리지 않는다 */
    scale: number;
    /** 자간(px). 음수면 좁아진다 */
    tracking: number;
    /** 본문 줄 간격 */
    lineHeight: number;
    /** 캔버스 안쪽 여백(px) */
    pad: number;
    /**
     * 글자 정렬. **글자만 있는 레이아웃(cover·text-only)에만 적용한다** —
     * list나 image-top까지 가운데로 몰면 목록이 읽기 어려워진다.
     */
    align: "left" | "center";
  };
};

export const THEMES: Record<ThemeId, Theme> = {
  warm: {
    id: "warm",
    label: "포근한",
    hint: "베이지 바탕에 넉넉한 여백",
    color: {
      bg: "#FBF7F2",
      ink: "#3A322C",
      sub: "#8A7F76",
      soft: "#F0E9E1",
      scrim: "rgba(58,50,44,0.42)",
      accent: "#A8705A", // 베이지와 어울리는 흙빛
    },
    type: { scale: 0.95, tracking: 0.5, lineHeight: 1.7, pad: 112, align: "left" },
  },
  editorial: {
    id: "editorial",
    label: "또렷한",
    hint: "흰 바탕에 크고 굵은 제목",
    color: {
      bg: "#FFFFFF",
      ink: "#14100F",
      sub: "#6B6360",
      soft: "#F1EFEE",
      scrim: "rgba(0,0,0,0.50)",
      accent: "#14100F", // 흑백 대비가 이 테마의 성격이다
    },
    type: { scale: 1.1, tracking: -1, lineHeight: 1.5, pad: 88, align: "left" },
  },
  graphic: {
    id: "graphic",
    label: "글자 중심",
    hint: "글씨를 크게, 가운데로",
    color: {
      bg: "#F2F0EB",
      ink: "#1C1B19",
      sub: "#7A756E",
      soft: "#E4E1DA",
      scrim: "rgba(28,27,25,0.45)",
      accent: "#7A756E",
    },
    type: { scale: 1.25, tracking: -0.5, lineHeight: 1.5, pad: 120, align: "center" },
  },
};

/** 화면에서 칩을 그릴 때 쓰는 순서 — 기본값이 맨 앞이 아니라 늘 같은 순서로 둔다 */
export const THEME_ORDER: ThemeId[] = ["warm", "editorial", "graphic"];

export const DEFAULT_THEME_ID: ThemeId = "warm";

/** 모르는 값이 들어와도 화면이 비지 않게 한다 — 옛 카드엔 themeId가 아예 없다 */
export function resolveTheme(id: string | undefined | null): Theme {
  return THEMES[id as ThemeId] ?? THEMES[DEFAULT_THEME_ID];
}

/**
 * 온보딩에서 고른 취향(`users/{uid}.visualPreferences.attributes`)을
 * 테마 하나로 옮긴다 — 지금까지 수집만 하고 쓰이지 않던 값이다.
 *
 * 고른 예시가 여러 개라 표를 세어 가장 많은 쪽을 고른다.
 * 동점이면 「포근한」 — 셋 중 가장 무난해서 처음 보는 사람이 덜 놀란다.
 */
export function themeFromAttributes(attributes: StyleAttributes[] | undefined | null): ThemeId {
  if (!attributes || attributes.length === 0) return DEFAULT_THEME_ID;

  const votes: Record<ThemeId, number> = { warm: 0, editorial: 0, graphic: 0 };

  for (const a of attributes) {
    if (a.imageUsage === "none" || a.typography === "clean-type" || a.typography === "oversized") {
      votes.graphic += 1;
    } else if (
      a.typography === "expressive" ||
      a.decoration === "editorial" ||
      a.decoration === "high-contrast" ||
      a.mood === "modern" ||
      a.mood === "curated"
    ) {
      votes.editorial += 1;
    } else {
      votes.warm += 1;
    }
  }

  // 동점이면 THEME_ORDER의 앞선 것이 이긴다 — warm이 맨 앞이라 기본값과 같아진다
  return THEME_ORDER.reduce((best, id) => (votes[id] > votes[best] ? id : best), DEFAULT_THEME_ID);
}

/* ── 「내 스타일」 적용 ──────────────────────────────────── */

/** `#RRGGBB` 인지. 세 자리 축약(#abc)은 받지 않는다 — 저장할 때 여섯 자리로 맞춘다 */
export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

/** 0~1. WCAG 상대 휘도 — 대비 계산의 근거 (DESIGN.md §15) */
function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * 배경색에 얹을 글자색을 **고르지 않고 계산한다.**
 *
 * 사용자가 배경과 글자를 둘 다 고르면 「연회색 배경 + 연노랑 글자」 같은 조합이
 * 나와서 DESIGN.md §15의 대비 기준을 못 넘긴다. 그래서 배경만 받고,
 * 어두운 먹과 흰색 중 **대비가 큰 쪽**을 쓴다. 어떤 색을 넣어도 항상 읽힌다.
 *
 * 먹은 순수 검정(#000)이 아니라 `--ink` 계열이다 — 순수 검정은 종이 위에서
 * 눈이 아프고, 이 제품의 톤과도 안 맞는다(DESIGN.md §2).
 */
const INK_DARK = "#2D292B";
const INK_LIGHT = "#FFFFFF";

export function inkFor(bg: string): string {
  return contrast(bg, INK_DARK) >= contrast(bg, INK_LIGHT) ? INK_DARK : INK_LIGHT;
}

/** 보조 글자색 — 본문보다 여리게. 배경 쪽으로 섞어 만든다 */
function subFor(bg: string, ink: string): string {
  const mix = (i: number) => {
    const a = parseInt(ink.slice(i, i + 2), 16);
    const b = parseInt(bg.slice(i, i + 2), 16);
    return Math.round(a * 0.62 + b * 0.38)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

/** 사진이 없을 때의 자리 면 — 배경보다 살짝 진하게 */
function softFor(bg: string, ink: string): string {
  const mix = (i: number) => {
    const a = parseInt(ink.slice(i, i + 2), 16);
    const b = parseInt(bg.slice(i, i + 2), 16);
    return Math.round(a * 0.12 + b * 0.88)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

/**
 * 테마 위에 「내 스타일」을 덮는다 (08-31).
 *
 * **글자 비율(크기·자간·여백·정렬)은 테마 것을 그대로 둔다** — 브랜드가 정하는 건
 * 색과 폰트지 레이아웃 감각이 아니다. 브랜드가 없으면 테마가 그대로 쓰인다.
 */
export function applyBrand(theme: Theme, brand?: Brand | null): Theme {
  if (!brand || !isHexColor(brand.bg)) return theme;

  const bg = brand.bg;
  const ink = inkFor(bg);
  return {
    ...theme,
    color: {
      bg,
      ink,
      sub: subFor(bg, ink),
      soft: softFor(bg, ink),
      // 사진 위 덮개는 늘 어둡게 — 밝은 사진에서 흰 글자가 읽히려면 필요하다
      scrim: "rgba(0,0,0,0.45)",
      // 강조색은 사용자가 고른 것을 그대로 쓴다. 작은 면에만 쓰이므로
      // 배경과 붙어도 §15의 «텍스트 대비»를 크게 해치지 않는다
      accent: isHexColor(brand.accent) ? brand.accent : theme.color.accent,
    },
  };
}
