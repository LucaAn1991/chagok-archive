import { LAYOUT_SLOTS } from "./slide-layout";
import type { LayoutId, Slide, SlideElement } from "../types/card";

/**
 * 자유 배치로 «전환»할 때 쓰는 시작 좌표 (08-31 · 편집기).
 *
 * **왜 표로 적어두는가** — 지금 레이아웃은 flexbox가 자동으로 배치한다.
 * 그래서 «제목이 실제로 어디에 그려졌는지»를 코드가 알 수 없다(satori가
 * 계산 결과를 돌려주지 않는다). 자유 배치로 바꾸려면 좌표가 있어야 하므로,
 * 각 레이아웃이 «대략 이쯤»인 상자를 손으로 적어둔다.
 *
 * 전환 직후 모습이 원래와 100% 같지는 않다. **그래도 괜찮다** —
 * 자유 배치로 바꾼다는 건 이제부터 직접 옮기겠다는 뜻이고,
 * 이건 그 출발점이다.
 *
 * 값은 0~1 비율이다.
 */

type Box = { x: number; y: number; w: number; h: number };

const P = 0.1; // 좌우 여백 비율 — 테마의 pad(88~120 / 1080)와 비슷하게 잡았다

const LAYOUT_BOXES: Record<LayoutId, Record<string, Box>> = {
  cover: {
    title: { x: P, y: 0.34, w: 1 - P * 2, h: 0.22 },
    subtitle: { x: P, y: 0.58, w: 1 - P * 2, h: 0.07 },
  },
  "text-only": {
    title: { x: P, y: 0.3, w: 1 - P * 2, h: 0.13 },
    body: { x: P, y: 0.46, w: 1 - P * 2, h: 0.24 },
  },
  "image-top": {
    // 이미지가 위 절반을 차지한다 (렌더러의 height 560 / 1080)
    title: { x: P, y: 0.6, w: 1 - P * 2, h: 0.1 },
    body: { x: P, y: 0.72, w: 1 - P * 2, h: 0.16 },
  },
  "image-full": {
    title: { x: P, y: 0.72, w: 1 - P * 2, h: 0.16 },
  },
  list: {
    title: { x: P, y: 0.12, w: 1 - P * 2, h: 0.1 },
    item1: { x: P, y: 0.3, w: 1 - P * 2, h: 0.09 },
    item2: { x: P, y: 0.42, w: 1 - P * 2, h: 0.09 },
    item3: { x: P, y: 0.54, w: 1 - P * 2, h: 0.09 },
    item4: { x: P, y: 0.66, w: 1 - P * 2, h: 0.09 },
  },
  closing: {
    message: { x: P, y: 0.38, w: 1 - P * 2, h: 0.18 },
    cta: { x: P, y: 0.6, w: 1 - P * 2, h: 0.07 },
  },
};

/** 사진이 차지하던 자리 — 자유 배치로 가도 사진은 남아야 한다 */
const IMAGE_BOXES: Partial<Record<LayoutId, Box>> = {
  "image-top": { x: 0, y: 0, w: 1, h: 0.52 },
  "image-full": { x: 0, y: 0, w: 1, h: 1 },
};

/**
 * 레이아웃대로 그려지던 슬라이드를 **좌표를 가진 요소들로 편다.**
 *
 * 빈 슬롯은 만들지 않는다 — 화면에 안 보이는 빈 상자를 끌고 다니게 하면
 * «이게 뭐지»가 된다. 필요하면 나중에 요소를 더하면 된다.
 */
export function bakeToElements(slide: Slide): SlideElement[] {
  const boxes = LAYOUT_BOXES[slide.layoutId] ?? {};
  const out: SlideElement[] = [];

  // 사진이 먼저 — 글자 아래에 깔린다
  const imgBox = IMAGE_BOXES[slide.layoutId];
  if (imgBox && slide.imageUrl) {
    out.push({
      id: "image",
      kind: "image",
      ...imgBox,
      z: 0,
      imageUrl: slide.imageUrl,
    });
  }

  let z = 1;
  for (const slot of LAYOUT_SLOTS[slide.layoutId]) {
    const value = slide.texts[slot];
    if (!value?.trim()) continue;
    const box = boxes[slot];
    if (!box) continue;
    out.push({
      id: slot,
      kind: "text",
      ...box,
      z: z++,
      text: value,
      slot,
      ...(slide.styleOverrides?.[slot] ? { style: slide.styleOverrides[slot] } : {}),
    });
  }

  return out;
}

/**
 * 요소 id.
 *
 * **시각만 쓰면 안 된다.** 같은 밀리초에 둘을 만들면 id가 겹치고,
 * 서버가 중복 id를 거절해 저장이 조용히 실패한다 (08-31에 실제로 겹쳤다).
 */
function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 0~1을 벗어나거나 뒤집힌 상자를 바로잡는다 — 화면 밖으로 나간 요소는 잡을 수 없다 */
export function clampElement(e: SlideElement): SlideElement {
  const w = Math.min(Math.max(e.w, 0.02), 1);
  /*
    최소 높이를 아주 얇게 둔다 — 선(납작한 도형)을 그리려면 필요하다.
    너무 얇아 손으로 잡기 어려운 문제는 편집기가 «누를 수 있는 영역»을
    따로 넓혀서 푼다 (SlideEditor).
  */
  const h = Math.min(Math.max(e.h, 0.008), 1);
  return {
    ...e,
    w,
    h,
    x: Math.min(Math.max(e.x, 0), 1 - w),
    y: Math.min(Math.max(e.y, 0), 1 - h),
  };
}

/**
 * 새 텍스트 상자 (08-31 · 편집기).
 *
 * **조금씩 어긋나게 놓는다.** 같은 자리에 쌓으면 방금 더한 것이 아래에 숨어
 * «추가했는데 아무것도 안 생겼다»가 된다.
 */
export function newTextBox(existing: SlideElement[]): SlideElement {
  const n = existing.length;
  return clampElement({
    id: newId("box"),
    kind: "text",
    x: 0.1 + (n % 4) * 0.03,
    y: 0.14 + (n % 6) * 0.06,
    w: 0.6,
    h: 0.1,
    z: Math.max(0, ...existing.map((e) => e.z)) + 1,
    text: "새 문구",
  });
}

/**
 * 새 도형 (08-31 · 편집기).
 *
 * 종류를 나누지 않고 «모서리 둥글기»만 다르게 준다 —
 * 0이면 사각형, 0.5면 원, 납작하게 만들면 선이다.
 */
export function newShape(
  existing: SlideElement[],
  preset: "rect" | "circle" | "line",
): SlideElement {
  const n = existing.length;
  const box =
    preset === "circle"
      ? { w: 0.24, h: 0.24, radius: 0.5 }
      : preset === "line"
        ? { w: 0.5, h: 0.012, radius: 0 }
        : { w: 0.32, h: 0.18, radius: 0 };

  return clampElement({
    id: newId("shape"),
    kind: "shape",
    x: 0.12 + (n % 4) * 0.03,
    y: 0.2 + (n % 6) * 0.05,
    ...box,
    // 새 도형은 강조색으로 — 배경과 같은 색이면 «안 생겼다»로 보인다
    style: { color: "accent" },
    z: Math.max(0, ...existing.map((e) => e.z)) + 1,
  });
}
