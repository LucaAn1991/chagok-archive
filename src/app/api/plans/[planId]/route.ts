import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import type { Plan } from "@/types";

/**
 * DELETE /api/plans/[planId] — 지난 기획 한 건을 지운다 (09-03).
 *
 * **카드는 건드리지 않는다.** 카드는 `cards` 컬렉션에 따로 있고 캘린더가 그걸 보여준다 —
 * 지우는 건 «기획 세션 기록»(대화 전문·초안)뿐이다. 그래서 캘린더에 올려둔 카드는
 * 그대로 남고, 목록만 정리된다.
 *
 * 대화(`messages`)·초안(`drafts`)은 기획 문서 안의 «필드»라 문서를 지우면 함께 사라진다
 * (별도 서브컬렉션이 아니다). Storage에 올린 사진은 남지만 DB 부담과 무관하다.
 */
export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/plans/[planId]">,
) {
  const uid = await getUidFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const { planId } = await ctx.params;
  const ref = adminDb.collection("plans").doc(planId);
  const snap = await ref.get();
  const plan = snap.data() as Plan | undefined;

  // 남의 기획을 지우지 못하게 — 이미 없으면 «지워진 것»으로 보고 성공 처리한다
  if (!plan) {
    return NextResponse.json({ ok: true });
  }
  if (plan.userId !== uid) {
    return NextResponse.json({ error: "기획을 찾을 수 없어요." }, { status: 404 });
  }

  try {
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[plans DELETE]", e);
    return NextResponse.json({ error: "삭제하지 못했어요. 잠시 후 다시 시도해주세요." }, { status: 502 });
  }
}
