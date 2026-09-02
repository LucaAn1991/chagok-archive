import type { StyleId } from "../../types/card";

/**
 * 분위기별 그림 에셋 명세 (09-02).
 *
 * **왜 런타임이 아니라 파일인가** — 08-31에 AI 이미지 생성(F15)을 넣었다가 같은 날
 * 되돌린 이유가 셋이었다: 장당 25~40초, 카드당 비용, 그리고 매번 다르게 나오는 결과.
 * 여기 에셋은 **`scripts/generate-style-assets.ts`로 한 번 만들어 저장소에 커밋한다.**
 * 카드를 만들 때는 파일을 읽기만 하므로 세 문제가 전부 사라진다 —
 * 지연 0, 카드당 0원, 마스코트가 장마다 달라지지 않는다.
 *
 * **낱장이 아니라 «시트»로 뽑는다.** 표정 3종을 세 번 부르면 세 번 다 다른 캐릭터가
 * 나온다. 한 장 안에 여러 칸을 그리게 하면 같은 그림체가 유지되고, 코드가 잘라 쓴다.
 *
 * **프롬프트에 글자를 넣지 말라고 못박는다.** 이미지 모델은 한글을 제대로 못 쓰고,
 * 우리는 글자를 satori로 직접 그린다 — 그림에 글자가 섞이면 두 겹이 된다.
 */

export type AssetSpec = {
  /** 저장될 파일 이름 (`src/lib/render/assets/` 안) */
  file: string;
  /** 어느 분위기가 쓰는가 */
  styleId: StyleId;
  /** 무엇에 쓰는가 — 사람이 읽는 설명 */
  purpose: string;
  /** gpt-image-2에 넘길 프롬프트. **영어로 쓴다** — 그림 모델은 영어가 훨씬 정확하다 */
  prompt: string;
  /** 1024x1024 · 1536x1024 · 1024x1536 중 하나 */
  size: "1024x1024" | "1536x1024" | "1024x1536";
  /**
   * 한 장에 여러 칸이 들어간 시트면 몇 칸인지. 1이면 통짜 그림.
   * 자르는 건 생성 스크립트가 아니라 쓰는 쪽이 한다 — 칸 경계가 딱 떨어지지 않을 수
   * 있어서, 사람이 결과를 보고 정하는 편이 안전하다.
   */
  cells: number;
  /**
   * 잘라낸 칸에 붙일 이름 — **왼쪽 위에서 오른쪽 아래 순서**다.
   * `scripts/slice-assets.ts`가 이 이름으로 낱장 파일을 만든다
   * (`mascot-poses.png` + `wave` → `mascot-wave.png`).
   *
   * 길이가 `cells`와 같아야 한다. 다르면 슬라이서가 멈춘다 —
   * 칸을 잘못 잡았다는 뜻이라 그대로 진행하면 엉뚱한 이름이 붙는다.
   */
  sliceNames: string[];
};

/**
 * 모든 프롬프트에 공통으로 붙는 요구사항.
 *
 * `배경 투명`이 가장 중요하다 — 카드 배경 위에 얹을 것이라 흰 사각형이 딸려오면
 * 쓸 수 없다. `글자 없음`이 그다음이다.
 */
const COMMON = [
  "Transparent background (alpha channel), PNG.",
  "No text, no letters, no numbers, no watermark, no signature.",
  "Isolated object only — not a scene, no ground shadow, no background elements.",
  "Centered with even margins so it can be placed on top of a colored card.",
].join(" ");

export const STYLE_ASSETS: AssetSpec[] = [
  /* ── 「도트」 (시안 1) ───────────────────────────────────── */
  {
    file: "pixel-characters.png",
    styleId: "pixel",
    purpose: "도트 캐릭터 3종 — 카드 모서리에 얹는다",
    size: "1536x1024",
    cells: 3,
    sliceNames: ["worried", "happy", "surprised"],
    prompt: [
      "A sheet of exactly 3 pixel-art character faces in a single horizontal row, evenly spaced.",
      "Each is a round ball-shaped face with a thick black pixel outline, simple dot eyes and a small mouth,",
      "and a tiny curved antenna sprout on top.",
      "Colors, left to right: soft orange, pastel pink, pastel blue.",
      "Expressions, left to right: worried with a sweat drop, cheerful smiling, wide-eyed surprised.",
      "Chunky low-resolution pixel style with visible square pixels, like a 16-bit game sprite.",
      "Flat colors, no gradients, no anti-aliasing.",
      COMMON,
    ].join(" "),
  },
  {
    file: "pixel-bubbles.png",
    styleId: "pixel",
    purpose: "픽셀 말풍선 2종 — 도형으로는 계단 모서리를 못 만든다",
    size: "1536x1024",
    cells: 2,
    sliceNames: ["left", "right"],
    prompt: [
      "A sheet of exactly 2 empty pixel-art speech bubbles side by side, evenly spaced.",
      "Rounded rectangular bubbles with a thick black stair-stepped pixel outline and a pointed tail,",
      "one tail pointing down-left, the other down-right.",
      "Fill colors: pastel mint green and pastel lavender.",
      "The inside is empty — completely blank, no lines, no writing.",
      "Chunky low-resolution pixel style with visible square pixels. Flat colors, no gradients.",
      COMMON,
    ].join(" "),
  },

  /* ── 「세일」 (시안 3) ───────────────────────────────────── */
  {
    file: "promo-digits.png",
    styleId: "promo",
    purpose: "3D 홀로그램 숫자 0~9 + % — 할인율을 크게 세울 때",
    size: "1536x1024",
    cells: 11,
    sliceNames: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "percent"],
    /*
      **11칸을 한 장에 몰아 그리게 한다.** 낱개로 열한 번 부르면 재질·광택이
      제각각이라 「50%」를 조합했을 때 5와 0이 다른 물건처럼 보인다.
      숫자는 글자가 아니라 «물체»로 지시한다 — 그래야 폰트가 아니라 3D로 나온다.
    */
    prompt: [
      "A sheet showing exactly 11 separate 3D balloon-like glossy objects arranged in a grid,",
      "shaped as the digits 0 1 2 3 4 5 6 7 8 9 and a percent sign, in that order.",
      "Treat them as inflated plastic sculptures, not typography.",
      "Iridescent holographic surface: pearlescent pink, mint, lilac and pale gold shifting across each form,",
      "with bright specular highlights and soft reflections. Smooth rounded tube-like limbs.",
      "Consistent lighting, material and scale across all 11 objects.",
      COMMON,
    ].join(" "),
  },

  /* ── 「캐릭터」 (시안 6) ─────────────────────────────────── */
  {
    file: "mascot-poses.png",
    styleId: "character",
    purpose: "마스코트 표정 3종 — 카드 아래쪽을 채운다",
    size: "1536x1024",
    cells: 3,
    sliceNames: ["wave", "point", "thumbsup"],
    /*
      마스코트는 **한 캐릭터의 세 자세**여야 한다. 따로 부르면 종이 바뀐다
      (공룡 → 도마뱀 → 개구리). 「같은 캐릭터」라고 명시하는 게 이 프롬프트의 핵심이다.
    */
    prompt: [
      "A character sheet of the SAME single mascot drawn 3 times in one horizontal row, evenly spaced.",
      "The mascot is a friendly round mint-green baby dinosaur with a cream belly,",
      "big round eyes, small triangular teeth and short stubby arms.",
      "Bold uniform dark-grey outlines, flat cel-shaded colors, simple modern sticker illustration style.",
      "Poses, left to right: waving hello, sitting and pointing forward, giving a thumbs up.",
      "Identical proportions, colors and line weight in all 3 — it must read as one character.",
      COMMON,
    ].join(" "),
  },
];

/** 한 분위기가 쓰는 에셋들 */
export function assetsFor(styleId: StyleId): AssetSpec[] {
  return STYLE_ASSETS.filter((a) => a.styleId === styleId);
}
