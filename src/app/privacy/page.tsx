import type { Metadata } from "next";
import PolicyDocument from "@/components/PolicyDocument";

export const metadata: Metadata = { title: "개인정보처리방침 — 차곡" };

/** 개인정보처리방침 — 조항 제목은 통상 구성. 본문은 추후 작성 */
export default function PrivacyPage() {
  return (
    <PolicyDocument
      title="개인정보처리방침"
      sections={[
        "1. 수집하는 개인정보의 항목",
        "2. 개인정보의 수집 및 이용 목적",
        "3. 개인정보의 보유 및 이용 기간",
        "4. 개인정보의 제3자 제공",
        "5. 개인정보의 파기 절차 및 방법",
        "6. 이용자의 권리와 행사 방법",
        "7. 개인정보 보호책임자 및 문의처",
      ]}
    />
  );
}
