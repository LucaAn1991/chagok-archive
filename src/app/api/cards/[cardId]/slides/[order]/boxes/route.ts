import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import { measureHitBoxes } from "@/lib/render/hit-boxes";
import { LAYOUT_SLOTS } from "@/lib/slide-layout";
import type { Card, User } from "@/types";

/**
 * GET /api/cards/[cardId]/slides/[order]/boxes — 각 줄이 실제로 그려지는 상자 (08-31).
 *
 * 편집기가 «누를 수 있는 영역»을 여기에 맞춘다. 손으로 적은 근사 좌표를 쓰면
 * 글자와 어긋나 선택이 부자연스러워진다 (`lib/render/hit-boxes.ts` 참고).
 *
 * 자유 배치 슬라이드는 좌표를 이미 갖고 있으므로 부를 필요가 없다 —
 * 그때는 빈 배열을 돌려준다.
 */
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/cards/[cardId]/slides/[order]/boxes">,
) {
  const uid = await getUidFromRequest(req);
  if (!uid) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const { cardId, order } = await ctx.params;
  const cardSnap = await adminDb.collection("cards").doc(cardId).get();
  const card = cardSnap.data() as Card | undefined;
  if (!card || card.userId !== uid) {
    return NextResponse.json({ error: "카드를 찾을 수 없어요." }, { status: 404 });
  }

  const slide = card.slides.find((s) => s.order === Number(order));
  if (!slide) return NextResponse.json({ error: "슬라이드를 찾을 수 없어요." }, { status: 404 });
  if (slide.elements?.length) return NextResponse.json({ boxes: [] });

  const userSnap = await adminDb.collection("users").doc(uid).get();
  const brand = (userSnap.data() as User | undefined)?.brand ?? null;

  // 글자가 있는 슬롯만 잰다 — 빈 슬롯은 상자도 안 생긴다
  const keys = LAYOUT_SLOTS[slide.layoutId].filter((k) => slide.texts[k]?.trim());

  try {
    const boxes = await measureHitBoxes(
      {
        layoutId: slide.layoutId,
        themeId: card.themeId,
        texts: slide.texts,
        imageUrl: null, // 사진은 재지 않는다 — 원격 주소를 받아올 이유가 없다
        brand,
        bgOverride: card.bgOverride,
        styleOverrides: slide.styleOverrides,
      },
      keys,
    );
    return NextResponse.json({ boxes });
  } catch (e) {
    // 못 재면 편집기가 근사 좌표로 내려앉는다 — 편집이 막히지는 않는다
    console.error("[hit-boxes]", e);
    return NextResponse.json({ boxes: [] });
  }
}
