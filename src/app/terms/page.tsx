import type { Metadata } from "next";
import PolicyDocument from "@/components/PolicyDocument";
import { AI_DISCLOSURE_TERMS } from "@/lib/ai-disclosure";

export const metadata: Metadata = { title: "이용약관 — 차곡" };

/**
 * 이용약관 — 조항 제목은 국내 서비스 약관의 통상 구성. 본문은 추후 작성.
 *
 * **제5조만 본문이 있다.** AI 기본법 제31조 ①이 요구하는 사전 고지라,
 * 제목만 두고 본문을 비우면 고지를 안 한 것이 된다 (lib/ai-disclosure.ts).
 * 서비스 제공 방식에 관한 조항이므로 제4조 바로 뒤에 두고, 뒤 조항 번호를 밀었다.
 */
export default function TermsPage() {
  return (
    <PolicyDocument
      title="이용약관"
      sections={[
        "제1조 (목적)",
        "제2조 (정의)",
        "제3조 (약관의 게시와 개정)",
        "제4조 (서비스의 제공 및 변경)",
        AI_DISCLOSURE_TERMS,
        "제6조 (회원가입)",
        "제7조 (회원 탈퇴 및 자격 상실)",
        "제8조 (회원의 의무)",
        "제9조 (저작권의 귀속)",
        "제10조 (면책조항)",
      ]}
    />
  );
}
