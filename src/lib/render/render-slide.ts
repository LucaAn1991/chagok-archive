import satori from "satori";
import sharp from "sharp";
import type { ReactNode } from "react";
import { loadCardFonts } from "./fonts";
import { buildLayout, SLIDE_SIZE, type SlideContent } from "./layouts";
import { AI_DISCLOSURE_XMP } from "../ai-disclosure";
import { embedXmpInPng } from "./png-xmp";
import { resolveStyle } from "./card-styles";
import { assetDataUris } from "./asset-files";

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
 *
 * ⚠️⚠️ **매번 부른다 — 한 번만 하고 캐시하면 안 된다** (09-04).
 *
 * 예전엔 `svgUnblocked` 플래그로 첫 호출에만 열었다. 그런데 Next의 이미지
 * 최적화기는 **자기가 sharp를 처음 쓰는 순간** block을 건다 — 그 시점이 우리
 * unblock보다 **뒤일 수 있다.** 그러면 SVG는 다시 닫히는데 플래그는 이미 true라
 * 영영 다시 열리지 않고, 그때부터 이 프로세스의 모든 렌더가 죽는다.
 *
 * 실측 09-04: 카드 하나에서 시안 생성이 성공한 장(Storage PNG를 그대로 내보냄)은
 * 멀쩡한데 렌더러로 물러선 장만 502가 났다. 결과 화면은 그 장에서 멈춰
 * **표지 한 장만** 보였다. 원인 메시지는 「Input buffer contains unsupported
 * image format」 하나뿐이라 사진 문제로 오해하기 쉽다.
 *
 * unblock은 libvips 전역 플래그를 세우는 값싼 호출이라 매번 해도 된다.
 */
export function ensureSvgLoaderAllowed(): void {
  sharp.unblock({ operation: ["VipsForeignLoadSvg"] });
}

export async function renderSlidePng(content: SlideContent): Promise<Buffer> {
  ensureSvgLoaderAllowed();

  /*
    줄마다 고른 폰트까지 함께 등록한다 (08-31). 브랜드 폰트만 넣으면
    다른 폰트를 고른 줄이 글자 없이 나온다.
  */
  const extra = [
    /*
      **분위기가 쓰는 글꼴도 등록한다** (09-02).
      레이아웃은 이름으로 글꼴을 부르는데(`family`), 그 이름으로 등록된 파일이
      없으면 satori가 조용히 첫 번째 글꼴로 그린다 — 색만 바뀌고 글꼴은 전부
      같아 보이는 증상이 이것이었다.
    */
    content.styleId ? resolveStyle(content.styleId).fontId : null,
    ...Object.values(content.styleOverrides ?? {}).map((s) => s.fontId),
    ...(content.elements ?? []).map((e) => e.style?.fontId),
  ].filter((v): v is NonNullable<typeof v> => Boolean(v));

  const fonts = await loadCardFonts(content.brand, extra);

  /*
    장식 그림을 미리 읽어 넘긴다 (09-02) — satori는 파일을 못 읽고 data URI만 받는다.
    분위기가 쓰는 파일만 읽으므로 안 쓰는 그림은 메모리에 올라오지 않는다.
  */
  const decorFiles = content.styleId
    ? (resolveStyle(content.styleId).ornaments ?? [])
        .map((o) => o.file)
        .filter((f): f is string => Boolean(f))
    : [];
  const decorImages = decorFiles.length > 0 ? await assetDataUris(decorFiles) : {};

  const svg = await satori(buildLayout({ ...content, decorImages }) as unknown as ReactNode, {
    width: SLIDE_SIZE,
    height: SLIDE_SIZE,
    fonts,
  });

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  /*
    **AI 생성물 비가시 표시** (AI 기본법 제31조 — `lib/ai-disclosure.ts`).
    미리보기와 내려받는 파일이 같은 경로를 쓰므로, 여기 한 곳에서 심으면 둘 다 붙는다.

    sharp의 기본 동작은 메타데이터를 전부 **버리는 것**이라 이 줄이 없으면
    아무 표시도 남지 않는다. 표시가 빠지면 다운로드 단계 안내(제작 결과 화면)까지
    함께 무효가 되므로 지우지 말 것.
  */
  return embedXmpInPng(png, AI_DISCLOSURE_XMP);
}
