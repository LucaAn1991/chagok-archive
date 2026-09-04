"use client";

import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import CardThumb from "@/components/CardThumb";
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
  /* DESIGN.md §4 — 홈 대표 카드는 단독으로 선다: 테두리 대신 깊이 (09-04) */
  return (
    <section className="rounded-lg bg-surface p-4 shadow-e1 md:p-6">
      <StatusBadge status={card.status} />

      <div className="mt-3 flex items-start gap-4 md:mt-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 font-bold text-ink">{card.title}</h2>
          <p className="mt-1.5 text-body text-sub">
            {audienceLine(card.audience)} · {contentTypeForAudience(card.audience)}
          </p>
        </div>
        {/*
          09-03 — 재료 사진이 아니라 **완성된 첫 장**을 먼저 보여준다.
          만들어둔 카드라면 «올릴 그 그림»이 있는데 그동안 재료만 띄우고 있었다.
          없으면 CardThumb이 재료 사진 → 스톡 → 안내로 물러선다.
        */}
        <CardThumb
          card={card}
          className="h-20 w-20 shrink-0 overflow-hidden rounded-sm border border-line"
        />
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
