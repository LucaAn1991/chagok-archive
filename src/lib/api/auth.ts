import "server-only";

import { adminAuth } from "../firebase/admin";

/**
 * API 라우트 공통 인증 — Authorization: Bearer <Firebase ID 토큰>에서
 * uid를 꺼낸다. 토큰이 없거나 무효면 null.
 */
export async function getUidFromRequest(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    return (await adminAuth.verifyIdToken(header.slice(7))).uid;
  } catch {
    return null;
  }
}
