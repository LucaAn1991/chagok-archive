import type { LayoutId, Slide, SlotStyle } from "../types/card";

/**
 * 레이아웃 6종의 «슬롯 규칙» — 서버와 화면이 **같은 정의를 본다**.
 *
 * 이 파일에 `server-only`를 붙이지 않는 이유가 그것이다. 규칙이 두 벌이면
 * 화면에서는 고를 수 있는데 서버가 거부하는(또는 그 반대) 일이 생긴다.
 * AI 생성(`lib/ai/slides.ts`)도 여기서 가져다 쓴다.
 */

/** 화면에 보이는 이름 — 내부 id(cover·image-top…)는 노출하지 않는다 */
export const LAYOUT_LABELS: Record<LayoutId, string> = {
  cover: "표지",
  "text-only": "글자만",
  "image-top": "사진 위 · 글 아래",
  "image-full": "사진 전면",
  list: "번호 목록",
  closing: "마무리",
};

/**
 * 레이아웃별로 렌더러가 **실제로 읽는** 텍스트 슬롯 (`lib/render/layouts.ts`).
 * 여기 없는 키를 넣으면 조용히 사라지고, 빠뜨리면 그 자리가 빈다.
 */
export const LAYOUT_SLOTS: Record<LayoutId, string[]> = {
  cover: ["title", "subtitle"],
  "text-only": ["title", "body"],
  "image-top": ["title", "body"],
  "image-full": ["title"],
  list: ["title", "item1", "item2", "item3", "item4"],
  closing: ["message", "cta"],
};

export const ALL_LAYOUTS = Object.keys(LAYOUT_SLOTS) as LayoutId[];

/**
 * 레이아웃이 슬롯마다 정한 **기준 글자 크기** (1080 캔버스 기준, px).
 *
 * 렌더러(`lib/render/layouts.ts`)와 편집기가 **같은 표를 본다.**
 * 전에는 렌더러 안에 숫자로 박혀 있어서, 편집칸이 상자 높이로 크기를 어림잡았고
 * 레이아웃 모드에서 «치는 동안»과 «그려진 뒤»가 달라 보였다 (08-31).
 *
 * 실제로 그려지는 크기는 여기에 테마 배율과 슬롯 조절 배율이 곱해진 값이다.
 */
export const LAYOUT_FONT_SIZE: Record<LayoutId, Record<string, number>> = {
  cover: { title: 76, subtitle: 34 },
  "text-only": { title: 52, body: 36 },
  "image-top": { title: 46, body: 32 },
  "image-full": { title: 52 },
  list: { title: 48, item1: 34, item2: 34, item3: 34, item4: 34 },
  closing: { message: 56, cta: 34 },
};

/** 사진을 넣는 레이아웃 — 나머지는 사진이 있어도 자리가 없다 */
export const IMAGE_LAYOUTS: LayoutId[] = ["image-top", "image-full"];

/**
 * 사진이 없는 이미지 레이아웃은 회색 빈 면이 된다 (`lib/render/layouts.ts`의 `imageArea`).
 * 그래서 글자만 있는 레이아웃으로 내려앉힌다 — 빈 면보다 낫다 (DESIGN §12 폴백 사슬).
 */
export const DOWNGRADE: Record<string, LayoutId> = {
  "image-top": "text-only",
  "image-full": "text-only",
};

export const TEXT_ONLY_LAYOUTS: LayoutId[] = ["cover", "text-only", "list", "closing"];

/**
 * 슬롯이 «하는 일». 이름이 달라도 역할이 같으면 문구를 그대로 옮길 수 있다 —
 * 표지의 `subtitle`과 마무리의 `cta`는 둘 다 «큰 줄 아래 받쳐주는 한 줄»이다.
 *
 * 이 짝짓기가 없으면 레이아웃을 바꿀 때마다 문구가 사라져서,
 * 고를 수 있는 레이아웃이 사실상 없어진다.
 */
type SlotRole = "primary" | "secondary" | "item";

const SLOT_ROLE: Record<string, SlotRole> = {
  title: "primary",
  message: "primary",
  subtitle: "secondary",
  body: "secondary",
  cta: "secondary",
  item1: "item",
  item2: "item",
  item3: "item",
  item4: "item",
};

function slotsOfRole(layoutId: LayoutId, role: SlotRole): string[] {
  return LAYOUT_SLOTS[layoutId].filter((k) => SLOT_ROLE[k] === role);
}

/**
 * 지금 문구를 새 레이아웃의 슬롯으로 옮긴다.
 *
 * **들어갈 자리가 없는 문구가 하나라도 생기면 `null`** — 조용히 지우지 않는다.
 * 부르는 쪽(화면·서버)은 null이면 그 레이아웃을 «못 고르는 것»으로 다룬다.
 *
 * 예) 「글자만」(title·body)에서 「사진 전면」(title)으로 갈 때 body가 비어 있으면
 * 옮길 수 있고, 뭔가 적혀 있으면 버릴 곳이 없으므로 null이다.
 */
export function remapTexts(
  from: LayoutId,
  to: LayoutId,
  texts: Record<string, string>,
): Record<string, string> | null {
  if (from === to) return texts;

  const next: Record<string, string> = {};

  for (const role of ["primary", "secondary", "item"] as SlotRole[]) {
    // 채워져 있는 값만 옮긴다 — 빈 슬롯은 자리를 차지하지 않는다
    const filled = slotsOfRole(from, role)
      .map((k) => texts[k])
      .filter((v): v is string => Boolean(v && v.trim()));

    const targets = slotsOfRole(to, role);
    if (filled.length > targets.length) return null; // 갈 곳이 없다

    filled.forEach((v, i) => {
      next[targets[i]] = v;
    });
  }

  return next;
}

/**
 * 문구를 옮길 때 **슬롯 조절값도 같이 옮긴다** (08-31).
 *
 * 안 그러면 「제목을 크게」 해둔 게 레이아웃을 바꾸는 순간 사라진다.
 * `remapTexts`와 같은 역할 짝짓기를 쓰므로 결과가 어긋나지 않는다.
 */
export function remapOverrides(
  from: LayoutId,
  to: LayoutId,
  texts: Record<string, string>,
  overrides: Record<string, SlotStyle> | undefined,
): Record<string, SlotStyle> | undefined {
  if (!overrides || Object.keys(overrides).length === 0) return undefined;
  if (from === to) return overrides;

  const next: Record<string, SlotStyle> = {};
  for (const role of ["primary", "secondary", "item"] as SlotRole[]) {
    const fromSlots = slotsOfRole(from, role).filter((k) => texts[k]?.trim());
    const toSlots = slotsOfRole(to, role);
    fromSlots.forEach((k, i) => {
      const target = toSlots[i];
      if (target && overrides[k]) next[target] = overrides[k];
    });
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** 왜 못 고르는지 — 화면에 그대로 보여준다 */
export type LayoutOption = {
  id: LayoutId;
  label: string;
  /** 고를 수 없으면 이유, 고를 수 있으면 null */
  disabledReason: string | null;
  /** 골랐을 때 문구가 어떻게 옮겨지는지. 못 고르면 null */
  nextTexts: Record<string, string> | null;
};

/**
 * 이 슬라이드에서 고를 수 있는 레이아웃을 판정한다.
 *
 * 막는 경우는 둘뿐이다 —
 * ① 사진이 없는데 사진 레이아웃 (회색 빈 면이 된다)
 * ② 지금 적힌 문구가 들어갈 자리가 없는 레이아웃 (문구를 잃는다)
 */
export function layoutOptionsFor(slide: Pick<Slide, "layoutId" | "texts" | "imageUrl">): LayoutOption[] {
  return ALL_LAYOUTS.map((id) => {
    const label = LAYOUT_LABELS[id];

    if (IMAGE_LAYOUTS.includes(id) && !slide.imageUrl) {
      return { id, label, disabledReason: "사진이 없어요", nextTexts: null };
    }

    const nextTexts = remapTexts(slide.layoutId, id, slide.texts);
    if (!nextTexts) {
      return { id, label, disabledReason: "지금 문구가 들어갈 자리가 없어요", nextTexts: null };
    }

    return { id, label, disabledReason: null, nextTexts };
  });
}
