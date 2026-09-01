import satori from "satori";
import sharp from "sharp";
import type { ReactNode } from "react";
import { loadCardFonts } from "./fonts";
import { buildLayout, SLIDE_SIZE, type SlideContent } from "./layouts";

/**
 * 슬라이드 1장을 PNG 버퍼로 렌더링한다.
 *
 * satori(레이아웃 객체 → SVG) → sharp(SVG → PNG).
 * 외부 서비스 호출 없이 같은 Node 프로세스에서 끝난다 (PLAN.md §6).
 * 서버 전용 — API route에서만 부른다.
 */

/**
 * **Next.js가 sharp의 SVG 로더를 막아둔 것을 되돌린다.**
 *
 * `next/dist/server/image-optimizer.js`는 sharp를 처음 쓸 때
 * `sharp.block({ operation: ['VipsForeignLoad'] })`로 **모든** 로더를 차단한 뒤
 * JPEG·PNG·WebP·TIFF·GIF·HEIF만 다시 열어준다. SVG는 일부러 닫아둔다 —
 * 남이 올린 SVG에는 스크립트가 들어갈 수 있기 때문이다.
 *
 * 차단은 libvips 전역이라 같은 프로세스의 우리 렌더러까지 함께 막힌다.
 * 증상은 「Input buffer contains unsupported image format」 하나뿐이고,
 * 같은 코드가 `npx tsx scripts/render-smoke.ts`에서는 멀쩡히 돈다
 * (그 프로세스에는 Next의 이미지 최적화기가 없다). 원인을 찾기 매우 어렵다.
 *
 * **여기서 SVG를 다시 여는 것이 안전한 이유** — 이 경로가 다루는 SVG는
 * satori가 방금 만든 «우리 것»이고, 사용자가 올린 파일이 아니다.
 * 사용자 사진은 Storage에 올라가고 이 함수를 거치지 않는다.
 *
 * ⚠️ 다만 unblock도 전역이다. 앞으로 `next/image`로 **외부 도메인 이미지를
 * 최적화**하게 되면(`images.remotePatterns` 설정) 그 경로에도 SVG가 열린다.
 * 그때는 렌더링을 별도 프로세스로 떼거나 SVG→PNG 변환기를 따로 두어야 한다.
 */
let svgUnblocked = false;
function ensureSvgLoaderAllowed(): void {
  if (svgUnblocked) return;
  sharp.unblock({ operation: ["VipsForeignLoadSvg"] });
  svgUnblocked = true;
}

export async function renderSlidePng(content: SlideContent): Promise<Buffer> {
  ensureSvgLoaderAllowed();

  /*
    줄마다 고른 폰트까지 함께 등록한다 (08-31). 브랜드 폰트만 넣으면
    다른 폰트를 고른 줄이 글자 없이 나온다.
  */
  const extra = [
    ...Object.values(content.styleOverrides ?? {}).map((s) => s.fontId),
    ...(content.elements ?? []).map((e) => e.style?.fontId),
  ].filter((v): v is NonNullable<typeof v> => Boolean(v));

  const fonts = await loadCardFonts(content.brand, extra);

  const svg = await satori(buildLayout(content) as unknown as ReactNode, {
    width: SLIDE_SIZE,
    height: SLIDE_SIZE,
    fonts,
  });

  return sharp(Buffer.from(svg)).png().toBuffer();
}
