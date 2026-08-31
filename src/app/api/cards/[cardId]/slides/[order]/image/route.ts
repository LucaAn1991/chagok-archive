import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import { renderSlidePng } from "@/lib/render/render-slide";
import { toDataUri } from "@/lib/render/fetch-image";
import type { Card } from "@/types";

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

  const slide = card.slides.find((s) => s.order === Number(order));
  if (!slide) {
    return NextResponse.json({ error: "슬라이드를 찾을 수 없어요." }, { status: 404 });
  }

  try {
    const png = await renderSlidePng({
      layoutId: slide.layoutId,
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
  } catch (e) {
    // 사용자에게는 사정을 감추되 서버에는 남긴다 — 삼켜버리면 원인을 못 찾는다
    console.error(`[slide-render] card=${cardId} order=${order}`, e);
    return NextResponse.json(
      { error: "이미지를 그리지 못했어요. 다시 시도해주세요." },
      { status: 502 },
    );
  }
}
