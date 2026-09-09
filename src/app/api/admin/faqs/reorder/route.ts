import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-log";

/**
 * FAQ 순서 일괄 저장 (백오피스 기획 §2-①) — 드래그 정렬이 끝난 전체 순서를 받는다.
 * POST { ids: string[] } — 배열 순서 그대로 order 1..n을 다시 매긴다.
 * 한 건씩 옮기는 방식(구 move)과 달리 드래그 결과를 원자적으로 반영한다.
 */
export async function POST(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((v) => typeof v === "string")) {
    return NextResponse.json({ error: "요청 형식이 잘못됐어요." }, { status: 400 });
  }
  if (ids.length > 200) {
    return NextResponse.json({ error: "한 번에 정렬할 수 있는 개수를 넘었어요." }, { status: 400 });
  }

  try {
    const snap = await adminDb.collection("faqs").get();
    const existing = new Set(snap.docs.map((d) => d.id));
    if (ids.some((id) => !existing.has(id)) || new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: "목록이 최신이 아니에요. 새로고침 해주세요." }, { status: 409 });
    }

    const batch = adminDb.batch();
    ids.forEach((id, i) => {
      batch.update(adminDb.collection("faqs").doc(id), {
        order: i + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();

    await logAdminAction({
      actorUid: session.uid,
      actorEmail: session.email,
      action: "faq.update",
      targetType: "faq",
      targetId: "reorder",
      after: { count: ids.length },
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/faqs/reorder]", e);
    return NextResponse.json({ error: "순서를 저장하지 못했어요." }, { status: 500 });
  }
}
