import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";

/**
 * 회원 목록 (백오피스 기획 §2-②).
 * GET ?query=&status=all|active|suspended|noonboard&sort=createdAt|lastSignIn&dir=desc|asc&page=1
 *
 * Auth(계정·정지·최근 로그인)와 users 문서(닉네임·목표)를 합쳐서 준다.
 * 규모가 작아(수십~수백) 전체를 읽고 서버에서 거른다 — 인덱스·페이징 인프라 없이
 * 시작하고, listUsers 1천 명 한도에 다가가면 그때 서버 페이징으로 바꾼다.
 */

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  const url = new URL(request.url);
  const query = (url.searchParams.get("query") ?? "").trim().toLowerCase();
  const status = url.searchParams.get("status") ?? "all";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const sort = url.searchParams.get("sort") === "lastSignIn" ? "lastSignIn" : "createdAt";
  const dir = url.searchParams.get("dir") === "asc" ? 1 : -1;

  try {
    const [authList, usersSnap] = await Promise.all([
      adminAuth.listUsers(1000),
      adminDb.collection("users").get(),
    ]);
    const docs = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));

    let rows = authList.users.map((u) => {
      const doc = docs.get(u.uid);
      return {
        uid: u.uid,
        email: u.email ?? "",
        nickname: (doc?.nickname as string) ?? "",
        createdAt: u.metadata.creationTime ?? null,
        lastSignInTime: u.metadata.lastSignInTime ?? null,
        onboarded: Boolean(doc?.onboardedAt),
        disabled: u.disabled,
        uploadFrequency: (doc?.uploadFrequency as number) ?? null,
        uploadDays: (doc?.uploadDays as number[]) ?? [],
      };
    });

    if (query) {
      rows = rows.filter(
        (r) =>
          r.email.toLowerCase().includes(query) ||
          r.nickname.toLowerCase().includes(query) ||
          r.uid === query,
      );
    }
    // 필터 기준은 상태 칼럼의 3분류와 동일해야 한다 (09-09 버그 수정 —
    // «활성»이 disabled 여부만 봐서 온보딩 전 회원까지 포함됐었다)
    if (status === "active") rows = rows.filter((r) => !r.disabled && r.onboarded);
    if (status === "suspended") rows = rows.filter((r) => r.disabled);
    if (status === "noonboard") rows = rows.filter((r) => !r.disabled && !r.onboarded);

    const field = sort === "lastSignIn" ? "lastSignInTime" : "createdAt";
    rows.sort((a, b) => {
      // RFC 문자열이라 사전순이 곧 시간순이 아니다 — Date로 비교한다
      const ta = a[field] ? new Date(a[field]!).getTime() : 0;
      const tb = b[field] ? new Date(b[field]!).getTime() : 0;
      return (ta - tb) * dir;
    });

    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    return NextResponse.json({
      members: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      page,
      totalPages,
      total: rows.length,
    });
  } catch (e) {
    console.error("[admin/members]", e);
    return NextResponse.json({ error: "회원 목록을 불러오지 못했어요." }, { status: 500 });
  }
}
