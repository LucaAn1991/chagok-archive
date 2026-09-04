"use client";

import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import CardThumb from "@/components/CardThumb";
import { contentTypeForAudience } from "@/lib/audiences";
import { audienceLine } from "@/lib/format";
import type { Card } from "@/types";

/**
 * 오늘 올릴 카드가 **여러 장일 때** 가로로 늘어놓는다 (09-03).
 *
 * 「템플릿 고르기」(`plan/new`의 StylePicker)와 같은 모양이다 — 그림이 위, 글이 아래,
 * 오른쪽 칸이 반쯤 잘려 «더 있다»를 말한다. 이미 쓰고 있는 조작이라 새로 배울 게 없다.
 *
 * **한 장일 때는 쓰지 않는다.** 그때는 `FeaturedContentCard`가 폭을 다 써서 크게 뜬다 —
 * 하나면 집중해서 보여주고, 여럿이면 나란히 놓고 고르게 한다.
 *
 * 세로로 쌓지 않은 이유 — 3장이면 화면을 다 먹어서 아래 「이번 주 콘텐츠」가 밀려난다.
 * 홈은 한 화면에 들어와야 «오늘 뭘 해야 하나»가 한눈에 온다.
 */
export default function TodayCardRail({ cards }: { cards: Card[] }) {
  return (
    <div
      /*
        `overscroll-x-contain` — 가로로 밀 때 바깥 화면까지 같이 밀리지 않게 (09-02에
        캘린더·템플릿 줄에서 겪었다). 음수 여백으로 화면 끝까지 흘려보내지도 않는다.
      */
      className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1"
    >
      {cards.map((card) => (
          <article
            key={card.id}
            className="card-raise flex w-[236px] shrink-0 snap-start flex-col overflow-hidden rounded-lg bg-surface sm:w-[268px]"
          >
            {/* 완성된 첫 장 > 올린 사진 > 스톡 > 안내 (CardThumb) */}
            <CardThumb card={card} className="aspect-[4/3] w-full" />

            <div className="flex flex-1 flex-col p-3">
              <StatusBadge status={card.status} />
              {/* 두 줄에서 자른다 — 카드 높이가 제각각이면 줄이 들쭉날쭉해진다 */}
              <h3 className="mt-2 line-clamp-2 break-keep text-body font-bold text-ink">
                {card.title}
              </h3>
              <p className="mt-1 mb-3 line-clamp-1 text-caption text-sub">
                {audienceLine(card.audience)} · {contentTypeForAudience(card.audience)}
              </p>

              {/*
                `mt-auto` — 버튼을 카드 바닥에 붙인다. 제목이 한 줄인 카드와 두 줄인
                카드가 섞이면 버튼 높이가 들쭉날쭉해서 줄이 어수선해진다.
              */}
              <Link
                href={`/card/${card.id}/result`}
                className="mt-auto flex h-10 items-center justify-center rounded-md bg-berry pt-0 text-body font-semibold text-white transition-colors duration-200 hover:bg-berry-dark"
              >
                {card.status === "planned" ? "제작하기" : "이어서 보기"}
              </Link>
            </div>
          </article>
      ))}
    </div>
  );
}
