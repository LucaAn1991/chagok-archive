import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { contentTypeForAudience } from "@/lib/audiences";
import { audienceLine } from "@/lib/format";
import type { Card } from "@/types";

/**
 * 홈 전용 Featured 카드 — DESIGN.md §6 ContentCard 3 variant 중 하나.
 * 홈에 1개만 놓는다. 여러 장 나열하면 「다시 고르는 화면」이 된다.
 *
 * 표시 형식 (08-31 확정) — 두 줄로 나눠 말줄임표가 생기지 않게 한다:
 *   제목
 *   {label}에게 · {콘텐츠 유형}
 * 날짜는 카드가 아니라 위의 상황 문구(오늘/내일/…)가 말한다.
 */
export default function FeaturedContentCard({
  card,
  ctaLabel,
  ctaHref,
}: {
  card: Card;
  ctaLabel: string; // 제작하기 · 미리 제작하기
  ctaHref: string;
}) {
  const thumbnail = card.photoUrls[0];

  return (
    <section className="rounded-lg border border-line bg-surface p-4 md:p-6">
      <StatusBadge status={card.status} />

      <div className="mt-3 flex items-start gap-4 md:mt-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 font-bold text-ink">{card.title}</h2>
          <p className="mt-1.5 text-body text-sub">
            {audienceLine(card.audience)} · {contentTypeForAudience(card.audience)}
          </p>
        </div>
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail}
            alt=""
            className="h-16 w-16 shrink-0 rounded-sm border border-line object-cover"
          />
        ) : null}
      </div>

      <Link
        href={ctaHref}
        className="mt-4 flex h-11 w-full md:mt-5 items-center justify-center rounded-md bg-berry text-[15px] font-semibold text-white transition-colors duration-200 hover:bg-berry-dark md:h-11"
      >
        {ctaLabel}
      </Link>
    </section>
  );
}
