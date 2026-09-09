import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-log";
import { destroyUser } from "@/lib/server/user-deletion";

/**
 * 탈퇴 잔여물 파기 재실행 (백오피스 기획 §1-⑤).
 * POST { reason } — 같은 파기 로직을 다시 돌린다(이미 지워진 것은 건너뛰어져 멱등).
 * 성공하면 원래 잔여물 기록도 지운다 — 재실행이 만든 새 기록이 결과를 대신한다.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/deletions/[attemptId]/retry">,
) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();
  const { attemptId } = await ctx.params;

  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  if (!body?.reason?.trim()) {
    return NextResponse.json({ error: "사유가 필요해요." }, { status: 400 });
  }

  const attemptRef = adminDb.collection("deletion_attempts").doc(attemptId);
  const snap = await attemptRef.get();
  const uid = snap.data()?.uid as string | undefined;
  if (!uid) return NextResponse.json({ error: "없는 기록이에요." }, { status: 404 });

  await logAdminAction({
    actorUid: session.uid,
    actorEmail: session.email,
    action: "user.delete_account",
    targetType: "user",
    targetId: uid,
    reason: `잔여물 파기 재실행 (${attemptId}) — ${body.reason.trim()}`,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  const result = await destroyUser(uid);
  if (result.ok) {
    await attemptRef.delete().catch(() => {});
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(
    { error: `다시 ${result.failedStep} 단계에서 멈췄어요 — 콘솔 확인이 필요해요.` },
    { status: 500 },
  );
}
