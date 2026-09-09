/**
 * 백오피스 관리자 권한 부여/회수 (백오피스 기획 §2-⑥).
 *
 * 실행:
 *   npx tsx scripts/grant-admin.ts <이메일> --reason "사유"            부여
 *   npx tsx scripts/grant-admin.ts <이메일> --revoke --reason "사유"   회수
 *
 * 화면이 아니라 스크립트로만 하는 이유 — 백오피스에서 권한을 줄 수 있으면
 * 관리자 계정 한 개가 탈취됐을 때 공격자가 권한을 확산시킬 수 있다.
 * 부여/회수도 감사 로그(admin_logs)에 남는다.
 *
 * 권한은 다음 토큰 갱신(최대 1시간) 또는 재로그인 때 반영된다 —
 * 즉시 반영이 필요하면 대상자가 로그아웃 후 다시 로그인하면 된다.
 */
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/** .env.local을 직접 읽는다 — 스크립트는 Next.js 밖이라 자동 로드가 없다 */
function loadEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--"));
  const revoke = args.includes("--revoke");
  const reasonIdx = args.indexOf("--reason");
  const reason = reasonIdx !== -1 ? args[reasonIdx + 1]?.trim() : undefined;

  if (!email || !reason) {
    console.error('사용법: npx tsx scripts/grant-admin.ts <이메일> [--revoke] --reason "사유"');
    process.exit(1);
  }

  const env = loadEnvLocal();
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(".env.local의 FIREBASE_ADMIN_* 세 값을 먼저 채워주세요.");
  }
  if (getApps().length === 0) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
  }
  const auth = getAuth();
  const db = getFirestore();

  const user = await auth.getUserByEmail(email);
  const claims = { ...(user.customClaims ?? {}) };

  if (revoke) delete claims.admin;
  else claims.admin = true;

  await auth.setCustomUserClaims(user.uid, claims);
  // 발급된 토큰을 즉시 무효화 — 회수가 특히 그렇다. 대상자는 다시 로그인해야 한다
  await auth.revokeRefreshTokens(user.uid);

  await db.collection("admin_logs").add({
    actorUid: "script:grant-admin",
    actorEmail: clientEmail,
    action: revoke ? "admin.revoke" : "admin.grant",
    targetType: "admin",
    targetId: user.uid,
    reason,
    before: null,
    after: null,
    ip: null,
    userAgent: null,
    at: FieldValue.serverTimestamp(),
  });

  console.log(`${revoke ? "회수" : "부여"} 완료: ${email} (${user.uid})`);
  console.log("반영: 대상자가 재로그인하면 즉시, 아니면 다음 토큰 갱신 때.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
