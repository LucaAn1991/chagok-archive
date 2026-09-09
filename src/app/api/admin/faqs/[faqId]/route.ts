import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-log";
import { validateFaq } from "@/lib/server/content-validation";

/**
 * FAQ 수정·순서·삭제 (백오피스 기획 §2-①).
 * PATCH { question?, answer?, status? } 또는 { move: "up" | "down" } — 서버가 이웃과
 * order를 맞바꾼다 (드래그는 과잉, 클라이언트 계산은 동시 수정에 어긋난다).
 */

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/faqs/[faqId]">) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();
  const { faqId } = await ctx.params;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "요청 형식이 잘못됐어요." }, { status: 400 });

  const ref = adminDb.collection("faqs").doc(faqId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "없는 FAQ예요." }, { status: 404 });
  const before = snap.data()!;

  // 순서 이동 — 이웃과 order 맞바꾸기
  if (body.move === "up" || body.move === "down") {
    const all = (await adminDb.collection("faqs").get()).docs
      .map((d) => ({ id: d.id, order: (d.data().order as number) ?? 0 }))
      .sort((a, b) => a.order - b.order);
    const idx = all.findIndex((f) => f.id === faqId);
    const swapIdx = body.move === "up" ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= all.length) {
      return NextResponse.json({ ok: true }); // 끝이라 움직일 곳 없음 — 에러는 과함
    }
    const batch = adminDb.batch();
    batch.update(adminDb.collection("faqs").doc(all[idx].id), { order: all[swapIdx].order });
    batch.update(adminDb.collection("faqs").doc(all[swapIdx].id), { order: all[idx].order });
    await batch.commit();
    await logAdminAction({
      actorUid: session.uid,
      actorEmail: session.email,
      action: "faq.update",
      targetType: "faq",
      targetId: faqId,
      after: { move: body.move },
    });
    return NextResponse.json({ ok: true });
  }

  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (body.question !== undefined || body.answer !== undefined) {
    const v = validateFaq({
      question: body.question ?? before.question,
      answer: body.answer ?? before.answer,
    });
    if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
    Object.assign(patch, v);
  }
  if (body.status === "published" || body.status === "hidden") patch.status = body.status;

  await ref.update(patch);
  await logAdminAction({
    actorUid: session.uid,
    actorEmail: session.email,
    action: "faq.update",
    targetType: "faq",
    targetId: faqId,
    before: { question: before.question, status: before.status },
    after: {
      question: (patch.question as string) ?? before.question,
      status: (patch.status as string) ?? before.status,
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, ctx: RouteContext<"/api/admin/faqs/[faqId]">) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();
  const { faqId } = await ctx.params;

  const ref = adminDb.collection("faqs").doc(faqId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "없는 FAQ예요." }, { status: 404 });

  await ref.delete();
  await logAdminAction({
    actorUid: session.uid,
    actorEmail: session.email,
    action: "faq.delete",
    targetType: "faq",
    targetId: faqId,
    before: { question: snap.data()!.question },
  });
  return NextResponse.json({ ok: true });
}
