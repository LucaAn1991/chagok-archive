import satori from "satori";
import sharp from "sharp";
import type { ReactNode } from "react";
import { loadPretendardFonts } from "./fonts";
import { buildLayout, SLIDE_SIZE, type SlideContent } from "./layouts";

/**
 * 슬라이드 1장을 PNG 버퍼로 렌더링한다.
 *
 * satori(레이아웃 객체 → SVG) → sharp(SVG → PNG).
 * 외부 서비스 호출 없이 같은 Node 프로세스에서 끝난다 (PLAN.md §6).
 * 서버 전용 — API route(/api/cards/[cardId]/render)에서만 부른다.
 */
export async function renderSlidePng(content: SlideContent): Promise<Buffer> {
  const fonts = await loadPretendardFonts();

  const svg = await satori(buildLayout(content) as unknown as ReactNode, {
    width: SLIDE_SIZE,
    height: SLIDE_SIZE,
    fonts,
  });

  return sharp(Buffer.from(svg)).png().toBuffer();
}
