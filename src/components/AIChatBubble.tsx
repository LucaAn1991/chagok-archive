import { LogoSymbol } from "@/components/Logo";

/**
 * 시스템 이벤트 라인 — 대화가 아니라 상태 변경 기록 (08-28).
 * 가운데 정렬 · 말풍선 배경·테두리·아바타 없음 · 좌우 얇은 구분선.
 * 주제를 여러 번 바꿔도 말풍선처럼 쌓여 화면을 밀어내지 않는다.
 */
export function SystemEventLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3" role="status">
      <span aria-hidden className="h-px flex-1 bg-line" />
      <span className="max-w-[70%] truncate text-center text-[13px] text-sub">{text}</span>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}

/**
 * AI 대화 말풍선 — DESIGN.md §7.
 * AI: --surface + 1px --line · 사용자: --berry-light 테두리 없음.
 * 아바타(로고 심볼) + 「차곡」은 연속 발화의 첫 줄에만 붙인다.
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
          {/* 아바타 = 로고 심볼 (08-31). 말하는 주체가 «차곡»이라는 걸 그대로 보여준다 */}
          <LogoSymbol size={20} />
          <span className="text-label font-semibold text-sub">차곡</span>
        </span>
      )}
      <p className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-tl-sm border border-line bg-surface px-4 py-3 text-body text-ink md:max-w-[70%]">
        {text}
      </p>
    </div>
  );
}
