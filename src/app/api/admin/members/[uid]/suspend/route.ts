import { NextResponse, type NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-log";

/**
 * 계정 정지/해제 (백오피스 기획 §2-② 상태 규칙).
 * POST { suspend: boolean, reason: string }
 *
 * 상태의 진실은 Auth `disabled` 하나다 — 우리 DB에 상태 필드를 이중으로 두면
 * 어긋난다. 사유·이력은 admin_logs가 진다.
 * 정지 시 발급된 토큰을 강제 만료한다 — disabled만으로는 기존 토큰이
 * 최대 1시간 살아 있어 «즉시 차단»이 안 된다.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/members/[uid]/suspend">,
) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();
  const { uid } = await ctx.params;

  const body = (await request.json().catch(() => null)) as
    | { suspend?: boolean; reason?: string }
    | null;
  if (typeof body?.suspend !== "boolean" || !body.reason?.trim()) {
    return NextResponse.json({ error: "suspend 값과 사유가 필요해요." }, { status: 400 });
  }
  if (uid === session.uid) {
    return NextResponse.json({ error: "자기 계정은 정지할 수 없어요." }, { status: 400 });
  }

  try {
    await adminAuth.updateUser(uid, { disabled: body.suspend });
    if (body.suspend) await adminAuth.revokeRefreshTokens(uid);

    await logAdminAction({
      actorUid: session.uid,
      actorEmail: session.email,
      action: body.suspend ? "user.suspend" : "user.unsuspend",
      targetType: "user",
      targetId: uid,
      reason: body.reason,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ disabled: body.suspend });
  } catch (e) {
    console.error("[admin/suspend]", e);
    return NextResponse.json({ error: "처리하지 못했어요." }, { status: 500 });
  }
}
