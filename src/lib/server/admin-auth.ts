import "server-only";

import { adminAuth } from "@/lib/firebase/admin";
import { logAdminAction } from "./admin-log";

/**
 * 백오피스 인증 (백오피스 기획 §2-⑥).
 *
 * 단일 admin 역할 — Firebase Auth 커스텀 클레임 `admin: true`.
 * 부여/회수는 scripts/grant-admin.ts로만 한다(화면에 두지 않는다 — 계정 하나가
 * 탈취됐을 때 권한이 확산되는 길을 만들지 않으려고).
 */

export type AdminSession = {
  uid: string;
  email: string;
  /** 이 토큰의 로그인 시각 (초 단위 epoch) — 새 로그인 감지에 쓴다 */
  authTime: number;
};

/**
 * 인스턴스 메모리에 «마지막으로 기록한 로그인 시각»을 든다.
 * 서버가 재시작되면 비워져 같은 로그인이 한 번 더 기록될 수 있다 —
 * 중복 한 건이 누락 한 건보다 낫다는 선택이다.
 */
const loggedAuthTimes = new Map<string, number>();

/**
 * admin 클레임 검증. 관리자면 세션을, 아니면 null.
 * 새 로그인(auth_time 갱신)이 감지되면 `admin.login`을 감사 로그에 남긴다.
 */
export async function verifyAdmin(request: Request): Promise<AdminSession | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(header.slice("Bearer ".length));
    if (decoded.admin !== true) return null;

    const session: AdminSession = {
      uid: decoded.uid,
      email: decoded.email ?? "",
      authTime: decoded.auth_time,
    };

    const last = loggedAuthTimes.get(session.uid) ?? 0;
    if (session.authTime > last) {
      loggedAuthTimes.set(session.uid, session.authTime);
      await logAdminAction({
        actorUid: session.uid,
        actorEmail: session.email,
        action: "admin.login",
        targetType: "admin",
        targetId: session.uid,
        userAgent: request.headers.get("user-agent") ?? undefined,
      }).catch((e) => console.error("admin.login 기록 실패", e));
    }

    return session;
  } catch {
    return null;
  }
}

/** 관리자 아님/미로그인에 대한 공통 응답 */
export function adminDenied(): Response {
  return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
}
