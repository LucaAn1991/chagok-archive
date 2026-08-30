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
 * 캘린더 — 월간·주간 (DESIGN.md §8 · PLAN §4 · 08-31 시안 반영).
 *
 * «Gallery가 아니라 콘텐츠 운영 계획을 한눈에 파악하는 공간이다.»
 * - Desktop 칸: 썸네일 금지 · `▌` 상태색 + shortTitle · 월간 2건 + «+N건»
 * - 주간은 시간축이 아니다 — 카드에 시간이 없다(scheduledDate = 날짜뿐).
 *   같은 칸을 세로로 넓게 써서 하루 8건까지 보여주는 뷰다.
 * - Desktop(≥1200)은 선택 날짜의 카드 미리보기를 오른쪽 패널로,
 *   그보다 좁으면 격자 아래 리스트로 — 썸네일은 패널·리스트에서만 (§8 Mobile)
 * - Mobile 칸: 상태색 점만 — 데스크톱의 축소판을 만들지 않는다
 * - 드래그로 예정일 변경 — 실패 시 원위치 + 안내 (PLAN §3-1)
 *
 * 조회는 홈과 같은 클라이언트 SDK 쿼리 — 인덱스 (userId, scheduledDate).
 * 예정일 변경은 카드 상세와 같은 updateDoc — 규칙이 클라이언트 쓰기를 허용한다.
 */

type CalView = "month" | "week";

/** 로컬 기준 'YYYY-MM-DD' (홈과 동일) */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' → 로컬 Date. new Date(key)는 UTC 자정이라 하루 밀릴 수 있다 */
function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
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

/** anchor가 속한 주의 7일 — 일요일 시작 */
function weekDates(anchorKey: string): string[] {
  const d = parseDateKey(anchorKey);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    return toDateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  });
}

/** 뷰·anchor 기준 조회 범위 */
function rangeFor(view: CalView, anchorKey: string): { start: string; end: string } {
  if (view === "month") {
    const d = parseDateKey(anchorKey);
    return {
      start: toDateKey(new Date(d.getFullYear(), d.getMonth(), 1)),
      end: toDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
    };
  }
  const week = weekDates(anchorKey);
  return { start: week[0], end: week[6] };
}

/** 주간 헤더 문구 — 달·해가 걸치면 뒤쪽에만 붙인다 */
function weekTitle(startKey: string, endKey: string): string {
  const sy = startKey.slice(0, 4);
  const sm = Number(startKey.slice(5, 7));
  const sd = Number(startKey.slice(8, 10));
  const ey = endKey.slice(0, 4);
  const em = Number(endKey.slice(5, 7));
  const ed = Number(endKey.slice(8, 10));
  if (sy !== ey) return `${sy}년 ${sm}월 ${sd}일 – ${ey}년 ${em}월 ${ed}일`;
  if (sm !== em) return `${sy}년 ${sm}월 ${sd}일 – ${em}월 ${ed}일`;
  return `${sy}년 ${sm}월 ${sd}일 – ${ed}일`;
}

/** '2026-09-05' → '9월 5일 (토)' */
function formatDayLabel(key: string): string {
  return `${Number(key.slice(5, 7))}월 ${Number(key.slice(8, 10))}일 (${DAY_HEADS[parseDateKey(key).getDay()]})`;
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

  const [view, setView] = useState<CalView>("month");
  const [anchor, setAnchor] = useState<string>(todayKey);
  const [state, setState] = useState<ViewState>({ phase: "loading" });
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [reloadKey, setReloadKey] = useState(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 빈 날은 바로 옮기고, 이미 카드가 있는 날로 드롭할 때만 확인 팝업 (08-31 확정)
  const [pendingMove, setPendingMove] = useState<{ cardId: string; toDate: string } | null>(null);

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

        const { start, end } = rangeFor(view, anchor);
        const cardsRef = collection(db, "cards");

        const rangeSnap = await getDocs(
          query(
            cardsRef,
            where("userId", "==", uid),
            where("scheduledDate", ">=", start),
            where("scheduledDate", "<=", end),
            orderBy("scheduledDate", "asc"),
          ),
        );
        const cards = rangeSnap.docs
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
  }, [uid, router, view, anchor, todayKey, reloadKey]);

  /** 이전·다음 (월간은 한 달, 주간은 한 주) — 새 범위에 오늘이 있으면 오늘을 선택 */
  function move(delta: number) {
    const d = parseDateKey(anchor);
    const nextAnchor =
      view === "month"
        ? toDateKey(new Date(d.getFullYear(), d.getMonth() + delta, 1))
        : toDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta * 7));
    const r = rangeFor(view, nextAnchor);
    setAnchor(nextAnchor);
    setSelectedDate(todayKey >= r.start && todayKey <= r.end ? todayKey : r.start);
    setState({ phase: "loading" });
  }

  function goToday() {
    setSelectedDate(todayKey);
    if (anchor !== todayKey) {
      setAnchor(todayKey);
      setState({ phase: "loading" });
    }
  }

  /** 월간 ↔ 주간 — 보고 있던 날짜(selectedDate)를 기준으로 전환한다 */
  function switchView(next: CalView) {
    if (next === view) return;
    setView(next);
    setAnchor(selectedDate);
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
      setNotice("일정이 변경됐어요."); // Toast 문구 — DESIGN §13
      setTimeout(() => setNotice(null), 3000);
    } catch {
      setState({ phase: "ready", cards: prev, overdueCount: state.overdueCount });
      setNotice("일정을 옮기지 못했어요. 잠시 후 다시 시도해주세요.");
      setTimeout(() => setNotice(null), 3000);
    }
  }

  const anchorDate = parseDateKey(anchor);
  const cells =
    view === "month" ? monthGrid(anchorDate.getFullYear(), anchorDate.getMonth()) : weekDates(anchor);
  const range = rangeFor(view, anchor);
  const title =
    view === "month"
      ? `${anchorDate.getFullYear()}년 ${anchorDate.getMonth() + 1}월`
      : weekTitle(range.start, range.end);

  const byDate = new Map<string, Card[]>();
  if (state.phase === "ready") {
    for (const card of state.cards) {
      const list = byDate.get(card.scheduledDate) ?? [];
      list.push(card);
      byDate.set(card.scheduledDate, list);
    }
  }
  const selectedCards = byDate.get(selectedDate) ?? [];
  const pendingCard =
    pendingMove && state.phase === "ready"
      ? (state.cards.find((c) => c.id === pendingMove.cardId) ?? null)
      : null;
  const pendingTargetCards = pendingMove ? (byDate.get(pendingMove.toDate) ?? []) : [];

  return (
    <div className="flex flex-1">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 캘린더 최대 폭 1200 (DESIGN.md §4) */}
        <main className="mx-auto w-full max-w-[1200px] flex-1 p-4 pb-24 md:p-6 md:pb-8 min-[1200px]:p-8">
          {/* 헤더 — 이동 · 오늘 · 월간/주간 · 놓친 카드 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => move(-1)}
                aria-label={view === "month" ? "이전 달" : "이전 주"}
                className="flex size-11 items-center justify-center rounded-md text-sub hover:bg-surface-muted"
              >
                <ChevronLeft size={20} aria-hidden />
              </button>
              {/* 주간 제목이 길다 — 모바일에서는 한 단계 작게 */}
              <h1 className="text-center text-body font-bold text-ink md:min-w-[120px] md:text-title">
                {title}
              </h1>
              <button
                type="button"
                onClick={() => move(1)}
                aria-label={view === "month" ? "다음 달" : "다음 주"}
                className="flex size-11 items-center justify-center rounded-md text-sub hover:bg-surface-muted"
              >
                <ChevronRight size={20} aria-hidden />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="ml-1 h-9 whitespace-nowrap rounded-md border border-line bg-surface px-3 text-body text-ink hover:bg-surface-muted"
              >
                오늘
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* 월간/주간 토글 */}
              <div className="flex h-9 items-center rounded-md border border-line bg-surface p-0.5">
                {(["month", "week"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => switchView(v)}
                    className={[
                      "h-8 rounded-[4px] px-3 text-body",
                      view === v
                        ? "bg-berry-light font-semibold text-berry-dark"
                        : "text-sub hover:text-ink",
                    ].join(" ")}
                  >
                    {v === "month" ? "월간" : "주간"}
                  </button>
                ))}
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
          </div>

          {state.phase === "loading" && (
            <div className={view === "month" ? "mt-6 grid grid-cols-7 gap-px" : "mt-6 grid grid-cols-7 gap-1"}>
              {Array.from({ length: view === "month" ? 35 : 7 }).map((_, i) => (
                <div
                  key={i}
                  className={[
                    "animate-pulse rounded-sm bg-surface-muted",
                    view === "month" ? "h-20 md:h-24" : "h-20 md:h-64",
                  ].join(" ")}
                />
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
            <div className="mt-4 flex gap-6">
              {/* 격자 영역 */}
              <div className="min-w-0 flex-1">
                {/* 요일 헤더 */}
                <div className="grid grid-cols-7">
                  {DAY_HEADS.map((d) => (
                    <div key={d} className="py-2 text-center text-caption text-sub">
                      {d}
                    </div>
                  ))}
                </div>

                {/* 격자 — 월간은 5~6줄, 주간은 한 줄을 세로로 넓게 */}
                <div className="grid grid-cols-7 gap-1">
                  {cells.map((dateKey, i) =>
                    dateKey === null ? (
                      <div key={`empty-${i}`} />
                    ) : (
                      <DayCell
                        key={dateKey}
                        dateKey={dateKey}
                        cards={byDate.get(dateKey) ?? []}
                        tall={view === "week"}
                        isToday={dateKey === todayKey}
                        isSelected={dateKey === selectedDate}
                        dragging={draggingId != null}
                        onSelect={() => setSelectedDate(dateKey)}
                        onDragStartCard={setDraggingId}
                        onDropCard={(cardId) => {
                          setDraggingId(null);
                          const moving = state.cards.find((c) => c.id === cardId);
                          if (!moving || moving.scheduledDate === dateKey) return;
                          if ((byDate.get(dateKey) ?? []).length > 0) {
                            setPendingMove({ cardId, toDate: dateKey });
                          } else {
                            void moveCard(cardId, dateKey);
                          }
                        }}
                        onOpenCard={(id) => router.push(`/card/${id}`)}
                      />
                    ),
                  )}
                </div>

                {/* 이 범위에 아무것도 없을 때 (empty state) */}
                {state.cards.length === 0 && (
                  <div className="mt-10 flex flex-col items-center gap-3">
                    <p className="text-body text-sub">
                      {view === "month"
                        ? "이 달에는 아직 예정된 콘텐츠가 없어요."
                        : "이 주에는 아직 예정된 콘텐츠가 없어요."}
                    </p>
                    <Link
                      href="/plan/new"
                      className="flex h-11 items-center rounded-md bg-berry px-5 text-body font-semibold text-white hover:bg-berry-dark"
                    >
                      AI 기획으로 채우기
                    </Link>
                  </div>
                )}

                {/* 선택 날짜 리스트 — 패널이 없는 폭에서만 (썸네일 허용, DESIGN §8 Mobile) */}
                {state.cards.length > 0 && (
                  <section className="mt-6 desktop:hidden">
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
              </div>

              {/* 오른쪽 미리보기 패널 — Desktop(≥1200)만 (08-31 시안 01·06) */}
              <aside className="sticky top-6 hidden w-[300px] shrink-0 self-start desktop:block">
                <DayPanel dateKey={selectedDate} cards={selectedCards} todayKey={todayKey} />
              </aside>
            </div>
          )}

          {/* 충돌 확인 팝업 — 이미 카드가 있는 날로 드롭했을 때만 (카드 상세 모달 패턴) */}
          {pendingMove && pendingCard && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="move-title"
              onClick={() => setPendingMove(null)}
              className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex w-full max-w-[400px] flex-col gap-4 rounded-xl bg-surface p-6 shadow-lg"
              >
                <h2 id="move-title" className="text-title font-bold text-ink">
                  이 날에는 이미 카드가 있어요
                </h2>
                <p className="text-body text-sub">
                  <span className="font-semibold text-ink">
                    {formatDayLabel(pendingMove.toDate)}
                  </span>
                  에는 이미 「{pendingTargetCards[0]?.title}」
                  {pendingTargetCards.length > 1 && ` 외 ${pendingTargetCards.length - 1}장`}이
                  있어요. 「{pendingCard.title}」 카드를 같은 날에 함께 둘까요?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingMove(null)}
                    className="h-11 flex-1 rounded-md border border-line bg-surface text-body font-semibold text-ink hover:bg-surface-muted"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const m = pendingMove;
                      setPendingMove(null);
                      void moveCard(m.cardId, m.toDate);
                    }}
                    className="h-11 flex-1 rounded-md bg-berry text-body font-semibold text-white hover:bg-berry-dark"
                  >
                    함께 두기
                  </button>
                </div>
              </div>
            </div>
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
 * 날짜 칸 — Desktop: shortTitle 컴팩트(월간 2건 · 주간 8건) + «+N건» / Mobile: 상태색 점.
 * 칸 자체가 드롭 대상이다 (드래그로 예정일 변경).
 */
function DayCell({
  dateKey,
  cards,
  tall,
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
  tall: boolean;
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
  const maxDesktop = tall ? 8 : 2;

  return (
    <div
      data-date={dateKey}
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
        "cursor-pointer rounded-sm border p-1 md:p-1.5",
        tall ? "min-h-14 md:min-h-64" : "min-h-14 md:min-h-24",
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

      {/* Desktop — Compact 카드: ▌상태색 + shortTitle (DESIGN §8) */}
      <span className="mt-1 hidden flex-col gap-1 md:flex">
        {cards.slice(0, maxDesktop).map((card) => (
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
        {cards.length > maxDesktop && (
          <span className="px-1 text-caption text-sub">+{cards.length - maxDesktop}건</span>
        )}
      </span>
    </div>
  );
}

/**
 * 선택 날짜 미리보기 패널 (Desktop ≥1200) — 썸네일·캡션은 여기서만 보여준다.
 * 칸(Compact)이 «무엇이 언제»라면 패널은 «어떤 내용인지»다.
 */
function DayPanel({
  dateKey,
  cards,
  todayKey,
}: {
  dateKey: string;
  cards: Card[];
  todayKey: string;
}) {
  const dow = DAY_HEADS[parseDateKey(dateKey).getDay()];

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-body font-semibold text-ink">
        {Number(dateKey.slice(5, 7))}월 {Number(dateKey.slice(8, 10))}일 ({dow})
        {dateKey === todayKey && (
          <span className="ml-2 rounded-pill bg-berry-light px-2 py-0.5 text-caption font-semibold text-berry-dark">
            오늘
          </span>
        )}
      </h2>

      {cards.length === 0 ? (
        <div className="mt-3">
          <p className="text-body text-sub">이 날에는 예정된 콘텐츠가 없어요.</p>
          <Link
            href="/plan/new"
            className="mt-2 inline-block text-body font-semibold text-berry-dark underline"
          >
            AI 기획으로 채우기
          </Link>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {cards.map((card) => (
            <li key={card.id}>
              <article className="overflow-hidden rounded-lg border border-line">
                {card.photoUrls?.[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.photoUrls[0]}
                    alt=""
                    className="aspect-video w-full object-cover"
                  />
                )}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 text-body font-semibold text-ink">{card.title}</h3>
                    <StatusBadge status={card.status} />
                  </div>
                  <p className="mt-0.5 text-caption text-sub">
                    {card.audience}
                    {card.scheduledDate < todayKey && card.status !== "published" && (
                      <span className="ml-1.5">· 예정일 지남</span>
                    )}
                  </p>

                  {/* 캡션 미리보기 — 없으면 다음 단계를 알려준다 */}
                  {card.caption ? (
                    <p className="mt-2 line-clamp-3 text-caption text-sub">
                      {card.caption.hook} {card.caption.body}
                    </p>
                  ) : (
                    <p className="mt-2 text-caption text-sub">
                      캡션은 아직 없어요 — 카드에서 제작하면 여기에 보여요.
                    </p>
                  )}

                  <Link
                    href={`/card/${card.id}`}
                    className="mt-3 flex h-9 items-center justify-center rounded-md bg-berry text-body font-semibold text-white hover:bg-berry-dark"
                  >
                    상세 보기
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
