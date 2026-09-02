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
  /*
    제작이 끝난 카드(pending·published)는 대표 비주얼을 보여준다 (08-31):
    사용자 사진 → 슬라이드 이미지 → 글자 표지 미니어처(첫 슬라이드 문구) 순.
    완성 PNG는 저장하지 않으므로(PLAN §9) 재료로 표지를 흉내 낸다.
  */
  const thumbUrl = card.photoUrls?.[0] ?? card.slides?.find((s) => s.imageUrl)?.imageUrl ?? null;
  const crafted = card.status === "pending" || card.status === "published";
  const coverText =
    crafted && !thumbUrl && card.slides?.length
      ? (Object.values(card.slides[0].texts ?? {})[0] ?? null)
      : null;

  if (variant === "row") {
    return (
      <Link
        href={`/card/${card.id}`}
        className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 hover:bg-surface-muted"
      >
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt="" className="size-12 shrink-0 rounded-sm object-cover" />
        ) : (
          <span
            className={[
              "size-12 shrink-0 rounded-sm",
              coverText ? "bg-berry-light" : "bg-surface-muted",
            ].join(" ")}
          />
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
      {thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbUrl} alt="" className="aspect-video w-full object-cover" />
      ) : coverText ? (
        <div className="flex aspect-video w-full items-center justify-center bg-berry-light px-3">
          <span className="line-clamp-2 break-keep text-center text-caption font-semibold text-berry-dark">
            {coverText}
          </span>
        </div>
      ) : null}
      <div className="flex flex-col items-start gap-1.5 p-2">
        {/* break-keep — 한국어를 단어 중간에서 끊지 않는다. 2줄 넘으면 … (08-31) */}
        <span className="line-clamp-2 break-keep text-caption font-semibold text-ink">
          {card.title}
        </span>
        <span className="self-center">
          <StatusBadge status={card.status} />
        </span>
      </div>
    </article>
  );
}
