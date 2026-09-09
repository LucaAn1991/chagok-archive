import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";

/**
 * 문의 큐 (백오피스 기획 §2-②).
 * GET ?status=open|answered|all — 기본 open, **오래된 순**(먼저 온 것부터 처리).
 * 행에 이메일을 붙여 회원 상세로 점프할 수 있게 한다.
 */
export async function GET(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  const status = new URL(request.url).searchParams.get("status") ?? "open";

  try {
    // 인덱스 없이 간다 — 전체 규모가 작아 서버에서 거르고 정렬한다
    const snap = await adminDb.collection("inquiries").get();
    let rows = snap.docs.map((d) => {
      const v = d.data();
      return {
        id: d.id,
        userId: (v.userId as string) ?? "",
        category: (v.category as string) ?? "etc",
        body: (v.body as string) ?? "",
        status: (v.status as string) ?? "open",
        createdAt: v.createdAt?.toDate?.()?.toISOString() ?? null,
        answer: (v.answer as { body: string; answeredAt: string; adminEmail: string } | null) ?? null,
        email: "",
      };
    });
    if (status !== "all") rows = rows.filter((r) => r.status === status);
    rows.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "")); // 오래된 순

    // 이메일 붙이기 — 문의자 수만큼만 조회
    const uids = [...new Set(rows.map((r) => r.userId))].filter(Boolean);
    const users = await Promise.all(
      uids.map((uid) => adminAuth.getUser(uid).catch(() => null)),
    );
    const emailOf = new Map(users.filter(Boolean).map((u) => [u!.uid, u!.email ?? ""]));
    rows = rows.map((r) => ({ ...r, email: emailOf.get(r.userId) ?? "(탈퇴한 계정)" }));

    return NextResponse.json({ inquiries: rows });
  } catch (e) {
    console.error("[admin/inquiries]", e);
    return NextResponse.json({ error: "문의를 불러오지 못했어요." }, { status: 500 });
  }
}
