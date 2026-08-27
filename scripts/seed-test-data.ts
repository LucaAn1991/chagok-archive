/**
 * 개발용 테스트 데이터 시드.
 *
 * 실행: npx tsx scripts/seed-test-data.ts
 *
 * 실제 Firebase 프로젝트에 만든다 (에뮬레이터 아님):
 *   - Auth 계정   test@chagok.dev / chagok-dev-1234
 *   - users 문서  온보딩 완료 상태
 *   - cards 문서  dev-test-card (기획 완료 상태 · 캡션 없음)
 *
 * 여러 번 실행해도 같은 결과가 되도록 만들었다(멱등).
 * src/lib/firebase/admin.ts는 server-only라 스크립트에서 import할 수 없어
 * 여기서 직접 초기화한다.
 */
import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

export const TEST_EMAIL = "test@chagok.dev";
export const TEST_PASSWORD = "chagok-dev-1234";
export const TEST_CARD_ID = "dev-test-card";

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

  // 1. 테스트 계정 — 있으면 재사용
  let uid: string;
  try {
    uid = (await auth.getUserByEmail(TEST_EMAIL)).uid;
    console.log(`계정 재사용: ${TEST_EMAIL} (${uid})`);
  } catch {
    uid = (await auth.createUser({ email: TEST_EMAIL, password: TEST_PASSWORD })).uid;
    console.log(`계정 생성: ${TEST_EMAIL} (${uid})`);
  }

  // 2. users 문서 — 온보딩 완료 상태 (PLAN.md §2-1)
  await db.collection("users").doc(uid).set({
    uid,
    email: TEST_EMAIL,
    field: "홈트레이닝",
    uploadFrequency: 3,
    tone: "friendly",
    avoidExpressions: ["최저가", "무조건"],
    onboardedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
  });
  console.log("users 문서 저장");

  // 3. cards 문서 — 기획 완료 · 캡션 없음 (PLAN.md §2-3)
  const today = new Date().toISOString().slice(0, 10);
  await db.collection("cards").doc(TEST_CARD_ID).set({
    id: TEST_CARD_ID,
    userId: uid,
    planId: "dev-test-plan",
    title: "아침 10분 홈트, 진짜 효과 있을까?",
    shortTitle: "아침 10분 홈트",
    audience: "운동을 시작하려는 직장인",
    intent: "짧은 운동도 꾸준하면 효과가 있다는 확신 주기",
    scheduledDate: today,
    status: "planned",
    publishIntent: null,
    visualType: "text_only",
    photoUrls: [],
    extraNote: "",
    templateVars: {},
    caption: null,
    slides: [],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    publishedAt: null,
  });
  console.log(`cards 문서 저장: ${TEST_CARD_ID}`);

  console.log("\n시드 완료. 로그인:", TEST_EMAIL, "/", TEST_PASSWORD);
}

main().catch((err) => {
  console.error("시드 실패:", err.message ?? err);
  process.exit(1);
});
