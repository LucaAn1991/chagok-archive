import type { Metadata } from "next";
import LegalDocument from "@/components/LegalDocument";

export const metadata: Metadata = { title: "개인정보처리방침 — 차곡" };

/**
 * 개인정보처리방침 전문 (09-01 개편) — 본문은 content/legal/privacy-1.0.md를 읽는다.
 * 로그인 없이 열린다.
 */
export default function PrivacyPage() {
  return <LegalDocument docId="privacy" title="개인정보처리방침" />;
}
