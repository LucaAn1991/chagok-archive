import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import type { Card } from "@/types";

/** 'YYYY-MM-DD' → 'M월 D일 (요일)' */
function formatScheduledDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

/**
 * 홈 전용 Featured 카드 — DESIGN.md §6 ContentCard 3 variant 중 하나.
 * 홈에 1개만 놓는다. 여러 장 나열하면 「다시 고르는 화면」이 된다.
 *
 * 담는 것: 상태 · 예정일 · 주제 2줄 · 대상 · 썸네일(선택) · CTA 제작하기.
 * 기획의도(intent)는 여기서 숨기고 카드 상세에서만 노출한다.
 */
export default function FeaturedContentCard({ card }: { card: Card }) {
  const thumbnail = card.photoUrls[0];

  return (
    <section className="rounded-lg border border-line bg-surface p-5 md:p-6">
      <div className="flex items-center gap-2.5">
        <StatusBadge status={card.status} />
        <span className="text-caption text-sub">
          {formatScheduledDate(card.scheduledDate)} 예정
        </span>
      </div>

      <div className="mt-4 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-h3 font-bold text-ink">{card.title}</h2>
          <p className="mt-1.5 text-body text-sub">{card.audience}에게</p>
        </div>
        {thumbnail ? (
          // 썸네일은 선택 사항 — 사진이 있을 때만. Next/Image는 원격 도메인 설정 후 전환
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail}
            alt=""
            className="h-16 w-16 shrink-0 rounded-sm border border-line object-cover"
          />
        ) : null}
      </div>

      {/* 모바일 주 CTA는 Large(48) — DESIGN.md §6. 화면에 primary는 이거 하나 */}
      <Link
        href={`/card/${card.id}`}
        className="mt-5 flex h-12 w-full items-center justify-center rounded-md bg-berry text-[15px] font-semibold text-white transition-colors duration-200 hover:bg-berry-dark md:h-11"
      >
        제작하기
      </Link>
    </section>
  );
}
