"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import StatusBadge from "@/components/StatusBadge";
import type { Card, CardStatus } from "@/types";

/**
 * 캘린더 — 월간 (DESIGN.md §8 · PLAN §4).
 *
 * «Gallery가 아니라 콘텐츠 운영 계획을 한눈에 파악하는 공간이다.»
 * - Desktop 칸: 썸네일 금지 · `▌` 상태색 + shortTitle · 칸당 2건 + 초과 «+N건»
 * - Mobile 칸: 상태색 점만 — 데스크톱의 축소판을 만들지 않는다
 * - 날짜를 고르면 아래 리스트 (리스트에서는 썸네일 허용 — §8 Mobile)
 * - 드래그로 예정일 변경 — 실패 시 원위치 + 안내 (PLAN §3-1)
 *
 * 조회는 홈과 같은 클라이언트 SDK 쿼리 — 인덱스 (userId, scheduledDate).
 * 예정일 변경은 카드 상세와 같은 updateDoc — 규칙이 클라이언트 쓰기를 허용한다.
 */

/** 로컬 기준 'YYYY-MM-DD' (홈과 동일) */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DAY_HEADS = ["일", "월", "화", "수", "목", "금", "토"];

const STATUS_COLOR: Record<CardStatus, string> = {
  planned: "var(--st-planned)",
  crafted: "var(--st-crafted)",
  pending: "var(--st-pending)",
  published: "var(--st-published)",
  discarded: "var(--st-discarded)",
};

/** 해당 월의 캘린더 격자 — 앞뒤 빈칸(null) 포함, 일요일 시작 */
function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(first.getDay()).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(toDateKey(new Date(year, month, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function CalendarPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setUid(user.uid);
    });
    return unsubscribe;
  }, [router]);

  if (!uid) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-body text-sub">불러오는 중…</p>
      </main>
    );
  }
  return <CalendarView uid={uid} />;
}

type ViewState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; cards: Card[]; overdueCount: number };

function CalendarView({ uid }: { uid: string }) {
  const router = useRouter();
  const today = new Date();
  const todayKey = toDateKey(today);

  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [state, setState] = useState<ViewState>({ phase: "loading" });
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [reloadKey, setReloadKey] = useState(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // 온보딩 가드 (PLAN §3) — 홈과 동일
        const userSnap = await getDoc(doc(db, "users", uid));
        if (!userSnap.exists()) {
          await signOut(auth);
          return;
        }
        if (userSnap.data().onboardedAt == null) {
          router.replace("/onboarding");
          return;
        }

        const start = toDateKey(new Date(cursor.year, cursor.month, 1));
        const end = toDateKey(new Date(cursor.year, cursor.month + 1, 0));
        const cardsRef = collection(db, "cards");

        const monthSnap = await getDocs(
          query(
            cardsRef,
            where("userId", "==", uid),
            where("scheduledDate", ">=", start),
            where("scheduledDate", "<=", end),
            orderBy("scheduledDate", "asc"),
          ),
        );
        const cards = monthSnap.docs
          .map((d) => ({ ...(d.data() as Omit<Card, "id">), id: d.id }))
          .filter((c) => c.status !== "discarded");

        // 놓친 카드 수 — scheduledDate < 오늘 && 미발행 (PLAN §3 overdue 정의)
        const overdueSnap = await getDocs(
          query(cardsRef, where("userId", "==", uid), where("scheduledDate", "<", todayKey)),
        );
        const overdueCount = overdueSnap.docs.filter((d) => {
          const s = d.data().status as CardStatus;
          return s !== "published" && s !== "discarded";
        }).length;

        if (cancelled) return;
        setState({ phase: "ready", cards, overdueCount });
      } catch {
        if (!cancelled) setState({ phase: "error" });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [uid, router, cursor, todayKey, reloadKey]);

  function moveMonth(delta: number) {
    const next = new Date(cursor.year, cursor.month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
    setState({ phase: "loading" });
  }

  /** 드래그로 예정일 변경 — 실패 시 원위치 + 안내 (PLAN §3-1) */
  async function moveCard(cardId: string, dateKey: string) {
    if (state.phase !== "ready") return;
    const card = state.cards.find((c) => c.id === cardId);
    if (!card || card.scheduledDate === dateKey) return;

    const prev = state.cards;
    // 낙관적 반영 — 실패하면 되돌린다
    setState({
      ...state,
      cards: prev.map((c) => (c.id === cardId ? { ...c, scheduledDate: dateKey } : c)),
    });
    try {
      await updateDoc(doc(db, "cards", cardId), { scheduledDate: dateKey });
    } catch {
      setState({ phase: "ready", cards: prev, overdueCount: state.overdueCount });
      setNotice("일정을 옮기지 못했어요. 잠시 후 다시 시도해주세요.");
      setTimeout(() => setNotice(null), 3000);
    }
  }

  const cells = monthGrid(cursor.year, cursor.month);
  const byDate = new Map<string, Card[]>();
  if (state.phase === "ready") {
    for (const card of state.cards) {
      const list = byDate.get(card.scheduledDate) ?? [];
      list.push(card);
      byDate.set(card.scheduledDate, list);
    }
  }
  const selectedCards = byDate.get(selectedDate) ?? [];

  return (
    <div className="flex flex-1">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 캘린더 최대 폭 1200 (DESIGN.md §4) */}
        <main className="mx-auto w-full max-w-[1200px] flex-1 p-4 pb-24 md:p-6 md:pb-8 min-[1200px]:p-8">
          {/* 헤더 — 월 이동 + 놓친 카드 진입 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveMonth(-1)}
                aria-label="이전 달"
                className="flex size-11 items-center justify-center rounded-md text-sub hover:bg-surface-muted"
              >
                <ChevronLeft size={20} aria-hidden />
              </button>
              <h1 className="min-w-[120px] text-center text-title font-bold text-ink">
                {cursor.year}년 {cursor.month + 1}월
              </h1>
              <button
                type="button"
                onClick={() => moveMonth(1)}
                aria-label="다음 달"
                className="flex size-11 items-center justify-center rounded-md text-sub hover:bg-surface-muted"
              >
                <ChevronRight size={20} aria-hidden />
              </button>
            </div>

            {state.phase === "ready" && state.overdueCount > 0 && (
              <Link
                href="/calendar/missed"
                className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-body text-ink hover:bg-surface-muted"
              >
                놓친 카드
                <span className="rounded-pill bg-berry-light px-1.5 text-caption font-semibold text-berry-dark">
                  {state.overdueCount}
                </span>
              </Link>
            )}
          </div>

          {state.phase === "loading" && (
            <div className="mt-6 grid grid-cols-7 gap-px">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-sm bg-surface-muted md:h-24" />
              ))}
            </div>
          )}

          {state.phase === "error" && (
            <div className="mt-16 flex flex-col items-center gap-3">
              <p className="text-body text-sub">캘린더를 불러오지 못했어요.</p>
              <button
                type="button"
                onClick={() => {
                  setState({ phase: "loading" });
                  setReloadKey((k) => k + 1);
                }}
                className="h-11 rounded-md border border-line bg-surface px-5 text-body font-semibold text-ink hover:bg-surface-muted"
              >
                다시 시도
              </button>
            </div>
          )}

          {state.phase === "ready" && (
            <>
              {/* 요일 헤더 */}
              <div className="mt-4 grid grid-cols-7">
                {DAY_HEADS.map((d) => (
                  <div key={d} className="py-2 text-center text-caption text-sub">
                    {d}
                  </div>
                ))}
              </div>

              {/* 월간 격자 */}
              <div className="grid grid-cols-7 gap-1">
                {cells.map((dateKey, i) =>
                  dateKey === null ? (
                    <div key={`empty-${i}`} />
                  ) : (
                    <DayCell
                      key={dateKey}
                      dateKey={dateKey}
                      cards={byDate.get(dateKey) ?? []}
                      isToday={dateKey === todayKey}
                      isSelected={dateKey === selectedDate}
                      dragging={draggingId != null}
                      onSelect={() => setSelectedDate(dateKey)}
                      onDragStartCard={setDraggingId}
                      onDropCard={(cardId) => {
                        setDraggingId(null);
                        void moveCard(cardId, dateKey);
                      }}
                      onOpenCard={(id) => router.push(`/card/${id}`)}
                    />
                  ),
                )}
              </div>

              {/* 이 달에 아무것도 없을 때 (empty state) */}
              {state.cards.length === 0 && (
                <div className="mt-10 flex flex-col items-center gap-3">
                  <p className="text-body text-sub">이 달에는 아직 예정된 콘텐츠가 없어요.</p>
                  <Link
                    href="/plan/new"
                    className="flex h-11 items-center rounded-md bg-berry px-5 text-body font-semibold text-white hover:bg-berry-dark"
                  >
                    AI 기획으로 채우기
                  </Link>
                </div>
              )}

              {/* 선택한 날짜의 리스트 — 여기서는 썸네일 허용 (DESIGN §8 Mobile) */}
              {state.cards.length > 0 && (
                <section className="mt-6">
                  <h2 className="text-body font-semibold text-ink">
                    {Number(selectedDate.slice(5, 7))}월 {Number(selectedDate.slice(8, 10))}일
                    {selectedDate === todayKey && (
                      <span className="ml-2 rounded-pill bg-berry-light px-2 py-0.5 text-caption font-semibold text-berry-dark">
                        오늘
                      </span>
                    )}
                  </h2>
                  {selectedCards.length === 0 ? (
                    <p className="mt-3 text-body text-sub">이 날에는 예정된 콘텐츠가 없어요.</p>
                  ) : (
                    <ul className="mt-3 flex flex-col gap-2">
                      {selectedCards.map((card) => (
                        <li key={card.id}>
                          <Link
                            href={`/card/${card.id}`}
                            className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 hover:bg-surface-muted"
                          >
                            {/* 리스트 썸네일 — 사진 없으면 중립 면 */}
                            {card.photoUrls?.[0] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={card.photoUrls[0]}
                                alt=""
                                className="size-12 shrink-0 rounded-sm object-cover"
                              />
                            ) : (
                              <span className="size-12 shrink-0 rounded-sm bg-surface-muted" />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-body font-semibold text-ink">
                                {card.title}
                              </span>
                              <span className="mt-0.5 block truncate text-caption text-sub">
                                {card.audience}
                                {card.scheduledDate < todayKey && card.status !== "published" && (
                                  <span className="ml-1.5">· 예정일 지남</span>
                                )}
                              </span>
                            </span>
                            <StatusBadge status={card.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </>
          )}

          {/* 이동 실패 안내 — 빨간색 금지 (DESIGN §2) */}
          {notice && (
            <div
              role="alert"
              className="fixed bottom-20 left-1/2 -translate-x-1/2 rounded-md border border-line bg-surface px-4 py-2.5 text-body text-ink shadow-sm md:bottom-8"
            >
              {notice}
            </div>
          )}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}

/**
 * 날짜 칸 — Desktop: shortTitle 컴팩트 2건 + «+N건» / Mobile: 상태색 점.
 * 칸 자체가 드롭 대상이다 (드래그로 예정일 변경).
 */
function DayCell({
  dateKey,
  cards,
  isToday,
  isSelected,
  dragging,
  onSelect,
  onDragStartCard,
  onDropCard,
  onOpenCard,
}: {
  dateKey: string;
  cards: Card[];
  isToday: boolean;
  isSelected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onDragStartCard: (id: string | null) => void;
  onDropCard: (cardId: string) => void;
  onOpenCard: (id: string) => void;
}) {
  const dayNum = Number(dateKey.slice(8, 10));
  const [over, setOver] = useState(false);

  return (
    <div
      onClick={onSelect}
      onDragOver={(e) => {
        e.preventDefault(); // 드롭 허용
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const cardId = e.dataTransfer.getData("text/card-id");
        if (cardId) onDropCard(cardId);
      }}
      className={[
        "min-h-14 cursor-pointer rounded-sm border p-1 md:min-h-24 md:p-1.5",
        isSelected ? "border-berry" : "border-line",
        over && dragging ? "bg-berry-tint" : "bg-surface",
      ].join(" ")}
    >
      <span
        className={[
          "flex size-6 items-center justify-center rounded-pill text-caption",
          isToday ? "bg-berry font-bold text-white" : "text-sub",
        ].join(" ")}
      >
        {dayNum}
      </span>

      {/* Mobile — 상태색 점 (최대 3개) */}
      <span className="mt-1 flex gap-0.5 md:hidden">
        {cards.slice(0, 3).map((card) => (
          <span
            key={card.id}
            aria-hidden
            className="size-1.5 rounded-pill"
            style={{ background: STATUS_COLOR[card.status] }}
          />
        ))}
      </span>

      {/* Desktop — Compact 카드: ▌상태색 + shortTitle, 최대 2건 (DESIGN §8) */}
      <span className="mt-1 hidden flex-col gap-1 md:flex">
        {cards.slice(0, 2).map((card) => (
          <button
            key={card.id}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/card-id", card.id);
              onDragStartCard(card.id);
            }}
            onDragEnd={() => onDragStartCard(null)}
            onClick={(e) => {
              e.stopPropagation();
              onOpenCard(card.id);
            }}
            className="flex w-full items-center gap-1 overflow-hidden rounded-sm bg-surface-muted px-1 py-0.5 text-left hover:bg-berry-tint"
            title={card.title}
          >
            <span
              aria-hidden
              className="h-3 w-[3px] shrink-0 rounded-pill"
              style={{ background: STATUS_COLOR[card.status] }}
            />
            <span className="truncate text-caption text-ink">
              {card.shortTitle || card.title}
            </span>
          </button>
        ))}
        {cards.length > 2 && (
          <span className="px-1 text-caption text-sub">+{cards.length - 2}건</span>
        )}
      </span>
    </div>
  );
}
