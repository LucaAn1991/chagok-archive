"use client";

import Link from "next/link";
import StatusBadge from "./StatusBadge";
import type { Card } from "@/types";

/**
 * 콘텐츠 카드 공용 문법 (08-31) — 어디서든 «썸네일 · 제목 · 상태» 세 요소를
 * 유지하고 크기만 바꾼다. 카드 상세와 캘린더 사이에서 같은 객체라는 감각이
 * 끊기지 않게 하는 장치다. (월간 칸만 예외 — DESIGN §8 최소 표현 ▌+짧은제목)
 *
 * - "tile": 주간 플래너 컬럼용 세로형. action 자리에 상태별 CTA가 들어간다
 * - "row":  날짜 리스트용 가로형 (DESIGN §8 Mobile — 리스트에서는 썸네일 허용)
 */
export default function CardTile({
  card,
  variant,
  subline,
  action,
  onDragStart,
  onDragEnd,
}: {
  card: Card;
  variant: "tile" | "row";
  subline?: string; // row: 대상·예정일 지남 등 보조 한 줄
  action?: React.ReactNode; // tile: 상태별 CTA
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
      className={[
        "overflow-hidden rounded-md border border-line bg-surface",
        onDragStart != null ? "cursor-grab" : "",
      ].join(" ")}
    >
      {card.photoUrls?.[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.photoUrls[0]} alt="" className="aspect-video w-full object-cover" />
      )}
      <div className="flex flex-col items-start gap-1.5 p-2">
        <Link
          href={`/card/${card.id}`}
          onClick={(e) => e.stopPropagation()}
          className="line-clamp-2 text-caption font-semibold text-ink hover:underline"
        >
          {card.title}
        </Link>
        <StatusBadge status={card.status} />
        {action}
      </div>
    </article>
  );
}
