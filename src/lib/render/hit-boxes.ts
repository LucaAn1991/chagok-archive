import "server-only";

import satori from "satori";
import sharp from "sharp";
import { ensureSvgLoaderAllowed } from "./render-slide";
import type { ReactNode } from "react";
import { loadCardFonts } from "./fonts";
import { buildLayout, type SlideContent } from "./layouts";

/**
 * 각 줄이 **실제로 그려지는 상자**를 잰다 (08-31 · 편집기).
 *
 * **왜 필요한가** — 레이아웃은 flexbox가 자동으로 배치하는데 satori는 계산 결과를
 * 돌려주지 않는다. 그래서 편집기의 «누를 수 있는 영역»을 손으로 적은 근사 좌표로
 * 쓰고 있었고, 실제 글자와 어긋나 선택이 부자연스러웠다.
 *
 * **어떻게** — 같은 레이아웃을 **글자 대신 색 사각형으로** 한 번 더 그린 뒤
 * 픽셀을 훑어 각 색의 경계를 찾는다. 글자는 지우지 않고 투명하게만 만든다 —
 * 지우면 줄바꿈이 달라져 상자 크기가 바뀐다.
 *
 * **그리기는 반드시 1080으로 한다.** 레이아웃의 여백·글자 크기가 전부 1080 기준
 * 절대값이라, 작은 캔버스에 그리면 여백만으로 내용 영역이 사라진다
 * (216px에 여백 112를 주면 남는 폭이 음수다 — 08-31에 실제로 빈 그림이 나왔다).
 * 훑기는 축소해서 한다. 좌표는 0~1 비율이라 정밀도는 그걸로 충분하다.
 */

import { SLIDE_SIZE } from "./layouts";

/** 훑을 때의 크기 — 1/216 ≈ 0.5%면 손가락으로 누르는 데 충분하다 */
const SCAN_SIZE = 216;

/** 색이 겹치지 않게 충분히 떨어뜨린다 — JPEG가 아니라 PNG라 정확히 보존된다 */
function colorFor(i: number): [number, number, number] {
  return [(i * 53 + 17) % 256, (i * 97 + 61) % 256, (i * 151 + 113) % 256];
}

export type HitBox = { key: string; x: number; y: number; w: number; h: number };

export async function measureHitBoxes(
  content: SlideContent,
  keys: string[],
): Promise<HitBox[]> {
  if (keys.length === 0) return [];

  const hitColors: Record<string, string> = {};
  const rgbOf = new Map<string, [number, number, number]>();
  keys.forEach((k, i) => {
    const rgb = colorFor(i);
    hitColors[k] = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    rgbOf.set(k, rgb);
  });

  const fonts = await loadCardFonts(content.brand);
  const svg = await satori(buildLayout({ ...content, hitColors }) as unknown as ReactNode, {
    width: SLIDE_SIZE,
    height: SLIDE_SIZE,
    fonts,
  });
  /*
    여기도 satori SVG를 sharp에 먹인다 — 렌더러와 **같은 이유로** SVG 로더를 연다
    (09-04). 지금까지는 같은 프로세스에서 렌더러가 먼저 열어둔 덕에 우연히 돌았다.
  */
  ensureSvgLoaderAllowed();
  const { data } = await sharp(Buffer.from(svg))
    // `nearest`로 줄인다 — 색을 섞으면 경계에서 다른 색이 만들어져 상자가 번진다
    .resize(SCAN_SIZE, SCAN_SIZE, { kernel: "nearest" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bounds = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  for (let y = 0; y < SCAN_SIZE; y++) {
    for (let x = 0; x < SCAN_SIZE; x++) {
      const i = (y * SCAN_SIZE + x) * 3;
      for (const [key, rgb] of rgbOf) {
        // 리사이즈·안티에일리어싱으로 색이 조금 흔들린다 — 가까우면 같은 색으로 본다
        if (
          Math.abs(data[i] - rgb[0]) < 12 &&
          Math.abs(data[i + 1] - rgb[1]) < 12 &&
          Math.abs(data[i + 2] - rgb[2]) < 12
        ) {
          const b = bounds.get(key);
          if (!b) bounds.set(key, { x0: x, y0: y, x1: x, y1: y });
          else {
            b.x0 = Math.min(b.x0, x);
            b.y0 = Math.min(b.y0, y);
            b.x1 = Math.max(b.x1, x);
            b.y1 = Math.max(b.y1, y);
          }
          break;
        }
      }
    }
  }

  return keys
    .map((key) => {
      const b = bounds.get(key);
      if (!b) return null;
      return {
        key,
        x: b.x0 / SCAN_SIZE,
        y: b.y0 / SCAN_SIZE,
        w: (b.x1 - b.x0 + 1) / SCAN_SIZE,
        h: (b.y1 - b.y0 + 1) / SCAN_SIZE,
      };
    })
    .filter((v): v is HitBox => v !== null);
}
