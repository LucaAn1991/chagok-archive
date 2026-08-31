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
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import AppSidebar from "@/components/AppSidebar";
import CardTile from "@/components/CardTile";
import MobileBottomNav from "@/components/MobileBottomNav";
import StatusBadge from "@/components/StatusBadge";
import type { Card, CardStatus } from "@/types";

/**
 * 캘린더 — 월간·주간 (DESIGN.md §8 · PLAN §4 · 08-31 시안 반영).
 *
 * «Gallery가 아니라 콘텐츠 운영 계획을 한눈에 파악하는 공간이다.»
 * - 월간 = 흐름 파악: 칸 썸네일 금지, 미니 카드는 상태 dot(범례 색) + 제목 2줄,
 *   칸당 2건 + «+N건» (08-31 v2 — 제목 2줄 허용은 DESIGN §8 shortTitle 규칙의 개정 대기)
 * - 주간 = 실행 관리: 시간축이 아니라(카드에 시간이 없다) 콘텐츠 카드가 주인공인
 *   weekly board. 빈 세로 박스를 그리지 않고, 빈 날은 «예정 없음»만 약하게
 * - 카드 클릭 = 선택. CTA는 오른쪽 패널에서만 강하게 — 화면 곳곳에 버튼을 반복하지 않는다
 * - Desktop(≥1200)은 오른쪽 패널, 그보다 좁으면 아래 리스트 (썸네일은 §8 Mobile 규칙)
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
  pending: "var(--st-pending)",
  published: "var(--st-published)",
  discarded: "var(--st-discarded)",
};

/** 범례 — 색만으로는 상태를 해석할 수 없다는 지적 보완 (08-31). discarded는 캘린더에 없다 */
const LEGEND: { status: CardStatus; label: string }[] = [
  { status: "planned", label: "제작 대기" },
  { status: "pending", label: "업로드 대기" },
  { status: "published", label: "발행 완료" },
];

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

/**
 * 업로드 요일인가 — uploadDays는 월=0…일=6 (users/me), getDay()는 일=0이라 변환한다.
 * 설정이 없으면(빈 배열 포함) null — 아무 표시도 하지 않는다.
 */
function isUploadDayOf(uploadDays: number[] | null, dateKey: string): boolean | null {
  if (!uploadDays || uploadDays.length === 0) return null;
  return uploadDays.includes((parseDateKey(dateKey).getDay() + 6) % 7);
}

/**
 * 과도기 방어 (08-31 상태 개편) — 옛 코드가 쓴 'crafted'는 pending으로 읽는다.
 * 팀원 브랜치가 개편 커밋을 pull하면 더는 생기지 않는다. @TODO: 정착 후 제거
 */
function normalizeCard(data: Omit<Card, "id">, id: string): Card {
  const status = (data.status as string) === "crafted" ? "pending" : data.status;
  return { ...data, status, id };
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
  // 올렸어요 — 실제 올린 날짜를 물어보는 다이얼로그 (놓친 카드와 같은 규칙)
  const [publishTarget, setPublishTarget] = useState<Card | null>(null);
  const [publishDate, setPublishDate] = useState("");
  // 온보딩에서 고른 업로드 요일 (월=0…일=6)·주기 — 쉬는 날/채울 날 구분과 주간 헤더에 쓴다 (08-31)
  const [uploadDays, setUploadDays] = useState<number[] | null>(null);
  const [uploadFrequency, setUploadFrequency] = useState<number | null>(null);

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
        setUploadDays((userSnap.data().uploadDays as number[] | undefined) ?? null);
        setUploadFrequency((userSnap.data().uploadFrequency as number | undefined) ?? null);

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
          .map((d) => normalizeCard(d.data() as Omit<Card, "id">, d.id))
          .filter((c) => c.status !== "discarded");

        // 놓친 카드 수 — scheduledDate < 오늘 && 미발행 (PLAN §3 overdue 정의).
        // 날짜가 빈 카드(기획 도중의 미완성 데이터)는 «놓친» 게 아니다 — 제외
        const overdueSnap = await getDocs(
          query(cardsRef, where("userId", "==", uid), where("scheduledDate", "<", todayKey)),
        );
        const overdueCount = overdueSnap.docs.filter((d) => {
          const data = d.data();
          const s = data.status as CardStatus;
          return data.scheduledDate !== "" && s !== "published" && s !== "discarded";
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

  /** 올렸어요 확정 — 놓친 카드와 동일한 쓰기 (published는 publishedAt 필수) */
  async function confirmPublish() {
    if (!publishTarget || !publishDate || state.phase !== "ready") return;
    const target = publishTarget;
    setPublishTarget(null);
    try {
      const [y, m, d] = publishDate.split("-").map(Number);
      await updateDoc(doc(db, "cards", target.id), {
        status: "published",
        publishIntent: "yes",
        // 정오로 만든다 — 자정은 UTC 표기에서 하루 밀릴 수 있다
        publishedAt: Timestamp.fromDate(new Date(y, m - 1, d, 12)),
        scheduledDate: publishDate, // 실제 올린 날로 이동
      });
      setState((prev) =>
        prev.phase === "ready"
          ? {
              ...prev,
              cards: prev.cards.map((c) =>
                c.id === target.id
                  ? { ...c, status: "published", publishIntent: "yes", scheduledDate: publishDate }
                  : c,
              ),
            }
          : prev,
      );
      setNotice("발행 완료로 기록했어요.");
      setTimeout(() => setNotice(null), 3000);
    } catch {
      setNotice("저장하지 못했어요. 잠시 후 다시 시도해주세요.");
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

  /** 드롭 공통 처리 — 빈 날은 즉시, 카드가 있는 날은 확인 팝업 */
  function handleDrop(cardId: string, dateKey: string) {
    setDraggingId(null);
    if (state.phase !== "ready") return;
    const moving = state.cards.find((c) => c.id === cardId);
    if (!moving || moving.scheduledDate === dateKey) return;
    if ((byDate.get(dateKey) ?? []).length > 0) {
      setPendingMove({ cardId, toDate: dateKey });
    } else {
      void moveCard(cardId, dateKey);
    }
  }

  /** 올렸어요 다이얼로그 열기 — 기본값은 오늘 */
  function openPublish(card: Card) {
    setPublishTarget(card);
    setPublishDate(todayKey);
  }

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
                {view === "month" ? (
                  <>
                    {/* 월간 = 흐름 파악 — compact 유지 + 상태 범례 (08-31) */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-1">
                      {LEGEND.map(({ status, label }) => (
                        <span
                          key={status}
                          className="flex items-center gap-1.5 text-caption text-sub"
                        >
                          {status === "published" ? (
                            <span aria-hidden className="font-semibold">
                              ✓
                            </span>
                          ) : (
                            <span
                              aria-hidden
                              className="h-2 w-2 rounded-pill"
                              style={{ background: STATUS_COLOR[status] }}
                            />
                          )}
                          {label}
                        </span>
                      ))}
                    </div>

                    {/* 요일 헤더 */}
                    <div className="grid grid-cols-7">
                      {DAY_HEADS.map((d) => (
                        <div key={d} className="py-2 text-center text-caption text-sub">
                          {d}
                        </div>
                      ))}
                    </div>

                    {/* [실험] 아코디언 월간 — 선택한 날이 속한 주만 주간 보드로 확장 (08-31) */}
                    <div className="flex flex-col gap-1">
                      {Array.from({ length: cells.length / 7 }, (_, wi) =>
                        cells.slice(wi * 7, wi * 7 + 7),
                      ).map((week, wi) => {
                        const expanded = week.some(
                          (d) => d !== null && weekDates(selectedDate).includes(d),
                        );
                        if (!expanded) {
                          return (
                            <div key={`w-${wi}`} className="grid grid-cols-7 gap-1">
                              {week.map((dateKey, i) =>
                                dateKey === null ? (
                                  <div key={`empty-${wi}-${i}`} />
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
                                    onDropCard={(cardId) => handleDrop(cardId, dateKey)}
                                    showPlus={
                                      (byDate.get(dateKey) ?? []).length === 0 &&
                                      dateKey >= todayKey &&
                                      isUploadDayOf(uploadDays, dateKey) === true
                                    }
                                  />
                                ),
                              )}
                            </div>
                          );
                        }
                        return (
                          <div
                            key={`w-${wi}`}
                            className="grid grid-cols-7 gap-2 rounded-lg bg-berry-tint/30 p-1.5"
                          >
                            {week.map((dateKey, i) =>
                              dateKey === null ? (
                                <div key={`empty-${wi}-${i}`} />
                              ) : (
                                <WeekColumn
                                  key={dateKey}
                                  dateKey={dateKey}
                                  cards={byDate.get(dateKey) ?? []}
                                  isToday={dateKey === todayKey}
                                  isSelected={dateKey === selectedDate}
                                  dragging={draggingId != null}
                                  onSelect={() => setSelectedDate(dateKey)}
                                  onDragStartCard={setDraggingId}
                                  onDropCard={(cardId) => handleDrop(cardId, dateKey)}
                                  emptyHint={
                                    (byDate.get(dateKey) ?? []).length > 0
                                      ? "none"
                                      : isUploadDayOf(uploadDays, dateKey) === false
                                        ? "rest"
                                        : isUploadDayOf(uploadDays, dateKey) === true &&
                                            dateKey >= todayKey
                                          ? "invite"
                                          : "none"
                                  }
                                />
                              ),
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    {/* 주간 헤더 — 왼쪽은 계획(목표·기획 수), 오른쪽은 진행 상태 (08-31 v4).
                        상태는 큰 badge로 만들지 않는다 — dot + text 그대로, 우측 정렬만 */}
                    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                      <div>
                        <h2 className="text-body-l font-semibold text-ink">
                          {todayKey >= range.start && todayKey <= range.end
                            ? "이번 주 콘텐츠"
                            : "이 주의 콘텐츠"}
                        </h2>
                        <p className="mt-0.5 text-caption text-sub">
                          {uploadFrequency ? `목표 주 ${uploadFrequency}회 · ` : ""}
                          {state.cards.length}개 기획
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                        {(
                          [
                            ["planned", "제작 대기"],
                            ["pending", "업로드 대기"],
                            ["published", "발행"],
                          ] as const
                        ).map(([status, label]) => (
                          <span
                            key={status}
                            className="flex items-center gap-1.5 text-caption text-sub"
                          >
                            {status === "published" ? (
                              <span aria-hidden className="font-semibold">
                                ✓
                              </span>
                            ) : (
                              <span
                                aria-hidden
                                className="h-2 w-2 rounded-pill"
                                style={{ background: STATUS_COLOR[status] }}
                              />
                            )}
                            {label}{" "}
                            <span className="font-medium">
                              {state.cards.filter((c) => c.status === status).length}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Desktop/Tablet — 플래너 컬럼 */}
                    <div className="mt-3 hidden grid-cols-7 gap-2 md:grid">
                      {(cells as string[]).map((dateKey) => (
                        <WeekColumn
                          key={dateKey}
                          dateKey={dateKey}
                          cards={byDate.get(dateKey) ?? []}
                          isToday={dateKey === todayKey}
                          isSelected={dateKey === selectedDate}
                          dragging={draggingId != null}
                          onSelect={() => setSelectedDate(dateKey)}
                          onDragStartCard={setDraggingId}
                          onDropCard={(cardId) => handleDrop(cardId, dateKey)}
                          emptyHint={
                            (byDate.get(dateKey) ?? []).length > 0
                              ? "none"
                              : isUploadDayOf(uploadDays, dateKey) === false
                                ? "rest"
                                : isUploadDayOf(uploadDays, dateKey) === true &&
                                    dateKey >= todayKey
                                  ? "invite"
                                  : "none"
                          }
                        />
                      ))}
                    </div>

                    {/* Mobile — 날짜 줄 + 아래 리스트 (컬럼이 좁아 플래너를 못 쓴다) */}
                    <div className="mt-3 md:hidden">
                      <div className="grid grid-cols-7">
                        {DAY_HEADS.map((d) => (
                          <div key={d} className="py-2 text-center text-caption text-sub">
                            {d}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {(cells as string[]).map((dateKey) => (
                          <DayCell
                            key={dateKey}
                            dateKey={dateKey}
                            cards={byDate.get(dateKey) ?? []}
                            isToday={dateKey === todayKey}
                            isSelected={dateKey === selectedDate}
                            dragging={draggingId != null}
                            onSelect={() => setSelectedDate(dateKey)}
                            onDragStartCard={setDraggingId}
                            onDropCard={(cardId) => handleDrop(cardId, dateKey)}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}

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
                      기획하기
                    </Link>
                  </div>
                )}

                {/* 선택 날짜 리스트 — 패널·플래너가 없는 폭에서만 (썸네일 허용, DESIGN §8 Mobile) */}
                {state.cards.length > 0 && (
                  <section className={view === "week" ? "mt-6 md:hidden" : "mt-6 desktop:hidden"}>
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
                            <CardTile
                              card={card}
                              variant="row"
                              subline={
                                card.audience +
                                (card.scheduledDate < todayKey && card.status !== "published"
                                  ? " · 예정일 지남"
                                  : "")
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
              </div>

              {/* 오른쪽 미리보기 패널 — Desktop(≥1200)만 (08-31 시안 01·06) */}
              <aside className="sticky top-6 hidden w-[300px] shrink-0 self-start desktop:block">
                <DayPanel
                  dateKey={selectedDate}
                  cards={selectedCards}
                  todayKey={todayKey}
                  restDay={isUploadDayOf(uploadDays, selectedDate) === false}
                  onPublish={openPublish}
                />
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

          {/* 올렸어요 — 실제 올린 날짜 확인 (놓친 카드와 같은 규칙) */}
          {publishTarget && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="publish-title"
              onClick={() => setPublishTarget(null)}
              className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex w-full max-w-[400px] flex-col gap-4 rounded-xl bg-surface p-6 shadow-lg"
              >
                <h2 id="publish-title" className="text-title font-bold text-ink">
                  언제 올리셨어요?
                </h2>
                <p className="text-body text-sub">
                  「{publishTarget.title}」 — 올린 날짜로 기록해요.
                </p>
                <input
                  type="date"
                  value={publishDate}
                  min={
                    publishTarget.scheduledDate < todayKey ? publishTarget.scheduledDate : undefined
                  }
                  max={todayKey}
                  onChange={(e) => setPublishDate(e.target.value)}
                  className="h-11 rounded-md border border-line bg-surface px-3 text-body text-ink"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPublishTarget(null)}
                    className="h-11 flex-1 rounded-md border border-line bg-surface text-body font-semibold text-ink hover:bg-surface-muted"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={!publishDate}
                    onClick={() => void confirmPublish()}
                    className="h-11 flex-1 rounded-md bg-berry text-body font-semibold text-white hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
                  >
                    기록하기
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
 * 월간 날짜 칸 — Desktop: shortTitle 컴팩트 2건 + «+N건» / Mobile: 상태색 점.
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
  showPlus,
}: {
  dateKey: string;
  cards: Card[];
  isToday: boolean;
  isSelected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onDragStartCard: (id: string | null) => void;
  onDropCard: (cardId: string) => void;
  /** 업로드 요일인데 비어 있는 미래 날 — «채울 수 있어요» 표시 (08-31) */
  showPlus?: boolean;
}) {
  const dayNum = Number(dateKey.slice(8, 10));
  const [over, setOver] = useState(false);
  const maxDesktop = 2;

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

      {/* Desktop — 미니 카드: 상태 dot(범례와 같은 색) + 제목 2줄 (08-31 v2).
          클릭은 칸 선택으로 흘러간다 — 상세 이동은 패널의 몫 */}
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
            className="flex w-full items-start gap-1.5 overflow-hidden rounded-sm bg-surface-muted px-1.5 py-1 text-left hover:bg-berry-tint"
            title={card.title}
          >
            {card.status === "published" ? (
              <span aria-hidden className="shrink-0 text-caption font-semibold leading-tight text-sub">
                ✓
              </span>
            ) : (
              <span
                aria-hidden
                className="mt-[3px] h-2 w-2 shrink-0 rounded-pill"
                style={{ background: STATUS_COLOR[card.status] }}
              />
            )}
            {/* break-keep — 한국어를 단어 중간에서 끊지 않는다 (08-31) */}
            <span className="line-clamp-2 break-keep text-caption leading-tight text-ink">
              {card.title}
            </span>
          </button>
        ))}
        {cards.length > maxDesktop && (
          <span className="px-1 text-caption text-sub">+{cards.length - maxDesktop}건</span>
        )}
        {/* 업로드 요일인데 비어 있는 미래 날 — 채울 수 있다는 신호 (클릭 = 선택 → 패널 기획하기) */}
        {showPlus && <Plus size={14} aria-hidden className="mx-auto mt-1 text-berry/40" />}
      </span>
    </div>
  );
}

/**
 * 주간 보드 컬럼 — 빈 세로 박스를 그리지 않는다. 콘텐츠 카드가 주인공이고
 * 날짜는 위의 얇은 라벨, 빈 날은 «예정 없음»을 아주 약하게 (08-31 v2).
 * CTA는 여기 없다 — 카드를 클릭하면 선택되고, 행동은 오른쪽 패널이 맡는다.
 */
function WeekColumn({
  dateKey,
  cards,
  isToday,
  isSelected,
  dragging,
  onSelect,
  onDragStartCard,
  onDropCard,
  emptyHint,
}: {
  dateKey: string;
  cards: Card[];
  isToday: boolean;
  isSelected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onDragStartCard: (id: string | null) => void;
  onDropCard: (cardId: string) => void;
  /** 빈 날 표현 — rest: 업로드 요일 아님(쉬어가는 날) · invite: 채울 수 있는 날 */
  emptyHint: "none" | "rest" | "invite";
}) {
  const [over, setOver] = useState(false);
  const dayNum = Number(dateKey.slice(8, 10));
  const dow = DAY_HEADS[parseDateKey(dateKey).getDay()];

  return (
    <div
      data-date={dateKey}
      onClick={onSelect}
      onDragOver={(e) => {
        e.preventDefault();
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
        // 박스 없이 — 드롭 대상으로 살아 있도록 최소 높이와 hover 배경만
        "flex min-h-32 cursor-pointer flex-col gap-2 rounded-md p-1",
        over && dragging ? "bg-berry-tint" : "",
      ].join(" ")}
    >
      {/* 날짜 라벨 — 카드보다 약하게 */}
      <div className="flex items-center gap-1.5 px-1">
        <span
          className={[
            "text-caption",
            isToday || isSelected ? "font-bold text-berry-dark" : "text-sub",
          ].join(" ")}
        >
          {dayNum} {dow}
        </span>
        {isToday && (
          <span className="rounded-pill bg-berry-light px-1.5 text-caption font-semibold text-berry-dark">
            오늘
          </span>
        )}
      </div>

      {cards.length === 0 ? (
        emptyHint === "rest" ? (
          <p className="px-1 text-caption text-sub/40">쉬어가는 날</p>
        ) : emptyHint === "invite" ? (
          <Link
            href="/plan/new"
            onClick={(e) => e.stopPropagation()}
            className="flex h-14 items-center justify-center gap-1 rounded-md border border-dashed border-line text-caption text-sub hover:border-berry hover:text-berry-dark"
          >
            <Plus size={14} aria-hidden />
            기획하기
          </Link>
        ) : (
          <p className="px-1 text-caption text-sub/40">예정 없음</p>
        )
      ) : (
        cards.map((card) => (
          <CardTile
            key={card.id}
            card={card}
            variant="tile"
            selected={isSelected}
            onClick={onSelect}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/card-id", card.id);
              onDragStartCard(card.id);
            }}
            onDragEnd={() => onDragStartCard(null)}
          />
        ))
      )}
    </div>
  );
}

/**
 * 선택 날짜 미리보기 패널 (Desktop ≥1200) — 썸네일·캡션은 여기서만 보여준다.
 * 칸(Compact)이 «무엇이 언제»라면 패널은 «어떤 내용이고, 지금 뭘 할 차례인지»다 (08-31).
 */
function DayPanel({
  dateKey,
  cards,
  todayKey,
  restDay,
  onPublish,
}: {
  dateKey: string;
  cards: Card[];
  todayKey: string;
  restDay: boolean; // 업로드 요일이 아닌 빈 날 — 문구를 바꾼다 (08-31)
  onPublish: (card: Card) => void;
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
          <p className="text-body text-sub">
            {restDay ? "쉬어가는 날이에요." : "이 날에는 예정된 콘텐츠가 없어요."}
          </p>
          <Link
            href="/plan/new"
            className="mt-2 inline-block text-body font-semibold text-berry-dark underline"
          >
            기획하기
          </Link>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {cards.map((card) => (
            <li key={card.id}>
              {/* 딱 필요한 것만 — 제목·상태·대상·안내·CTA·상세 (08-31 v2, 사진·캡션 제외) */}
              <article className="flex flex-col items-start gap-2 rounded-lg border border-line p-3">
                <h3 className="break-keep text-body font-semibold text-ink">{card.title}</h3>
                <StatusBadge status={card.status} />
                <p className="text-caption text-sub">
                  {card.audience}
                  {card.scheduledDate < todayKey && card.status !== "published" && (
                    <span className="ml-1.5">· 예정일 지남</span>
                  )}
                </p>

                {/* 다음 할 일 — 정보(위)와 안내(아래)를 선·색으로 구분한다 (08-31) */}
                <div className="mt-1 flex w-full flex-col items-start gap-2 border-t border-line pt-2.5">
                  {card.status === "planned" && (
                    <>
                      <p className="break-keep text-caption text-ink">
                        아직 콘텐츠를 만들지 않았어요.
                      </p>
                      <Link
                        href={`/card/${card.id}/result`}
                        className="flex h-9 w-full items-center justify-center rounded-md bg-berry text-body font-semibold text-white hover:bg-berry-dark"
                      >
                        제작하기
                      </Link>
                    </>
                  )}
                  {card.status === "pending" && (
                    <>
                      <p className="break-keep text-caption text-ink">
                        콘텐츠 제작이 완료됐어요.
                        <br />
                        업로드했다면 기록해주세요.
                      </p>
                      <button
                        type="button"
                        onClick={() => onPublish(card)}
                        className="flex h-9 w-full items-center justify-center rounded-md bg-berry text-body font-semibold text-white hover:bg-berry-dark"
                      >
                        올렸어요
                      </button>
                    </>
                  )}
                  {card.status === "published" && (
                    <p className="break-keep text-caption text-ink">✓ 발행을 마친 콘텐츠예요.</p>
                  )}

                  <Link
                    href={`/card/${card.id}`}
                    className="text-caption font-semibold text-berry-dark underline underline-offset-2"
                  >
                    상세 보기 →
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
