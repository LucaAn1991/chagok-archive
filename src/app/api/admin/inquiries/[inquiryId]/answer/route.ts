import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-log";

/**
 * 문의 답변 (백오피스 기획 §2-②).
 * POST { body } — 저장하면 open → answered. 답변 수정도 같은 API(덮어쓴다).
 * 사용자는 문의 내역 화면에서 확인한다 (발송 알림은 5단계 이메일 인프라에서).
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/inquiries/[inquiryId]/answer">,
) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();
  const { inquiryId } = await ctx.params;

  const body = (await request.json().catch(() => null)) as { body?: string } | null;
  const text = body?.body?.trim() ?? "";
  if (!text) return NextResponse.json({ error: "답변 내용을 적어주세요." }, { status: 400 });
  if (text.length > 2000) {
    return NextResponse.json({ error: "답변은 2000자 이내로 적어주세요." }, { status: 400 });
  }

  try {
    const ref = adminDb.collection("inquiries").doc(inquiryId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "없는 문의예요." }, { status: 404 });

    await ref.update({
      status: "answered",
      answer: {
        body: text,
        answeredAt: new Date().toISOString(),
        adminEmail: session.email, // 사용자에게는 «차곡 팀»으로 보여준다 — 화면이 알아서
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    await logAdminAction({
      actorUid: session.uid,
      actorEmail: session.email,
      action: "inquiry.answer",
      targetType: "user",
      targetId: (snap.data()?.userId as string) ?? inquiryId,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/inquiries/answer]", e);
    return NextResponse.json({ error: "답변을 저장하지 못했어요." }, { status: 500 });
  }
}
