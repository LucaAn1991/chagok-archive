import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyRequest } from "@/lib/server/request-auth";
import { LEGAL_VERSIONS } from "@/lib/legal/versions";
import type { LatestConsentSummary, UserConsent } from "@/lib/legal/types";

/**
 * 동의 기록 API (09-01) — consents 컬렉션은 **서버만** 쓴다.
 *
 * 🔴 agreedAt은 서버 시각(ISO 8601) — 클라이언트 시각을 믿지 않는다.
 * 🔴 버전은 요청 body가 아니라 LEGAL_VERSIONS에서 서버가 찍는다 —
 *    «어떤 내용에 동의했는지»의 증거라 클라이언트가 정할 수 없다.
 * 🔴 덮어쓰지 않고 addDoc으로 이력을 쌓는다. users 문서에는 최신 요약만 얹어
 *    홈·온보딩 가드가 추가 조회 없이 읽게 한다.
 *
 * GET   — 내 최신 동의 기록 (없으면 consent: null)
 * POST  — 최초 동의 저장 { isOver14, agreeTerms, agreePrivacy, usageDataConsent }
 * PATCH — 선택(이용 데이터 활용)만 켜고 끄기 { usageDataConsent } — 설정 화면(창현 님)용.
 *         이때도 새 기록으로 쌓인다.
 */

async function latestConsentOf(uid: string): Promise<(UserConsent & { id: string }) | null> {
  // orderBy를 붙이면 (userId, agreedAt) 복합 인덱스가 필요해진다 — 한 사람의 동의
  // 기록은 몇 건 안 되므로 전부 받아 서버에서 고른다 (09-02 인덱스 없이 동작하게 수정)
  const snap = await adminDb.collection("consents").where("userId", "==", uid).get();
  const docs = snap.docs
    .map((d) => ({ ...(d.data() as UserConsent), id: d.id }))
    .sort((a, b) => b.agreedAt.localeCompare(a.agreedAt));
  return docs[0] ?? null;
}

/** consents에 한 건 추가 + users.latestConsent 요약 갱신 — 한 트랜잭션처럼 순서대로 */
async function appendConsent(uid: string, record: Omit<UserConsent, "userId" | "agreedAt">) {
  const agreedAt = new Date().toISOString(); // 서버 시각
  const full: UserConsent = { userId: uid, agreedAt, ...record };
  await adminDb.collection("consents").add(full);

  const summary: LatestConsentSummary = {
    isOver14: full.isOver14,
    termsVersion: full.termsVersion,
    privacyVersion: full.privacyVersion,
    usageDataConsent: full.usageDataConsent,
    agreedAt,
  };
  await adminDb.collection("users").doc(uid).set({ latestConsent: summary }, { merge: true });
  return full;
}

export async function GET(request: Request) {
  const session = await verifyRequest(request);
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  try {
    const consent = await latestConsentOf(session.uid);
    return NextResponse.json({ consent });
  } catch {
    return NextResponse.json({ error: "동의 기록을 불러오지 못했어요." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await verifyRequest(request);
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청이 올바르지 않아요." }, { status: 400 });
  }

  // 서버에서도 필수 3개를 검증한다 — 화면 검증만 믿지 않는다
  if (body.isOver14 !== true || body.agreeTerms !== true || body.agreePrivacy !== true) {
    return NextResponse.json({ error: "필수 동의가 빠졌어요." }, { status: 400 });
  }

  try {
    const consent = await appendConsent(session.uid, {
      isOver14: true,
      termsVersion: LEGAL_VERSIONS.terms.version,
      privacyVersion: LEGAL_VERSIONS.privacy.version,
      usageDataConsent: body.usageDataConsent === true, // 선택 — 기본 false
    });
    return NextResponse.json({ consent });
  } catch {
    return NextResponse.json({ error: "동의를 저장하지 못했어요." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await verifyRequest(request);
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청이 올바르지 않아요." }, { status: 400 });
  }
  if (typeof body.usageDataConsent !== "boolean") {
    return NextResponse.json({ error: "요청이 올바르지 않아요." }, { status: 400 });
  }

  try {
    const latest = await latestConsentOf(session.uid);
    if (!latest) {
      // 필수 동의가 없는데 선택만 바꿀 수는 없다
      return NextResponse.json({ error: "먼저 필수 동의가 필요해요." }, { status: 409 });
    }
    const consent = await appendConsent(session.uid, {
      isOver14: latest.isOver14,
      termsVersion: latest.termsVersion,
      privacyVersion: latest.privacyVersion,
      usageDataConsent: body.usageDataConsent,
    });
    return NextResponse.json({ consent });
  } catch {
    return NextResponse.json({ error: "설정을 저장하지 못했어요." }, { status: 500 });
  }
}
