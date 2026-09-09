import ComingSoon from "@/components/admin/ComingSoon";

export default function AdminNotificationsPage() {
  return (
    <ComingSoon
      title="알림"
      phase="구현 5단계"
      items={[
        "알림 4종 스위치 — 발행일 리마인드 · 잔고 소진 · 놓친 카드 · 문의 답변",
        "템플릿 문구 편집 · 발송 이력",
        "수동 전체 발송 (수신 동의자 대상 · 사유 필수)",
      ]}
    />
  );
}
