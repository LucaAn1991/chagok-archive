import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-log";

/**
 * 회원 목록 CSV 반출 (백오피스 기획 §2-②).
 * GET ?reason=... — **개인정보 반출**이라 사유 없이는 거부하고, 반출 사실을
 * 감사 로그(user.export)에 남긴다. 필터 없이 전체를 내린다(반출본이 잘려 있으면
 * 나중에 «그때 전체가 몇 명이었나»를 증명할 수 없다).
 */

function cell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export async function GET(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  const reason = (new URL(request.url).searchParams.get("reason") ?? "").trim();
  if (!reason) {
    return Response.json({ error: "반출 사유가 필요해요." }, { status: 400 });
  }

  try {
    const [authList, usersSnap] = await Promise.all([
      adminAuth.listUsers(1000),
      adminDb.collection("users").get(),
    ]);
    const docs = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));

    const rows = authList.users
      .map((u) => {
        const doc = docs.get(u.uid);
        return {
          uid: u.uid,
          email: u.email ?? "",
          nickname: (doc?.nickname as string) ?? "",
          createdAt: u.metadata.creationTime ?? "",
          lastSignInTime: u.metadata.lastSignInTime ?? "",
          onboarded: doc?.onboardedAt ? "완료" : "미완료",
          status: u.disabled ? "정지" : "활성",
          uploadFrequency: (doc?.uploadFrequency as number) ?? "",
          uploadDays: (((doc?.uploadDays as number[]) ?? []).map((d) => DAY_LABELS[d]) ?? []).join(
            "·",
          ),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    await logAdminAction({
      actorUid: session.uid,
      actorEmail: session.email,
      action: "user.export",
      targetType: "user",
      targetId: `all-${rows.length}`,
      reason,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    const header = "uid,이메일,닉네임,가입일,최근 로그인,온보딩,상태,주간 목표,업로드 요일";
    const lines = rows.map((r) =>
      [
        r.uid,
        r.email,
        r.nickname,
        r.createdAt,
        r.lastSignInTime,
        r.onboarded,
        r.status,
        r.uploadFrequency,
        r.uploadDays,
      ]
        .map(cell)
        .join(","),
    );
    // ﻿(BOM) — 엑셀이 한글을 UTF-8로 읽게 하는 표식
    const csv = "﻿" + [header, ...lines].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment",
      },
    });
  } catch (e) {
    console.error("[admin/members/export]", e);
    return Response.json({ error: "반출에 실패했어요." }, { status: 500 });
  }
}
