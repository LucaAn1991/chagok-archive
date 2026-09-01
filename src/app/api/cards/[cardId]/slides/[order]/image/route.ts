import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import { renderSlidePng } from "@/lib/render/render-slide";
import { toDataUri } from "@/lib/render/fetch-image";
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

  try {
    const png = await renderSlidePng({
      layoutId: slide.layoutId,
      // 테마는 카드 전체가 하나를 공유한다 (08-31). 옛 카드엔 없어서 기본값으로 그려진다
      themeId: card.themeId,
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
