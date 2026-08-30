import type { Metadata } from "next";
import PolicyDocument from "@/components/PolicyDocument";

export const metadata: Metadata = { title: "이용약관 — 차곡" };

/** 이용약관 — 조항 제목은 국내 서비스 약관의 통상 구성. 본문은 추후 작성 */
export default function TermsPage() {
  return (
    <PolicyDocument
      title="이용약관"
      sections={[
        "제1조 (목적)",
        "제2조 (정의)",
        "제3조 (약관의 게시와 개정)",
        "제4조 (서비스의 제공 및 변경)",
        "제5조 (회원가입)",
        "제6조 (회원 탈퇴 및 자격 상실)",
        "제7조 (회원의 의무)",
        "제8조 (저작권의 귀속)",
        "제9조 (면책조항)",
      ]}
    />
  );
}
