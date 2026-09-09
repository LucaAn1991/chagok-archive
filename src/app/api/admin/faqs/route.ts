import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-log";
import { validateFaq } from "@/lib/server/content-validation";

/**
 * FAQ 관리 (백오피스 기획 §2-①).
 * GET — 전체(order 순) / POST { question, answer } — hidden · order는 맨 뒤로 자동 부여.
 */

export async function GET(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  const snap = await adminDb.collection("faqs").get();
  const faqs = snap.docs
    .map((d) => {
      const v = d.data();
      return {
        id: d.id,
        question: (v.question as string) ?? "",
        answer: (v.answer as string) ?? "",
        status: (v.status as string) ?? "hidden",
        order: (v.order as number) ?? 0,
      };
    })
    .sort((a, b) => a.order - b.order);
  return NextResponse.json({ faqs });
}

export async function POST(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "요청 형식이 잘못됐어요." }, { status: 400 });
  const v = validateFaq(body);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });

  const snap = await adminDb.collection("faqs").get();
  const maxOrder = snap.docs.reduce((m, d) => Math.max(m, (d.data().order as number) ?? 0), 0);

  const ref = await adminDb.collection("faqs").add({
    ...v,
    status: "hidden",
    order: maxOrder + 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await logAdminAction({
    actorUid: session.uid,
    actorEmail: session.email,
    action: "faq.create",
    targetType: "faq",
    targetId: ref.id,
    after: { question: v.question },
  });
  return NextResponse.json({ id: ref.id });
}
