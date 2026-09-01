"use client";

import { auth } from "@/lib/firebase/client";
import type { UserConsent } from "./types";
import { LEGAL_VERSIONS } from "./versions";

/**
 * 동의 기록 클라이언트 헬퍼 (09-01) — 저장·조회는 전부 /api/consents를 거친다
 * (agreedAt이 서버 시각이어야 해서 클라이언트가 Firestore에 직접 쓰지 않는다).
 *
 * 설정 화면(창현 님)에서 쓸 것:
 *   - fetchLatestConsent()        — 현재 선택 동의 상태 읽기 (usageDataConsent)
 *   - setUsageDataConsent(on)     — 이용 데이터 활용 켜고 끄기 (새 이력으로 쌓임)
 */

async function authedFetch(method: "GET" | "POST" | "PATCH", body?: unknown) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const token = await user.getIdToken();
  const res = await fetch("/api/consents", {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await res.json().catch(() => null)) as { consent?: UserConsent | null; error?: string } | null;
  if (!res.ok) throw new Error(data?.error ?? "요청에 실패했어요.");
  return data?.consent ?? null;
}

/** 내 최신 동의 기록 — 없으면 null */
export async function fetchLatestConsent(): Promise<UserConsent | null> {
  return authedFetch("GET");
}

/** 최초 동의 저장 — 필수 3개 true여야 서버가 받는다. 버전은 서버가 찍는다 */
export async function saveInitialConsent(input: {
  isOver14: boolean;
  agreeTerms: boolean;
  agreePrivacy: boolean;
  usageDataConsent: boolean;
}): Promise<UserConsent | null> {
  return authedFetch("POST", input);
}

/** 선택(이용 데이터 활용)만 변경 — 설정 화면용. 새 기록으로 쌓인다 */
export async function setUsageDataConsent(enabled: boolean): Promise<UserConsent | null> {
  return authedFetch("PATCH", { usageDataConsent: enabled });
}

/** 저장된 동의가 현행 버전과 맞는가 — 다르면 재동의가 필요하다 (§5) */
export function isConsentCurrent(
  consent: { termsVersion?: string; privacyVersion?: string } | null | undefined,
): boolean {
  return (
    consent?.termsVersion === LEGAL_VERSIONS.terms.version &&
    consent?.privacyVersion === LEGAL_VERSIONS.privacy.version
  );
}
