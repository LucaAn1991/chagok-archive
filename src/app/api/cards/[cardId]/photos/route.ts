import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import { MAX_PHOTOS_PER_CARD, isAllowedContentType } from "@/lib/storage/limits";
import { issueUploadTicket } from "@/lib/storage/photos";
import type { Card } from "@/types";

/**
 * POST /api/cards/[cardId]/photos — 사진 업로드 URL 발급 (F13, PLAN.md §6).
 *
 * 파일 본체는 이 라우트를 지나가지 않는다. 여기서는 «올려도 되는 사람인지»와
 * «올려도 되는 형식인지»만 보고, 브라우저가 Storage로 직접 PUT할 서명 URL을 준다.
 *
 * 사진은 «묻는 단계»가 아니라 «있으면 쓰는 재료»다 (DESIGN.md §12).
 * 그래서 버킷이 없을 때도 500이 아니라 **503 + 이유**로 답한다 —
 * 화면은 그걸 보고 「준비 중」으로 조용히 내려앉는다.
 */

type PostBody = { contentType?: unknown };

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/cards/[cardId]/photos">,
) {
  const uid = await getUidFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const { cardId } = await ctx.params;
  const cardSnap = await adminDb.collection("cards").doc(cardId).get();
  const card = cardSnap.data() as Card | undefined;
  if (!card || card.userId !== uid) {
    return NextResponse.json({ error: "카드를 찾을 수 없어요." }, { status: 404 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  if (!isAllowedContentType(body.contentType)) {
    return NextResponse.json(
      { error: "JPG · PNG · WEBP 사진만 올릴 수 있어요." },
      { status: 400 },
    );
  }

  // 상한은 서버에서도 센다 — 화면의 제한은 우회될 수 있다
  if (card.photoUrls.length >= MAX_PHOTOS_PER_CARD) {
    return NextResponse.json(
      { error: `사진은 ${MAX_PHOTOS_PER_CARD}장까지 넣을 수 있어요.` },
      { status: 409 },
    );
  }

  const result = await issueUploadTicket(cardId, body.contentType);
  if (!result.ok) {
    return NextResponse.json(
      { error: "사진 업로드는 아직 준비 중이에요.", reason: result.reason },
      { status: 503 },
    );
  }

  return NextResponse.json(result.ticket);
}
