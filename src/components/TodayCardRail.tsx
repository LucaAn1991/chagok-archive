"use client";

import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import CardThumb from "@/components/CardThumb";
import { contentTypeForAudience } from "@/lib/audiences";
import { audienceLine } from "@/lib/format";
import type { Card } from "@/types";

/**
 * 오늘의 **곁들임 카드 줄** — 첫 장 아래에 나머지를 가로로 놓는다 (09-08 개정, DESIGN §9).
 *
 * 「템플릿 고르기」(`plan/new`의 StylePicker)와 같은 모양이다 — 그림이 위, 글이 아래,
 * 오른쪽 칸이 반쯤 잘려 «더 있다»를 말한다. 이미 쓰고 있는 조작이라 새로 배울 게 없다.
 *
 * **09-08 — 「나란히 놓고 고르게」에서 「곁들임」으로 내렸다.**
 * 09-03엔 오늘 카드 전부를 동등한 크기로 늘어놓았다. 오늘 7장이면 같은 크기·같은 색의
 * [제작하기]가 7개 서서, §0의 「주/보조를 같은 크기로 두지 않는다」와 §6의
 * 「한 화면에 primary는 1개」에 걸렸다. 그래서 이 줄은:
 *   - 카드를 **좁게** 잡고 (첫 장의 Featured와 크기로 구분된다). 390px에서 두 장이
 *     딱 맞아떨어지면 「오른쪽이 반쯤 잘려 더 있다고 말하는」 신호가 사라져서 156으로 잡았다
 *   - 버튼을 **secondary**로 (테두리 · `--berry` 글자 — §6 표)
 *   - 개수를 **최대 4장**으로 (호출부가 잘라서 넘긴다 · 나머지는 아래 목록이 받는다)
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
            className="card-raise flex w-[156px] shrink-0 snap-start flex-col overflow-hidden rounded-lg bg-surface sm:w-[196px]"
          >
            {/* 완성된 첫 장 > 올린 사진 > 스톡 > 안내 (CardThumb) */}
            <CardThumb card={card} className="aspect-[4/3] w-full" />

            <div className="flex flex-1 flex-col p-2.5">
              <StatusBadge status={card.status} />
              {/* 두 줄에서 자른다 — 카드 높이가 제각각이면 줄이 들쭉날쭉해진다 */}
              <h2 className="mt-2 line-clamp-2 break-keep text-body font-semibold text-ink">
                {card.title}
              </h2>
              <p className="mt-1 mb-3 line-clamp-1 text-caption text-sub">
                {audienceLine(card.audience)} · {contentTypeForAudience(card.audience)}
              </p>

              {/*
                `mt-auto` — 버튼을 카드 바닥에 붙인다. 제목이 한 줄인 카드와 두 줄인
                카드가 섞이면 버튼 높이가 들쭉날쭉해서 줄이 어수선해진다.
              */}
              {/*
                **secondary다** (09-08). primary(`--berry` 단색)는 위 첫 장 하나뿐이다 — §6.
                hover에서 글자를 `--berry-dark`로 함께 내린다: `berry-tint` 면 위의
                `--berry`는 AA 미달이라 hover하는 순간에만 대비가 깨진다 (§15).
                높이는 44 — §15 터치 타깃.
              */}
              <Link
                href={`/card/${card.id}/result`}
                className="mt-auto flex h-11 items-center justify-center rounded-md border-2 border-berry bg-surface text-body font-semibold text-berry transition-colors duration-200 hover:bg-berry-tint hover:text-berry-dark"
              >
                {card.status === "planned" ? "제작하기" : "이어서 보기"}
              </Link>
            </div>
          </article>
      ))}
    </div>
  );
}
