import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";

export const metadata: Metadata = { title: "이용약관 — 차곡" };

/**
 * 이용약관 전문 (09-01 개편) — 본문은 content/legal/terms-1.0.md를 읽는다.
 * 로그인 없이 열린다. 조항 제목만 있던 PolicyDocument 틀은 md 렌더로 대체했다.
 */
export default function TermsPage() {
  return <LegalDocument docId="terms" title="이용약관" />;
}
