/**
 * 동의 기록 (09-01) — Firestore `consents` 컬렉션의 문서 한 건.
 *
 * 🔴 덮어쓰지 않고 이력으로 쌓는다 — 약관이 개정돼도 «그때 어떤 버전에
 * 동의했는지»가 남아야 회사가 동의 사실을 입증할 수 있다.
 * 쓰기는 서버(API Route)만 한다 — agreedAt이 서버 시각이어야 해서다.
 */
export interface UserConsent {
  userId: string;
  isOver14: boolean; // 필수 — true가 아니면 가입 완료 불가
  termsVersion: string; // 동의한 이용약관 버전 (예: '1.0' — LEGAL_VERSIONS에서 찍는다)
  privacyVersion: string; // 동의한 개인정보처리방침 버전
  usageDataConsent: boolean; // 선택 — 이용 데이터 활용. 설정에서 켜고 끌 때마다 새 기록
  agreedAt: string; // ISO 8601 — 서버 시각. 클라이언트 시각을 믿지 않는다
}

/** users 문서에 얹는 최신 동의 요약 — 홈·온보딩 가드가 추가 조회 없이 읽는다 */
export type LatestConsentSummary = Pick<
  UserConsent,
  "isOver14" | "termsVersion" | "privacyVersion" | "usageDataConsent" | "agreedAt"
>;
