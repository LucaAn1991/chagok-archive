import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-log";
import { validateNotice } from "@/lib/server/content-validation";

/**
 * 공지 수정·삭제 (백오피스 기획 §2-①).
 * PATCH { title?, body?, level?, status? } — published로 바꿀 때 publishedAt을 찍는다.
 * DELETE — 실삭제 허용 (사용자 데이터가 아니라 보존 규칙과 무관).
 */

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/notices/[noticeId]">,
) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();
  const { noticeId } = await ctx.params;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "요청 형식이 잘못됐어요." }, { status: 400 });

  const ref = adminDb.collection("notices").doc(noticeId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "없는 공지예요." }, { status: 404 });
  const before = snap.data()!;

  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (body.title !== undefined || body.body !== undefined || body.level !== undefined) {
    const v = validateNotice({
      title: body.title ?? before.title,
      body: body.body ?? before.body,
      level: body.level ?? before.level,
    });
    if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
    Object.assign(patch, v);
  }
  if (body.status === "published" || body.status === "hidden") {
    patch.status = body.status;
    if (body.status === "published" && before.status !== "published") {
      patch.publishedAt = FieldValue.serverTimestamp();
    }
  }

  await ref.update(patch);
  await logAdminAction({
    actorUid: session.uid,
    actorEmail: session.email,
    action: "notice.update",
    targetType: "notice",
    targetId: noticeId,
    before: { title: before.title, status: before.status, level: before.level },
    after: {
      title: (patch.title as string) ?? before.title,
      status: (patch.status as string) ?? before.status,
      level: (patch.level as string) ?? before.level,
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/notices/[noticeId]">,
) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();
  const { noticeId } = await ctx.params;

  const ref = adminDb.collection("notices").doc(noticeId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "없는 공지예요." }, { status: 404 });

  await ref.delete();
  await logAdminAction({
    actorUid: session.uid,
    actorEmail: session.email,
    action: "notice.delete",
    targetType: "notice",
    targetId: noticeId,
    before: { title: snap.data()!.title },
  });
  return NextResponse.json({ ok: true });
}
