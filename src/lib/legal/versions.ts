/**
 * 약관 버전의 단일 출처 (09-01) — 화면·저장 로직 어디에도 '1.0'을 직접 쓰지 않는다.
 * 본문이 개정되면 content/legal/에 새 파일(terms-1.1.md …)을 추가하고 여기 버전만 올린다.
 *
 * effectiveDate가 'ooo'(미정)면 화면은 시행일 줄을 그리지 않는다 — hasEffectiveDate().
 */
export const LEGAL_VERSIONS = {
  terms: { version: "1.0", effectiveDate: "ooo" },
  privacy: { version: "1.0", effectiveDate: "ooo" },
} as const;

export type LegalDocId = keyof typeof LEGAL_VERSIONS;

/** 시행일이 정해졌는가 — 'ooo'는 미정 표식이라 화면에 내보내지 않는다 */
export function hasEffectiveDate(docId: LegalDocId): boolean {
  return LEGAL_VERSIONS[docId].effectiveDate !== "ooo";
}

/** 문서 id → content/legal/ 파일 이름 */
export function legalFileName(docId: LegalDocId): string {
  return `${docId}-${LEGAL_VERSIONS[docId].version}.md`;
}

/** 문서 id → 전문 페이지 경로 (기존 라우트 재사용 — 09-01 확인) */
export const LEGAL_PAGE_PATHS: Record<LegalDocId, string> = {
  terms: "/terms",
  privacy: "/privacy",
};
