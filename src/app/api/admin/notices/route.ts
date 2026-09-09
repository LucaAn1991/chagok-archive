import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-log";
import { validateNotice } from "@/lib/server/content-validation";

/**
 * 공지 관리 (백오피스 기획 §2-①).
 * GET — 전체(상태 불문, 최신순) / POST { title, body, level } — hidden으로 생성.
 * hidden이 임시저장을 겸한다 — 공개 준비가 되면 PATCH로 published.
 */

export async function GET(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  const snap = await adminDb.collection("notices").get();
  const notices = snap.docs
    .map((d) => {
      const v = d.data();
      return {
        id: d.id,
        title: (v.title as string) ?? "",
        body: (v.body as string) ?? "",
        level: (v.level as string) ?? "normal",
        status: (v.status as string) ?? "hidden",
        createdAt: v.createdAt?.toDate?.()?.toISOString() ?? null,
        publishedAt: v.publishedAt?.toDate?.()?.toISOString() ?? null,
      };
    })
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return NextResponse.json({ notices });
}

export async function POST(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "요청 형식이 잘못됐어요." }, { status: 400 });
  const v = validateNotice(body);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });

  const ref = await adminDb.collection("notices").add({
    ...v,
    status: "hidden",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    publishedAt: null,
  });

  await logAdminAction({
    actorUid: session.uid,
    actorEmail: session.email,
    action: "notice.create",
    targetType: "notice",
    targetId: ref.id,
    after: { title: v.title, level: v.level },
  });
  return NextResponse.json({ id: ref.id });
}
