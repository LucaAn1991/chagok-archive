import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";

/**
 * 감사 로그 탐색 (백오피스 기획 §2-⑥).
 * GET ?days=7&action=&actor= — 최신순 최대 500건을 읽고 서버에서 거른다.
 * 규모가 커져 500건이 모자라면 그때 커서 페이징으로 바꾼다.
 */
export async function GET(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  const url = new URL(request.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 7));
  const action = url.searchParams.get("action") ?? "";
  const actor = url.searchParams.get("actor") ?? "";

  try {
    const since = Timestamp.fromDate(new Date(Date.now() - days * 86400000));
    const snap = await adminDb
      .collection("admin_logs")
      .where("at", ">=", since)
      .orderBy("at", "desc")
      .limit(500)
      .get();

    let logs = snap.docs.map((d) => {
      const v = d.data();
      return {
        id: d.id,
        at: v.at?.toDate?.()?.toISOString() ?? null,
        actorEmail: (v.actorEmail as string) ?? "",
        action: (v.action as string) ?? "",
        targetType: (v.targetType as string) ?? "",
        targetId: (v.targetId as string) ?? "",
        reason: (v.reason as string) ?? null,
        before: (v.before as Record<string, unknown> | null) ?? null,
        after: (v.after as Record<string, unknown> | null) ?? null,
      };
    });
    if (action) logs = logs.filter((l) => l.action.startsWith(action));
    if (actor) logs = logs.filter((l) => l.actorEmail === actor);

    // 필터용 목록 — 이 기간에 등장한 관리자·행위
    const actors = [...new Set(snap.docs.map((d) => (d.data().actorEmail as string) ?? ""))];

    return NextResponse.json({ logs, actors, truncated: snap.size === 500 });
  } catch (e) {
    console.error("[admin/logs]", e);
    return NextResponse.json({ error: "로그를 불러오지 못했어요." }, { status: 500 });
  }
}
