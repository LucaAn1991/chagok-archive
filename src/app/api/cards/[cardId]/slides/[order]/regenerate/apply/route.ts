import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import { commitSlideCandidate, discardSlideCandidate } from "@/lib/imagegen/store";
import type { Card, Slide } from "@/types";

/**
 * POST /api/cards/[cardId]/slides/[order]/regenerate/apply — 다시 만든 그림을 확정한다 (09-03).
 *
 * body: { keep: "new" | "old", lines?: string[] }
 *
 * 「이 장만 다시 만들기」는 새 그림을 **미리보기**로만 만들어 둔다. 여기서 사용자가
 * 고른 것을 반영한다 — **우리가 판단해서 덮지 않는다.**
 *   keep:"new"  → 미리보기를 확정본으로 옮기고, 카드의 그 장을 새 그림·새 문구로 바꾼다
 *   keep:"old"  → 미리보기를 버린다. 카드는 그대로.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string; order: string }> },
) {
  const uid = await getUidFromRequest(req);
  if (!uid) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const { cardId, order } = await params;
  const index = Number(order);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "슬라이드 번호가 잘못됐어요." }, { status: 400 });
  }

  let keep: "new" | "old" = "new";
  let lines: string[] | null = null;
  let photoUrl: string | null = null;
  try {
    const body = await req.json();
    if (body?.keep === "old") keep = "old";
    if (Array.isArray(body?.lines)) lines = body.lines.filter((l: unknown) => typeof l === "string");
    if (typeof body?.photoUrl === "string" && body.photoUrl) photoUrl = body.photoUrl;
  } catch {
    // 기본값(new)으로 진행
  }

  const cardRef = adminDb.collection("cards").doc(cardId);
  const card = (await cardRef.get()).data() as Card | undefined;
  if (!card || card.userId !== uid) {
    return NextResponse.json({ error: "카드를 찾을 수 없어요." }, { status: 404 });
  }
  const slide = card.slides?.find((s) => s.order === index);
  if (!slide) return NextResponse.json({ error: "슬라이드를 찾을 수 없어요." }, { status: 404 });

  // 「그대로 두기」 — 미리보기만 버리고 끝낸다
  if (keep === "old") {
    await discardSlideCandidate(cardId, index);
    return NextResponse.json({ ok: true, kept: "old", slide });
  }

  // 「이걸로 바꾸기」 — 미리보기를 확정본으로
  const committed = await commitSlideCandidate({ cardId, order: index });
  if (!committed.ok) {
    console.error(`[regenerate/apply] 확정 실패 card=${cardId} order=${index} — ${committed.reason}`);
    return NextResponse.json(
      { error: "바꾸지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 502 },
    );
  }

  const next: Slide = {
    ...slide,
    origin: "generated",
    generatedUrl: committed.url,
    // 다시 만들 때 쓴 문구가 있으면 함께 남긴다 — 그래야 또 다시 만들 때 이어진다
    ...(lines && lines.length ? { sheetLines: lines } : {}),
    // 사진을 바꿨으면 기록한다 — 다음 다시 만들기에서도 그 사진을 쓴다 (09-03)
    ...(photoUrl ? { sheetPhotoUrls: [photoUrl] } : {}),
  };
  const slides = card.slides.map((s) => (s.order === index ? next : s));
  await cardRef.update({ slides, updatedAt: FieldValue.serverTimestamp() });

  return NextResponse.json({ ok: true, kept: "new", slide: next });
}
