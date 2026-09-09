import { NextResponse, type NextRequest } from "next/server";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-log";
import { destroyUser } from "@/lib/server/user-deletion";

/**
 * 탈퇴 대행 (백오피스 기획 §2-②) — «탈퇴가 안 돼요» CS용.
 * POST { reason: string }
 *
 * 본인 탈퇴 API는 본인 로그인이 필수라, 로그인을 못 하는 사용자의 파기 요청은
 * 운영자가 대신 실행할 길이 필요하다. 파기 본체는 본인 탈퇴와 같은 코드
 * (lib/server/user-deletion.ts). **로그를 파기보다 먼저 남긴다** — 성공하면
 * uid의 주인이 사라지므로, 기록이 없으면 «누가 왜 지웠는지»가 증발한다.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/members/[uid]/delete">,
) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();
  const { uid } = await ctx.params;

  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  if (!body?.reason?.trim()) {
    return NextResponse.json({ error: "사유가 필요해요." }, { status: 400 });
  }
  if (uid === session.uid) {
    return NextResponse.json({ error: "자기 계정은 여기서 지울 수 없어요." }, { status: 400 });
  }

  await logAdminAction({
    actorUid: session.uid,
    actorEmail: session.email,
    action: "user.delete_account",
    targetType: "user",
    targetId: uid,
    reason: body.reason,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  const result = await destroyUser(uid);
  if (!result.ok) {
    return NextResponse.json(
      { error: `파기가 ${result.failedStep} 단계에서 멈췄어요. 처리함에 기록됐어요.` },
      { status: 500 },
    );
  }
  return NextResponse.json({ deleted: true, storageFailures: result.storageFailures });
}
