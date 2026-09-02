import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import { renderSlidePng } from "@/lib/render/render-slide";
import { toDataUri } from "@/lib/render/fetch-image";
import { embedXmpInPng } from "@/lib/render/png-xmp";
import { AI_DISCLOSURE_XMP } from "@/lib/ai-disclosure";
import type { Card, User } from "@/types";

/**
 * GET /api/cards/[cardId]/slides/[order]/image — 슬라이드 1장을 PNG로 렌더링.
 *
 * 완성 이미지는 어디에도 저장되지 않는다. 카드에 저장된 슬라이드 구성
 * (layoutId·texts)을 그 자리에서 그린다 — 장당 5~10ms.
 * <img src>는 헤더를 못 실으므로, 클라이언트는 fetch + Authorization 헤더로
 * 받아 blob URL로 표시한다.
 */
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/cards/[cardId]/slides/[order]/image">,
) {
  const uid = await getUidFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const { cardId, order } = await ctx.params;
  const cardSnap = await adminDb.collection("cards").doc(cardId).get();
  const card = cardSnap.data() as Card | undefined;
  if (!card || card.userId !== uid) {
    return NextResponse.json({ error: "카드를 찾을 수 없어요." }, { status: 404 });
  }

  /*
    「내 스타일」은 카드가 아니라 **계정**에 붙어 있다 (08-31 · DESIGN.md §12).
    그래서 그릴 때마다 사용자 문서를 함께 읽는다 — 스타일을 바꾸면
    이미 만든 카드도 다음에 열 때 새 색·폰트로 그려진다.
  */
  const userSnap = await adminDb.collection("users").doc(uid).get();
  const brand = (userSnap.data() as User | undefined)?.brand ?? null;

  const slide = card.slides.find((s) => s.order === Number(order));
  if (!slide) {
    return NextResponse.json({ error: "슬라이드를 찾을 수 없어요." }, { status: 404 });
  }

  /*
    **시안 템플릿으로 만든 장은 이미 완성돼 있다** (09-02).
    Storage에서 받아 그대로 내보낸다 — 여기서 갈라주면 화면·다운로드·편집기가
    전부 고칠 것 없이 동작한다.

    ⚠️ **AI 생성물 표시를 여기서 다시 심는다.** 렌더러 경로는 `render-slide.ts`가
    심어주지만 이 그림은 그 경로를 거치지 않는다. 빠뜨리면 생성한 장만 표시가
    없는 채로 나가고, 그건 법정 의무 위반이다 (`lib/ai-disclosure.ts`).
  */
  if (slide.origin === "generated" && slide.generatedUrl) {
    try {
      const res = await fetch(slide.generatedUrl);
      if (res.ok) {
        const raw = Buffer.from(await res.arrayBuffer());
        return new NextResponse(new Uint8Array(embedXmpInPng(raw, AI_DISCLOSURE_XMP)), {
          headers: {
            "Content-Type": "image/png",
            // 본인만 보는 이미지 — 공유 캐시 금지 (렌더러 경로와 같은 규칙)
            "Cache-Control": "private, max-age=300",
          },
        });
      }
      console.error(`[slides/image] 생성 그림 받기 실패 HTTP ${res.status} card=${cardId} order=${order}`);
    } catch (err) {
      console.error(`[slides/image] 생성 그림 받기 실패 card=${cardId} order=${order}:`, err);
    }
    // 못 받았으면 아래 렌더러로 물러선다 — 빈 자리를 보여주지 않는다
  }

  try {
    const png = await renderSlidePng({
      layoutId: slide.layoutId,
      // 테마는 카드 전체가 하나를 공유한다 (08-31). 옛 카드엔 없어서 기본값으로 그려진다
      themeId: card.themeId,
      // 기획에서 고른 분위기 (09-02). 있으면 테마 대신 이걸로 그린다
      styleId: card.styleId,
      brand,
      bgOverride: card.bgOverride,
      styleOverrides: slide.styleOverrides,
      elements: slide.elements,
      texts: slide.texts,
      // satori는 원격 URL을 못 받아온다 — 여기서 data URI로 바꿔 넘긴다.
      // 실패하면 null이 되어 사진 없이 그려진다 (카드 전체를 못 쓰게 하지 않는다)
      imageUrl: await toDataUri(slide.imageUrl),
    });

    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        // 본인만 보는 이미지 — 공유 캐시 금지, 브라우저 캐시만 짧게
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    // 사용자에겐 한국어 안내만, 원인은 서버 로그로 — 침묵 catch는 디버깅을 막는다 (08-31)
    console.error(`[slides/image] 렌더 실패 card=${cardId} order=${order}:`, err);
    return NextResponse.json(
      { error: "이미지를 그리지 못했어요. 다시 시도해주세요." },
      { status: 502 },
    );
  }
}
