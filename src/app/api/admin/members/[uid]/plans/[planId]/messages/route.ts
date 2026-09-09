import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-log";

/**
 * 기획 대화 열람 (백오피스 기획 §2-② 마스킹·열람 원칙).
 * POST { reason: string } — 조회인데 POST인 이유: 사유 없이는 열 수 없고,
 * 열람 자체가 기록을 남기는 «행위»라서다. «운영자여도 상시 보지 않는다».
 *
 * 로그에는 «봤다»는 사실만 남는다 — 대화 내용을 로그에 복사하지 않는다.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/members/[uid]/plans/[planId]/messages">,
) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();
  const { uid, planId } = await ctx.params;

  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  if (!body?.reason?.trim()) {
    return NextResponse.json({ error: "열람 사유가 필요해요." }, { status: 400 });
  }

  try {
    const planSnap = await adminDb.collection("plans").doc(planId).get();
    const plan = planSnap.data();
    if (!plan || plan.userId !== uid) {
      return NextResponse.json({ error: "없는 기획이에요." }, { status: 404 });
    }

    await logAdminAction({
      actorUid: session.uid,
      actorEmail: session.email,
      action: "user.view_private",
      targetType: "user",
      targetId: uid,
      reason: `기획 대화 열람 (${planId}) — ${body.reason.trim()}`,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    // 본문 필드는 content가 아니라 text다 (types/plan.ts PlanMessage — 09-09 버그 수정)
    const messages = ((plan.messages as { role: string; text: string }[]) ?? []).map((m) => ({
      role: m.role,
      content: m.text ?? "",
    }));
    return NextResponse.json({ topic: (plan.topic as string) ?? "", messages });
  } catch (e) {
    console.error("[admin/view-messages]", e);
    return NextResponse.json({ error: "열람하지 못했어요." }, { status: 500 });
  }
}
