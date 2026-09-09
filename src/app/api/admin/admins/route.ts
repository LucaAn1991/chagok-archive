import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";

/**
 * 관리자 목록 — **읽기 전용** (백오피스 기획 §2-⑥).
 * 부여/회수 API는 의도적으로 없다 — 화면에서 권한을 줄 수 있으면 계정 하나가
 * 탈취됐을 때 권한이 확산된다. scripts/grant-admin.ts로만 한다.
 */
export async function GET(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  try {
    const list = await adminAuth.listUsers(1000);
    const admins = list.users
      .filter((u) => u.customClaims?.admin === true)
      .map((u) => ({
        uid: u.uid,
        email: u.email ?? "",
        lastSignInTime: u.metadata.lastSignInTime ?? null,
      }));
    return NextResponse.json({ admins });
  } catch (e) {
    console.error("[admin/admins]", e);
    return NextResponse.json({ error: "목록을 불러오지 못했어요." }, { status: 500 });
  }
}
