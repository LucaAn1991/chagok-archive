/**
 * AI 대화 말풍선 — DESIGN.md §7.
 * AI: --surface + 1px --line · 사용자: --berry-light 테두리 없음.
 * 아바타(로고 심볼 그라데이션) + 「차곡」은 연속 발화의 첫 줄에만 붙인다.
 * ✦는 대기 상태 전용이라 말풍선에 붙이지 않는다.
 */
export default function AIChatBubble({
  role,
  text,
  showAvatar,
}: {
  role: "user" | "assistant";
  text: string;
  showAvatar: boolean; // 연속 발화의 첫 번째만 true
}) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        {/* 연한 브랜드 면 위 글자는 --berry-dark가 아니라... 본문이라 --ink (§15 대비 13:1↑) */}
        <p className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-berry-light px-4 py-3 text-body text-ink md:max-w-[70%]">
          {text}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {showAvatar && (
        <span className="flex items-center gap-2">
          {/* 그라데이션 허용 4곳 중 「AI 아바타」 (DESIGN.md §2) */}
          <span aria-hidden className="h-5 w-5 rounded-pill" style={{ background: "var(--grad)" }} />
          <span className="text-label font-semibold text-sub">차곡</span>
        </span>
      )}
      <p className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-tl-sm border border-line bg-surface px-4 py-3 text-body text-ink md:max-w-[70%]">
        {text}
      </p>
    </div>
  );
}
