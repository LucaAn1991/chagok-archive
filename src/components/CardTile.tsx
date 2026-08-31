"use client";

import Link from "next/link";
import StatusBadge from "./StatusBadge";
import type { Card } from "@/types";

/**
 * 콘텐츠 카드 공용 문법 (08-31) — 어디서든 «썸네일 · 제목 · 상태» 세 요소를
 * 유지하고 크기만 바꾼다. 카드 상세와 캘린더 사이에서 같은 객체라는 감각이
 * 끊기지 않게 하는 장치다. (월간 칸만 예외 — dot + 제목 2줄의 최소 표현)
 *
 * - "tile": 주간 보드용 세로형. CTA를 넣지 않는다 — 클릭하면 선택되고,
 *   행동은 오른쪽 패널이 맡는다 (CTA가 화면 곳곳에서 튀지 않게, 08-31)
 * - "row":  날짜 리스트용 가로형 (DESIGN §8 Mobile — 리스트에서는 썸네일 허용)
 */
export default function CardTile({
  card,
  variant,
  subline,
  selected,
  onClick,
  onDragStart,
  onDragEnd,
}: {
  card: Card;
  variant: "tile" | "row";
  subline?: string; // row: 대상·예정일 지남 등 보조 한 줄
  selected?: boolean; // tile: 선택된 날의 카드 표시
  onClick?: () => void; // tile: 클릭 = 선택 (상세 이동은 패널의 몫)
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  if (variant === "row") {
    return (
      <Link
        href={`/card/${card.id}`}
        className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 hover:bg-surface-muted"
      >
        {card.photoUrls?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.photoUrls[0]} alt="" className="size-12 shrink-0 rounded-sm object-cover" />
        ) : (
          <span className="size-12 shrink-0 rounded-sm bg-surface-muted" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-ink">{card.title}</span>
          {subline && <span className="mt-0.5 block truncate text-caption text-sub">{subline}</span>}
        </span>
        <StatusBadge status={card.status} />
      </Link>
    );
  }

  return (
    <article
      draggable={onDragStart != null}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        if (!onClick) return;
        e.stopPropagation();
        onClick();
      }}
      className={[
        "overflow-hidden rounded-md border bg-surface",
        selected ? "border-berry" : "border-line",
        onClick ? "cursor-pointer hover:bg-surface-muted" : "",
        onDragStart != null ? "cursor-grab" : "",
      ].join(" ")}
    >
      {card.photoUrls?.[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.photoUrls[0]} alt="" className="aspect-video w-full object-cover" />
      )}
      <div className="flex flex-col items-start gap-1.5 p-2">
        {/* break-keep — 한국어를 단어 중간에서 끊지 않는다. 2줄 넘으면 … (08-31) */}
        <span className="line-clamp-2 break-keep text-caption font-semibold text-ink">
          {card.title}
        </span>
        <StatusBadge status={card.status} />
      </div>
    </article>
  );
}
