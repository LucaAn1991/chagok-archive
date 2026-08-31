"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import InlineAlert from "@/components/InlineAlert";
import StatusBadge from "@/components/StatusBadge";
import {
  WEEKDAY_LABELS,
  currentYearMonth,
  formatDateLabel,
  monthGrid,
  monthRange,
  shiftMonth,
  todayKey,
  type YearMonth,
} from "@/lib/calendar";
import type { Card, CardStatus } from "@/types";

/**
 * 캘린더 (F4 · DESIGN.md §8).
 *
 * **Gallery가 아니라 운영 계획을 한눈에 보는 곳이다.** 그래서 월간 칸에는
 * 썸네일을 넣지 않고(§8) `shortTitle`만 쓴다 — 칸이 좁아 원 제목은 6~9자에서 잘린다.
 *
 * 모바일은 데스크톱을 줄인 게 아니다(§8). 위는 날짜 grid + 점 표시만 두고,
 * 고른 날짜의 카드를 아래 리스트로 편다. 리스트에서는 한 번에 보이는 건수가
 * 적으므로 썸네일을 쓴다.
 *
 * 조회는 클라이언트 SDK로 직접 한다 — PLAN.md §6 「조회는 API route를 만들지 않는다」.
 * 인덱스 `cards (userId ASC, scheduledDate ASC)`가 이 쿼리를 받는다.
 *
 * 버린 카드(discarded)는 캘린더에서 뺀다. 발행률 분모로는 남지만(§11)
 * 「앞으로 할 일」을 보는 화면에 띄울 이유가 없다.
 */

const MAX_PER_CELL = 2; // §8 「칸당 최대 2건, 초과 시 +N건」

type Phase = "loading" | "ready" | "error";

export default function CalendarPage() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [ym, setYm] = useState<YearMonth>(currentYearMonth);
  const [cards, setCards] = useState<Card[]>([]);
  const [uid, setUid] = useState<string | null>(null);

  const [selected, setSelected] = useState<string>(todayKey);
  const [dragging, setDragging] = useState<string | null>(null); // cardId
  const [dragOver, setDragOver] = useState<string | null>(null); // dateKey
  const [moveError, setMoveError] = useState<string | null>(null);

  const today = todayKey();
  const cells = useMemo(() => monthGrid(ym), [ym]);

  /** 날짜별로 묶어둔다 — 칸마다 배열을 훑으면 O(날짜 × 카드)가 된다 */
  const byDate = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const c of cards) {
      const list = map.get(c.scheduledDate);
      if (list) list.push(c);
      else map.set(c.scheduledDate, [c]);
    }
    return map;
  }, [cards]);

  const load = useCallback(
    async (userId: string, target: YearMonth) => {
      const { start, end } = monthRange(target);
      const snap = await getDocs(
        query(
          collection(db, "cards"),
          where("userId", "==", userId),
          where("scheduledDate", ">=", start),
          where("scheduledDate", "<=", end),
        ),
      );
      const list = snap.docs
        .map((d) => ({ ...(d.data() as Card), id: d.id }))
        .filter((c) => c.status !== "discarded");
      setCards(list);
    },
    [],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setUid(user.uid);
      try {
        await load(user.uid, ym);
        setPhase("ready");
      } catch {
        setPhase("error");
      }
    });
    return unsubscribe;
  }, [router, load, ym]);

  /**
   * 드래그로 예정일 변경 (§8 · PLAN.md 「예정일 변경」).
   * 저장 실패 → 원위치 + 안내 (PLAN.md §3-1).
   */
  async function moveCard(cardId: string, toDate: string) {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.scheduledDate === toDate) return;

    const previous = card.scheduledDate;
    // 낙관적 갱신 — 놓자마자 옮겨져야 «끌어다 놓았다»는 느낌이 산다
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, scheduledDate: toDate } : c)),
    );
    setMoveError(null);

    try {
      await updateDoc(doc(db, "cards", cardId), { scheduledDate: toDate });
    } catch {
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, scheduledDate: previous } : c)),
      );
      setMoveError("예정일을 옮기지 못했어요. 다시 시도해주세요.");
    }
  }

  function changeMonth(delta: number) {
    const next = shiftMonth(ym, delta);
    setYm(next);
    setPhase("loading");
    if (uid) {
      load(uid, next)
        .then(() => setPhase("ready"))
        .catch(() => setPhase("error"));
    }
  }

  const selectedCards = byDate.get(selected) ?? [];

  return (
    <div className="flex flex-1">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[1100px] flex-1 p-4 pb-24 md:p-6 md:pb-8 min-[1200px]:p-8">
          {/* 월 이동 */}
          <header className="flex items-center justify-between">
            <h1 className="text-h3 font-bold text-ink">
              {ym.year}년 {ym.month}월
            </h1>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                aria-label="이전 달"
                className="flex h-11 w-11 items-center justify-center rounded-md text-sub hover:bg-surface-muted hover:text-ink"
              >
                <ChevronLeft size={18} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = currentYearMonth();
                  setYm(now);
                  setSelected(today);
                  setPhase("loading");
                  if (uid) {
                    load(uid, now)
                      .then(() => setPhase("ready"))
                      .catch(() => setPhase("error"));
                  }
                }}
                className="h-11 rounded-md px-3 text-body font-semibold text-sub hover:bg-surface-muted hover:text-ink"
              >
                오늘
              </button>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                aria-label="다음 달"
                className="flex h-11 w-11 items-center justify-center rounded-md text-sub hover:bg-surface-muted hover:text-ink"
              >
                <ChevronRight size={18} aria-hidden />
              </button>
            </div>
          </header>

          {moveError && (
            <div className="mt-3">
              <InlineAlert>{moveError}</InlineAlert>
            </div>
          )}

          {phase === "error" && (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border border-line bg-surface p-8">
              <p className="text-body text-ink">일정을 불러오지 못했어요.</p>
              <button
                type="button"
                onClick={() => changeMonth(0)}
                className="h-11 rounded-md border border-line px-4 text-body font-semibold text-ink"
              >
                다시 시도
              </button>
            </div>
          )}

          {phase === "loading" && (
            <div aria-hidden className="mt-6 grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-md bg-surface-muted" />
              ))}
            </div>
          )}

          {phase === "ready" && (
            <>
              {/* 요일 머리 — 모바일·데스크톱 공용 */}
              <div className="mt-6 grid grid-cols-7 gap-1">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="pb-1 text-center text-caption text-sub">
                    {label}
                  </div>
                ))}
              </div>

              {/* ── Desktop / Tablet — 칸 안에 카드를 직접 (§8) ── */}
              <div className="hidden grid-cols-7 gap-1 md:grid">
                {cells.map((cell) => {
                  const list = byDate.get(cell.key) ?? [];
                  const overflow = list.length - MAX_PER_CELL;
                  const isToday = cell.key === today;
                  return (
                    <div
                      key={cell.key}
                      onDragOver={(e) => {
                        e.preventDefault(); // 이걸 막지 않으면 drop이 아예 안 걸린다
                        setDragOver(cell.key);
                      }}
                      onDragLeave={() => setDragOver((k) => (k === cell.key ? null : k))}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(null);
                        const id = dragging ?? e.dataTransfer.getData("text/plain");
                        if (id) void moveCard(id, cell.key);
                        setDragging(null);
                      }}
                      className={[
                        "flex min-h-[104px] flex-col gap-1 rounded-md border p-1.5",
                        cell.inMonth ? "bg-surface" : "bg-surface-muted/40",
                        dragOver === cell.key ? "border-berry bg-berry-light/40" : "border-line",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "px-0.5 text-caption",
                          isToday
                            ? "font-bold text-berry-dark"
                            : cell.inMonth
                              ? "text-sub"
                              : "text-sub/50",
                        ].join(" ")}
                      >
                        {cell.day}
                      </span>

                      {list.slice(0, MAX_PER_CELL).map((card) => (
                        <Link
                          key={card.id}
                          href={`/card/${card.id}`}
                          draggable
                          onDragStart={(e) => {
                            setDragging(card.id);
                            e.dataTransfer.setData("text/plain", card.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDragging(null);
                            setDragOver(null);
                          }}
                          title={card.title}
                          className={[
                            "flex items-center gap-1 rounded-sm bg-surface-muted px-1.5 py-1",
                            "text-caption text-ink hover:bg-berry-light",
                            dragging === card.id ? "opacity-40" : "",
                          ].join(" ")}
                        >
                          {/* 상태는 좌측 indicator로 (§8) — 색만으로 구분하지 않게 title도 함께 준다 */}
                          <span
                            aria-hidden
                            className="h-3.5 w-0.5 shrink-0 rounded-pill"
                            style={{ background: statusColor(card.status) }}
                          />
                          <span className="truncate">{card.shortTitle || card.title}</span>
                        </Link>
                      ))}

                      {overflow > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelected(cell.key)}
                          className="px-1.5 text-left text-caption text-sub hover:text-berry-dark"
                        >
                          +{overflow}건
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Mobile — 날짜 grid + 점, 고른 날짜는 아래 리스트 (§8) ── */}
              <div className="grid grid-cols-7 gap-1 md:hidden">
                {cells.map((cell) => {
                  const list = byDate.get(cell.key) ?? [];
                  const isToday = cell.key === today;
                  const isSelected = cell.key === selected;
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => setSelected(cell.key)}
                      aria-pressed={isSelected}
                      aria-label={`${formatDateLabel(cell.key)}${list.length ? ` 콘텐츠 ${list.length}건` : ""}`}
                      className={[
                        "flex h-12 flex-col items-center justify-center gap-1 rounded-md border-2",
                        isSelected ? "border-berry bg-berry-light" : "border-transparent",
                        cell.inMonth ? "" : "opacity-40",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "text-body",
                          isToday ? "font-bold text-berry-dark" : "text-ink",
                        ].join(" ")}
                      >
                        {cell.day}
                      </span>
                      <span className="flex h-1.5 items-center gap-0.5">
                        {list.slice(0, 3).map((c) => (
                          <span
                            key={c.id}
                            aria-hidden
                            className="h-1.5 w-1.5 rounded-pill"
                            style={{ background: statusColor(c.status) }}
                          />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 고른 날짜의 목록 — 모바일이 주 용도지만, 데스크톱에서 «+N건»을 눌러도 여기로 편다 */}
              <section className="mt-6 flex flex-col gap-2">
                <h2 className="text-body font-semibold text-ink">
                  {formatDateLabel(selected)}
                </h2>

                {selectedCards.length === 0 ? (
                  <p className="rounded-lg border border-line bg-surface p-6 text-center text-body text-sub">
                    이 날은 예정된 콘텐츠가 없어요.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {selectedCards.map((card) => (
                      <li key={card.id}>
                        <Link
                          href={`/card/${card.id}`}
                          className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 hover:bg-surface-muted"
                        >
                          {/* 리스트에서는 썸네일을 쓴다 (§8) */}
                          {card.photoUrls?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={card.photoUrls[0]}
                              alt=""
                              className="h-12 w-12 shrink-0 rounded-sm object-cover"
                            />
                          ) : (
                            <span
                              aria-hidden
                              className="h-12 w-12 shrink-0 rounded-sm bg-surface-muted"
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body text-ink">
                              {card.title}
                            </span>
                            <span className="block truncate text-caption text-sub">
                              {card.audience}
                            </span>
                          </span>
                          <StatusBadge status={card.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}

                {cards.length === 0 && (
                  <p className="mt-2 text-center text-caption text-sub">
                    이번 달에 예정된 콘텐츠가 없어요.{" "}
                    <Link href="/plan/new" className="text-berry-dark underline underline-offset-4">
                      기획을 시작해보세요
                    </Link>
                  </p>
                )}
              </section>
            </>
          )}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}

/** 상태색은 §15에 따라 «면·점»에만 쓴다. 글자색으로 쓰면 대비가 모자란다 */
function statusColor(status: CardStatus): string {
  return `var(--st-${status})`;
}
