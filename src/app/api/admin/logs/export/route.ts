import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-log";

/**
 * 감사 로그 CSV 반출 (백오피스 기획 §2-⑥) — 증빙·감사 대응용.
 * GET ?days=30 — 반출 자체도 기록한다(log.export). 최대 5,000건.
 */

function cell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));

  try {
    const since = Timestamp.fromDate(new Date(Date.now() - days * 86400000));
    const snap = await adminDb
      .collection("admin_logs")
      .where("at", ">=", since)
      .orderBy("at", "desc")
      .limit(5000)
      .get();

    await logAdminAction({
      actorUid: session.uid,
      actorEmail: session.email,
      action: "log.export",
      targetType: "admin",
      targetId: `days-${days}-${snap.size}`,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    const header = "시각,관리자,행위,대상 유형,대상,사유";
    const lines = snap.docs.map((d) => {
      const v = d.data();
      return [
        v.at?.toDate?.()?.toISOString() ?? "",
        v.actorEmail ?? "",
        v.action ?? "",
        v.targetType ?? "",
        v.targetId ?? "",
        v.reason ?? "",
      ]
        .map(cell)
        .join(",");
    });
    const csv = "﻿" + [header, ...lines].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment",
      },
    });
  } catch (e) {
    console.error("[admin/logs/export]", e);
    return Response.json({ error: "반출에 실패했어요." }, { status: 500 });
  }
}
