import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import { MAX_PHOTOS_PER_CARD, isAllowedContentType } from "@/lib/storage/limits";
import { issueUploadTicket } from "@/lib/storage/photos";
import type { Plan } from "@/types";

/**
 * POST /api/plans/[planId]/photos — 기획 단계 사진 업로드 URL 발급 (08-31).
 *
 * 카드용(`/api/cards/[cardId]/photos`)과 같은 구조다. 다른 점은 «언제»뿐 —
 * 기획하면서 올린 사진은 카드가 생기기 전이라 기획에 붙여두고,
 * 카드 생성(`confirm`) 때 **주소만 물려준다.**
 *
 * 파일 본체는 이 라우트를 지나가지 않는다. 여기서는 «올려도 되는 사람인지»와
 * «올려도 되는 형식인지»만 보고 서명 URL을 준다.
 *
 * 확정된 기획에는 더 올릴 수 없다 — 카드가 이미 만들어졌으므로 지금 올려봐야
 * 그 카드들에 반영되지 않는다. 헛일이 되느니 막는 쪽이 낫다.
 */

type PostBody = { contentType?: unknown };

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/plans/[planId]/photos">,
) {
  const uid = await getUidFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const { planId } = await ctx.params;
  const planSnap = await adminDb.collection("plans").doc(planId).get();
  const plan = planSnap.data() as Plan | undefined;
  if (!plan || plan.userId !== uid) {
    return NextResponse.json({ error: "기획을 찾을 수 없어요." }, { status: 404 });
  }
  if (plan.status === "confirmed") {
    return NextResponse.json(
      { error: "이미 카드를 만든 기획이에요. 카드에서 사진을 추가해주세요." },
      { status: 409 },
    );
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
  if ((plan.photoUrls?.length ?? 0) >= MAX_PHOTOS_PER_CARD) {
    return NextResponse.json(
      { error: `사진은 ${MAX_PHOTOS_PER_CARD}장까지 넣을 수 있어요.` },
      { status: 409 },
    );
  }

  const result = await issueUploadTicket("plans", planId, body.contentType);
  if (!result.ok) {
    return NextResponse.json(
      { error: "사진 업로드는 아직 준비 중이에요.", reason: result.reason },
      { status: 503 },
    );
  }

  return NextResponse.json(result.ticket);
}
