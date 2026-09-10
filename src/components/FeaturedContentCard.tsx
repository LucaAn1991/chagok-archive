"use client";

import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import CardThumb from "@/components/CardThumb";
import { contentTypeForAudience } from "@/lib/audiences";
import { audienceLine, cardCtaLabel } from "@/lib/format";
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
  ahead,
  ctaHref,
}: {
  card: Card;
  /** 오늘이 아니라 «앞으로» 올릴 카드 — 라벨에 「미리」가 붙는다 (홈 C 분기) */
  ahead?: boolean;
  ctaHref: string;
}) {
  /*
    라벨을 **넘겨받지 않고 여기서 고른다** (09-08). 예전엔 부모가 "제작하기"를
    통째로 넘겨서, 이미 만들어 둔 카드에도 「제작하기」라고 적혔다 — 바로 위
    `StatusBadge`는 「업로드 대기」라고 말하는데. 규칙은 `cardCtaLabel` 하나뿐이다.
  */
  const ctaLabel = cardCtaLabel(card.status, ahead);
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
        className="mt-4 flex h-11 w-full md:mt-5 items-center justify-center rounded-md bg-action inset-ring inset-ring-action-border text-[15px] font-semibold text-on-action transition-colors duration-200 hover:bg-action-hover md:h-11"
      >
        {ctaLabel}
      </Link>
    </section>
  );
}
