import "server-only";

import { adminAuth } from "@/lib/firebase/admin";

/**
 * API 라우트의 인증 확인 — Authorization: Bearer <Firebase ID 토큰>.
 *
 * 모든 /api 라우트가 인증 필요(PLAN §6)이므로 여기 한 곳에서 처리한다.
 * 실패 시 null — 라우트는 401로 응답한다.
 */
export async function verifyRequest(request: Request): Promise<{ uid: string } | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(header.slice("Bearer ".length));
    return { uid: decoded.uid };
  } catch {
    return null;
  }
}
