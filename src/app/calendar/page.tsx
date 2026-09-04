"use client";

import { useEffect, useRef, useState } from "react";
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
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import AppShell from "@/components/AppShell";
import CardTile from "@/components/CardTile";
import StatusBadge from "@/components/StatusBadge";
import type { Card, CardStatus } from "@/types";

/**
 * 캘린더 — 월간·주간 (DESIGN.md §8 · PLAN §4 · 08-31 시안 반영).
 *
 * «Gallery가 아니라 콘텐츠 운영 계획을 한눈에 파악하는 공간이다.»
 * - 월간 = 흐름 파악: 칸 썸네일 금지, 미니 카드는 상태 dot(범례 색) + 제목 2줄,
 *   칸당 2건 + «+N건» (제목 2줄은 09-02 DESIGN §8 개정으로 확정)
 * - 주간 = 실행 관리: 시간축이 아니라(카드에 시간이 없다) 콘텐츠 카드가 주인공인
 *   weekly board. 빈 세로 박스를 그리지 않고, 빈 날은 «예정 없음»만 약하게
 * - 카드 클릭 = 선택. CTA는 오른쪽 패널에서만 강하게 — 화면 곳곳에 버튼을 반복하지 않는다
 * - Desktop(≥1200)은 오른쪽 패널, 그보다 좁으면 아래 리스트 (썸네일은 §8 Mobile 규칙)
 * - 드래그로 예정일 변경 — 실패 시 원위치 + 안내 (PLAN §3-1)
 *
 * 조회는 홈과 같은 클라이언트 SDK 쿼리 — 인덱스 (userId, scheduledDate).
 * 예정일 변경은 카드 상세와 같은 updateDoc — 규칙이 클라이언트 쓰기를 허용한다.
 */

type CalView = "month" | "week" | "list";

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

/**
 * 해당 월의 캘린더 격자 — 일요일 시작. 앞뒤 빈칸을 비우지 않고 **인접 달의
 * 실제 날짜**로 채운다 (09-01) — 월초에 «어제(전달)»로 드래그할 수 없던 공백 해소.
 * 다른 달 칸은 흐리게 그리되 선택·드롭은 똑같이 받는다.
 */
function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = first.getDay(); i > 0; i--) {
    cells.push(toDateKey(new Date(year, month, 1 - i)));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(toDateKey(new Date(year, month, d)));
  }
  let next = 1;
  while (cells.length % 7 !== 0) {
    cells.push(toDateKey(new Date(year, month + 1, next++)));
  }
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
    const grid = monthGrid(d.getFullYear(), d.getMonth());
    // 격자에 보이는 전 기간 — 인접 달 칸의 카드도 실제로 보여야 드래그 판단이 된다
    return { start: grid[0] as string, end: grid[grid.length - 1] as string };
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
  /*
    그 날 상세를 띄울지 (09-02 — 오른쪽 패널을 모달로 옮겼다).

    패널이 있던 자리는 1200 이상에서만 나오고 그보다 좁으면 아래 리스트라,
    같은 화면이 폭에 따라 다르게 동작했다. 게다가 펼쳐진 주 칸과 패널이 같은
    제목·상태를 **두 번** 보여줬다. 모달로 옮겨 한 군데로 모은다.
  */
  const [dayOpen, setDayOpen] = useState(false);
  /*
    고른 카드 (09-03). 날짜만 강조하면 그 날에 카드가 둘일 때
    «둘 중 어느 것을 눌렀는지»가 사라진다. 달력 칸과 모달 양쪽에서 같은 것을 짚는다.
  */
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  /* 버리기 확인 (09-03) — 되돌릴 수 없으므로 한 번 묻는다 (놓친 카드 화면과 같은 방식) */
  const [discardTarget, setDiscardTarget] = useState<Card | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 빈 날은 바로 옮기고, 이미 카드가 있는 날로 드롭할 때만 확인 팝업 (08-31 확정)
  const [pendingMove, setPendingMove] = useState<{ cardId: string; toDate: string } | null>(null);
  // 올렸어요 — 실제 올린 날짜를 물어보는 다이얼로그 (놓친 카드와 같은 규칙)
  const [publishTarget, setPublishTarget] = useState<Card | null>(null);
  const [publishDate, setPublishDate] = useState("");
  // 온보딩에서 고른 업로드 요일 (월=0…일=6) — 쉬는 날/채울 날 구분·목표 개수에 쓴다 (08-31)
  const [uploadDays, setUploadDays] = useState<number[] | null>(null);
  // [실험] 아코디언 — 기본은 순수 월간. «주 펼치기»를 눌러야 그 주만 보드로 확장 (주 시작일 키)

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

        const cardsRef = collection(db, "cards");

        // 목록보기는 전체 기간, 월간·주간은 보이는 범위만 (09-01)
        const rangeSnap =
          view === "list"
            ? await getDocs(
                query(cardsRef, where("userId", "==", uid), orderBy("scheduledDate", "asc")),
              )
            : await (() => {
                const { start, end } = rangeFor(view, anchor);
                return getDocs(
                  query(
                    cardsRef,
                    where("userId", "==", uid),
                    where("scheduledDate", ">=", start),
                    where("scheduledDate", "<=", end),
                    orderBy("scheduledDate", "asc"),
                  ),
                );
              })();
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
    setDayOpen(false); // 달을 옮기면 옛 날짜 창을 띄워둘 이유가 없다
    setSelectedCardId(null);
    setState({ phase: "loading" });
  }

  function goToday() {
    setSelectedDate(todayKey);
    /*
      **오늘 창을 바로 열지는 않는다** (09-02). 예전에는 그 주를 펼쳤는데
      (「오늘 할 일이 목적」), 아코디언을 없애면서 그 자리가 사라졌다.
      창을 자동으로 띄우면 「오늘」이 «오늘로 이동»이 아니라 «오늘을 연다»가 되어
      달을 훑다가 위치만 잡고 싶을 때 매번 닫아야 한다.
    */
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
    setDayOpen(false); // 달이 바뀌면 옛 날짜 창을 띄워둘 이유가 없다
    setState({ phase: "loading" });
  }

  /** 날짜 선택 — 칸을 강조하고, 카드가 있으면 상세 모달을 연다 (09-02) */
  function selectDate(dateKey: string, cardId: string | null = null) {
    setSelectedDate(dateKey);
    setSelectedCardId(cardId);
    /*
      **카드가 있는 날만 모달을 연다.** 빈 날까지 열면 달을 훑는 동안 빈 창이
      계속 뜬다. 빈 날은 펼쳐진 주 칸의 `+`로 담으면 된다 (DESIGN §8).
      모달 안에서 ‹ ›로 옮길 때는 빈 날도 그대로 보여준다 — 건너뛰면
      «몇 일로 갔는지»를 알 수 없다.
    */
    if ((byDate.get(dateKey)?.length ?? 0) > 0) setDayOpen(true);
  }

  /**
   * 버리기 — **삭제가 아니라 `discarded`다** (DESIGN §11).
   *
   * 카드는 사라지지 않고 상태만 바뀐다. 발행률의 분모에 남아야 해서다 —
   * 빼버리면 성적을 조작할 수 있다. 보안 규칙도 `allow delete: if false`로
   * 클라이언트 삭제를 아예 막아뒀다.
   *
   * 화면에서는 사라진다 — 달력은 `discarded`를 걸러서 그린다.
   */
  async function discardCard(card: Card) {
    try {
      await updateDoc(doc(db, "cards", card.id), { status: "discarded" });
      setState((prev) =>
        prev.phase === "ready"
          ? { ...prev, cards: prev.cards.filter((c) => c.id !== card.id) }
          : prev,
      );
      if (selectedCardId === card.id) setSelectedCardId(null);
    } catch {
      // 실패하면 카드가 그대로 남는다 — 조용히 지운 척하지 않는다
      window.alert("버리지 못했어요. 잠시 후 다시 시도해주세요.");
    }
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
      // 놓친 카드 수가 바뀔 수 있다 — 조용히 재조회 (loading 없이, 09-01)
      setReloadKey((k) => k + 1);
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
      setReloadKey((k) => k + 1); // 배지 즉시 갱신
    } catch {
      setNotice("저장하지 못했어요. 잠시 후 다시 시도해주세요.");
      setTimeout(() => setNotice(null), 3000);
    }
  }

  const anchorDate = parseDateKey(anchor);
  const anchorMonth = anchor.slice(0, 7);
  // 요약 헤더 집계용 — 월간에서는 격자에 보이는 인접 달 카드를 빼고 이 달만 센다
  const scopedCards =
    state.phase === "ready"
      ? view === "month"
        ? state.cards.filter((c) => (c.scheduledDate ?? "").slice(0, 7) === anchorMonth)
        : state.cards
      : [];
  const cells =
    view === "list"
      ? []
      : view === "month"
        ? monthGrid(anchorDate.getFullYear(), anchorDate.getMonth())
        : weekDates(anchor);
  const range =
    view === "list" ? { start: todayKey, end: todayKey } : rangeFor(view, anchor);
  // 목표 N개 — 보는 범위(월/주) 안의 업로드 요일 수. 예: 월수금 유저의 8월 = 그 달 월수금 일수
  const goalCount =
    uploadDays && uploadDays.length > 0
      ? cells.filter(
          (d): d is string =>
            d !== null &&
            (view !== "month" || d.slice(0, 7) === anchor.slice(0, 7)) &&
            isUploadDayOf(uploadDays, d) === true,
        ).length
      : null;
  const title =
    view === "list"
      ? "전체 콘텐츠"
      : view === "month"
        ? `${anchorDate.getFullYear()}년 ${anchorDate.getMonth() + 1}월`
        : weekTitle(range.start, range.end);

  const byDate = new Map<string, Card[]>();
  if (state.phase === "ready") {
    for (const card of state.cards) {
      // 날짜 없는 카드(09-01 scheduledDate 옵셔널화)는 달력 칸에 올릴 수 없어 건너뛴다
      if (!card.scheduledDate) continue;
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
    /*
      **지난 날짜로는 못 옮긴다** (09-03). 이미 지난 날에 올릴 일정을 잡는 건 말이 안 되고,
      옮기는 순간 «놓친 카드»가 되어버린다. 오늘은 허용한다(오늘 올릴 수 있으니).
    */
    if (dateKey < todayKey) {
      setNotice("지난 날짜로는 옮길 수 없어요.");
      setTimeout(() => setNotice(null), 3000);
      return;
    }
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

  /*
    고른 날짜가 예정일과 다른가 (09-04). 확정하면 `confirmPublish`가 예정일을
    올린 날로 **옮기므로**, 조용히 지나가지 않고 한 번 짚어준다.
  */
  const publishMovesDate =
    publishTarget !== null &&
    publishDate !== "" &&
    publishTarget.scheduledDate !== undefined &&
    publishTarget.scheduledDate !== publishDate;

  const pendingCard =
    pendingMove && state.phase === "ready"
      ? (state.cards.find((c) => c.id === pendingMove.cardId) ?? null)
      : null;
  const pendingTargetCards = pendingMove ? (byDate.get(pendingMove.toDate) ?? []) : [];

  return (
    <AppShell width={960}>
      {/* 헤더 — 이동·오늘 위, 월간/주간 토글은 제목 바로 아래 (08-31 v4) */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1">
            {view !== "list" && (
              <button
                type="button"
                onClick={() => move(-1)}
                aria-label={view === "month" ? "이전 달" : "이전 주"}
                className="flex size-11 items-center justify-center rounded-md text-sub hover:bg-surface-muted"
              >
                <ChevronLeft size={20} aria-hidden />
              </button>
            )}
            {/* 주간 제목이 길다 — 모바일에서는 한 단계 작게 */}
            <h1 className="text-center text-body font-bold text-ink md:min-w-[120px] md:text-title">
              {title}
            </h1>
            {view !== "list" && (
              <button
                type="button"
                onClick={() => move(1)}
                aria-label={view === "month" ? "다음 달" : "다음 주"}
                className="flex size-11 items-center justify-center rounded-md text-sub hover:bg-surface-muted"
              >
                <ChevronRight size={20} aria-hidden />
              </button>
            )}
            {/* 월간/주간 — 밑줄 탭 (08-31 v6) */}
            <div className="ml-2 flex gap-5">
              {(["month", "week", "list"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => switchView(v)}
                  className={[
                    "relative h-9 text-body",
                    view === v
                      ? "font-semibold text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-pill after:bg-berry"
                      : "text-sub hover:text-ink",
                  ].join(" ")}
                >
                  {v === "month" ? "월간" : v === "week" ? "주간" : "목록보기"}
                </button>
              ))}
            </div>

            {/* 오늘 — 탭 오른쪽, 라운드는 한 단계 작게 (08-31 복원) */}
            {view !== "list" && (
              <button
                type="button"
                onClick={goToday}
                className="ml-3 h-9 whitespace-nowrap rounded-sm border border-line bg-surface px-3 text-body text-ink hover:bg-surface-muted"
              >
                오늘
              </button>
            )}
          </div>
        </div>

        {state.phase === "ready" && state.overdueCount > 0 && (
          <Link
            href="/calendar/missed"
            /* 09-02 — 패널이 모달로 바뀌면서 이 배지의 자리가 없어졌다.
               DESIGN §8 「오른쪽 정렬로 작게」는 여기서도 지켜진다 (헤더 오른쪽 끝) */
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
        <>
        {view === "list" ? (
          <ListSection cards={state.cards} todayKey={todayKey} onPublish={openPublish} />
        ) : (
        <div className="mt-4">
          {/* 격자 영역 */}
          <div className="min-w-0 flex-1">
            {/* 요약 헤더 — 왼쪽 계획, 오른쪽 진행 상태. 월간·주간 공통 (08-31).
                상태 집계가 범례 역할도 겸한다 */}
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <div>
                <h2 className="text-body-l font-semibold text-ink">
                  {view === "month"
                    ? todayKey.slice(0, 7) === anchorMonth
                      ? "이번 달 콘텐츠"
                      : "이 달의 콘텐츠"
                    : todayKey >= range.start && todayKey <= range.end
                      ? "이번 주 콘텐츠"
                      : "이 주의 콘텐츠"}
                </h2>
                {/* 목표 대비 실제 발행 — 발행률이 우리 북극성 지표다 */}
                <p className="mt-0.5 text-caption text-sub">
                  {goalCount != null ? `목표 ${goalCount}개 · ` : ""}
                  {scopedCards.filter((c) => c.status === "published").length}개 발행
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
                    ) : status === "planned" ? (
                      // 제작 대기 = 빈 링 (형태로 구분, 09-03)
                      <span aria-hidden className="h-2 w-2 rounded-pill border-2 border-st-planned" />
                    ) : (
                      <span
                        aria-hidden
                        className="h-2 w-2 rounded-pill"
                        style={{ background: STATUS_COLOR[status] }}
                      />
                    )}
                    {label}{" "}
                    <span className="font-medium">
                      {scopedCards.filter((c) => c.status === status).length}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            {view === "month" ? (
              <>
                {/* 요일 헤더 */}
                <div className="mt-3 grid grid-cols-7">
                  {DAY_HEADS.map((d) => (
                    <div key={d} className="py-2 text-center text-caption text-sub">
                      {d}
                    </div>
                  ))}
                </div>

                {/*
                  **아코디언을 없앴다** (09-02).

                  예전에는 날짜를 클릭하면 그 주가 주간 보드로 펼쳐졌다(08-31 v2).
                  실제로 써보니 고를 때마다 그 주가 두 배로 부풀어 **아래 주들이
                  화면 밖으로 밀렸다.** 월간은 「이번 달이 촘촘한지 비었는지」를 보는
                  화면인데(DESIGN §8), 고를 때마다 모양이 바뀌면 그 감각이 깨진다.

                  그 주의 작업 보드가 필요하면 **「주간」 보기**가 이미 그 일을 한다.
                  같은 일을 두 곳에서 하지 않는다. 고른 날의 상세는 모달이 맡는다.
                */}
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
                        onSelect={() => selectDate(dateKey)}
                        selectedCardId={selectedCardId}
                        onSelectCard={(cardId) => selectDate(dateKey, cardId)}
                        onDragStartCard={setDraggingId}
                        onDropCard={(cardId) => handleDrop(cardId, dateKey)}
                        showPlus={
                          dateKey.slice(0, 7) === anchorMonth &&
                          (byDate.get(dateKey) ?? []).length === 0 &&
                          dateKey >= todayKey &&
                          isUploadDayOf(uploadDays, dateKey) === true
                        }
                        muted={dateKey.slice(0, 7) !== anchorMonth}
                      />
                    ),
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Desktop/Tablet — 플래너 컬럼 (09-03: 요일 헤더 + 자연 높이) */}
                <div className="mt-3 hidden grid-cols-7 md:grid">
                  {(cells as string[]).map((dateKey) => (
                    <div key={`h-${dateKey}`} className="py-1 text-center text-caption text-sub">
                      {DAY_HEADS[parseDateKey(dateKey).getDay()]}
                    </div>
                  ))}
                </div>
                {/*
                  `items-start` — 빈 날이 가장 긴 칼럼 높이로 늘어나지 않게 (09-03).
                  전엔 한 날에 카드가 둘이면 나머지 빈 날도 그만큼 커져 여백이 컸다.
                */}
                <div className="hidden grid-cols-7 items-start gap-1 md:grid">
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

          </div>

        </div>
        )}
        </>
      )}

      {/* 그 날 상세 — 오른쪽 패널을 대신한다 (09-02) */}
      {dayOpen && state.phase === "ready" && (
        <DayModal
          dateKey={selectedDate}
          cards={selectedCards}
          todayKey={todayKey}
          highlightId={selectedCardId}
          restDay={isUploadDayOf(uploadDays, selectedDate) === false}
          onPublish={openPublish}
          onDiscard={setDiscardTarget}
          onMove={(step) => {
            /*
              하루씩 옮긴다. **달을 넘어가면 격자도 같이 옮긴다** — 안 그러면
              창에는 10월 1일이 떠 있는데 뒤 달력은 9월이라 어디를 보는지 어긋난다.
            */
            const next = parseDateKey(selectedDate);
            next.setDate(next.getDate() + step);
            const key = toDateKey(next);
            setSelectedDate(key);
            setSelectedCardId(null); // 날이 바뀌면 짚어둔 카드도 놓는다
            if (view === "month" && next.getMonth() !== anchorDate.getMonth()) {
              setAnchor(key);
              setState({ phase: "loading" });
            }
          }}
          onClose={() => setDayOpen(false)}
        />
      )}

      {/*
        버리기 확인 (09-03) — 되돌릴 수 없어서 한 번 묻는다.
        「놓친 카드」 화면과 같은 문구·같은 모양으로 둔다. 같은 일을 두 곳에서
        다르게 물으면 «다른 일인가»가 된다.

        z-60 — 그 날 상세 창(z-50) 위에 뜬다. 아래 창을 닫지 않는 이유는,
        취소했을 때 보고 있던 자리로 그대로 돌아와야 하기 때문이다.
      */}
      {discardTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="discard-title"
          onClick={() => setDiscardTarget(null)}
          className="fixed inset-0 z-60 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-[400px] flex-col gap-4 rounded-xl bg-surface p-6 shadow-lg"
          >
            <h2 id="discard-title" className="text-title font-bold text-ink">
              이 카드를 버릴까요?
            </h2>
            <p className="break-keep text-body text-sub">
              「{discardTarget.shortTitle || discardTarget.title}」
              <br />
              버린 카드는 되돌릴 수 없어요. 삭제되는 건 아니고, 계획했던 기록으로 남아요.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDiscardTarget(null)}
                className="h-11 flex-1 rounded-md border border-line bg-surface text-body font-semibold text-ink"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = discardTarget;
                  setDiscardTarget(null);
                  void discardCard(target);
                }}
                className="h-11 flex-1 rounded-md border border-warn bg-transparent text-body font-semibold text-warn"
              >
                버리기
              </button>
            </div>
          </div>
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
                publishTarget.scheduledDate !== undefined &&
                publishTarget.scheduledDate < todayKey
                  ? publishTarget.scheduledDate
                  : undefined
              }
              max={todayKey}
              onChange={(e) => setPublishDate(e.target.value)}
              className="h-11 rounded-md border border-line bg-surface px-3 text-body text-ink"
            />
            {/*
              예정일과 다른 날을 골랐을 때만 나온다 (09-04). 기록만 되는 게 아니라
              캘린더의 자리까지 옮겨지므로, 무엇이 바뀌는지 눌러 확정하기 전에 보여준다.
            */}
            {publishMovesDate && publishTarget.scheduledDate !== undefined && (
              <p className="break-keep rounded-md bg-surface-muted p-3 text-caption text-ink">
                예정일은{" "}
                <span className="font-semibold">
                  {formatDayLabel(publishTarget.scheduledDate)}
                </span>
                였어요.{" "}
                <span className="font-semibold">{formatDayLabel(publishDate)}</span>에 올린 것이
                맞다면, 캘린더에서도 이 콘텐츠가 그날로 옮겨집니다.
              </p>
            )}
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
                {publishMovesDate ? "그날 올린 게 맞아요" : "기록하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 이동 실패 안내 — 빨간색 금지 (DESIGN §2) */}
      {notice && (
        <div
          role="alert"
          className="fixed right-4 top-16 z-50 rounded-md bg-ink px-4 py-2.5 text-body text-white shadow-lg md:right-8 md:top-20"
        >
          {notice}
        </div>
      )}
    </AppShell>
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
  muted,
  isPast,
  selectedCardId,
  onSelectCard,
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
  /** 인접 달 날짜 — 흐리게 그리되 선택·드롭은 받는다 (09-01) */
  muted?: boolean;
  /** 지난 날짜 — 드롭을 안 받는다 (09-03). 드래그 중이면 «못 놓음»을 보여준다 */
  isPast?: boolean;
  /** 고른 카드 (09-03). 날짜만이 아니라 «어느 카드»인지도 보여야 한다 */
  selectedCardId?: string | null;
  onSelectCard?: (cardId: string) => void;
}) {
  const dayNum = Number(dateKey.slice(8, 10));
  const [over, setOver] = useState(false);
  const maxDesktop = 2;

  return (
    <div
      data-date={dateKey}
      onClick={onSelect}
      onDragOver={(e) => {
        if (isPast) return; // 지난 날짜엔 드롭을 안 받는다 — preventDefault를 안 하면 커서가 «금지»
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (isPast) return;
        const cardId = e.dataTransfer.getData("text/card-id");
        if (cardId) onDropCard(cardId);
      }}
      className={[
        "relative min-h-14 cursor-pointer rounded-sm border p-1 md:min-h-24 md:p-1.5",
        muted ? "opacity-45" : "",
        // 드래그 중인데 지난 날짜면 «여기엔 못 놓음»을 옅게 (09-03)
        isPast && dragging ? "opacity-50" : "",
        /*
          **고른 칸을 확실히 띄운다** (09-03). 1px 테두리만으로는 옆 칸과 구별이 안 갔다.
          `ring`을 쓰는 이유 — `border-2`로 굵히면 안쪽 폭이 1px 줄어 글자가 밀린다.
          링은 상자 바깥에 그려져 **자리를 건드리지 않는다.**
        */
        isSelected ? "border-berry ring-2 ring-berry" : "border-line",
        over && dragging
          ? "bg-berry-light"
          : isSelected
            ? "bg-berry-tint"
            : "bg-surface",
      ].join(" ")}
    >
      <div className="flex items-start justify-between">
        <span
          className={[
            "flex size-6 items-center justify-center rounded-pill text-caption",
            // 오늘 > 선택 > 평소. 오늘이면서 고른 날은 오늘 표시를 이긴다 (칸 링이 선택을 말한다)
            isToday
              ? "bg-berry font-bold text-white"
              : isSelected
                ? "bg-berry-light font-bold text-berry-dark"
                : "text-sub",
          ].join(" ")}
        >
          {dayNum}
        </span>

        {/*
          담긴 콘텐츠 수 배지 (09-03) — 알림 숫자처럼 **오른쪽 위**에. 카드가 2건보다
          많을 때만 뜬다. 아래 «+N건» 회색 글씨보다 한눈에 들어온다.
          데스크톱은 «전체 N», 모바일은 칸이 좁아 점만 있으니 여기서 총수를 보여준다.
        */}
        {cards.length > maxDesktop && (
          <span className="hidden shrink-0 items-center rounded-pill bg-berry px-2 py-0.5 text-label font-bold text-white md:flex">
            +{cards.length - maxDesktop}건
          </span>
        )}
      </div>

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
        {cards.slice(0, maxDesktop).map((card) => {
          const cardOn = card.id === selectedCardId;
          return (
          <button
            key={card.id}
            type="button"
            draggable
            aria-pressed={cardOn}
            onClick={(e) => {
              // 칸 선택으로 흘러가되, 어느 카드를 눌렀는지도 남긴다 (09-03)
              e.stopPropagation();
              onSelectCard?.(card.id);
            }}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/card-id", card.id);
              onDragStartCard(card.id);
            }}
            onDragEnd={() => onDragStartCard(null)}
            className={[
              "flex w-full items-start gap-1.5 overflow-hidden rounded-sm px-1.5 py-1 text-left",
              cardOn
                ? "bg-berry text-white"
                : "bg-surface-muted hover:bg-berry-tint",
            ].join(" ")}
            title={card.title}
          >
            {card.status === "published" ? (
              <span
                aria-hidden
                className={[
                  "shrink-0 text-caption font-semibold leading-tight",
                  cardOn ? "text-white" : "text-sub",
                ].join(" ")}
              >
                ✓
              </span>
            ) : card.status === "planned" ? (
              /*
                제작 대기 = **빈 링** (09-03). 아직 안 만든 상태라 «비어 있음»으로.
                업로드 대기(꽉 찬 점)와 형태로 갈린다 — 색만으론 파스텔이라 안 갈렸다.
              */
              <span
                aria-hidden
                className={[
                  "mt-[3px] h-2 w-2 shrink-0 rounded-pill border-2",
                  cardOn ? "border-white/80" : "border-st-planned",
                ].join(" ")}
              />
            ) : (
              /* 업로드 대기 = **꽉 찬 점** (만들어 둠, 올릴 차례). 제작 대기와 형태로 구분 */
              <span
                aria-hidden
                className={[
                  "mt-[3px] h-2 w-2 shrink-0 rounded-pill",
                  cardOn ? "ring-1 ring-white/70" : "",
                ].join(" ")}
                style={{ background: STATUS_COLOR[card.status] }}
              />
            )}
            {/*
              **`shortTitle`을 쓴다** (09-02 수정). 원 제목을 그대로 넣고 있었는데
              칸이 좁아 「헬스장 처음 간 ...」처럼 대부분 잘려서, 달력만 보고는
              무슨 카드인지 알 수 없었다. 12자 내외 축약본이 바로 이 자리를 위해
              카드 생성 때 함께 만들어진다 (PLAN.md §3 · DESIGN.md §8).
              옛 카드에는 없을 수 있어 원 제목으로 물러선다.
              break-keep — 한국어를 단어 중간에서 끊지 않는다 (08-31)
            */}
            <span
              className={[
                "line-clamp-2 break-keep text-caption leading-tight",
                cardOn ? "font-semibold text-white" : "text-ink",
              ].join(" ")}
            >
              {card.shortTitle || card.title}
            </span>
          </button>
          );
        })}
        {/* «+N건» 회색 글씨는 09-03에 오른쪽 위 배지로 옮겼다 */}
      </span>

      {/* 업로드 요일인데 비어 있는 미래 날 — 칸 정중앙에 채움 신호 (클릭 = 선택 → 패널) */}
      {showPlus && (
        <span className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex">
          <Plus size={14} aria-hidden className="text-berry/40" />
        </span>
      )}
    </div>
  );
}

/**
 * 목록보기 (09-01) — 전체 카드를 한 곳에서 관리한다.
 * 상태 칩(개수)·기간 필터·제목 검색 + 상태별 인라인 액션(제작하기/올렸어요).
 * 정렬은 예정일 최신순. 발행 완료는 실제 발행일을 함께 보여준다.
 */
function ListSection({
  cards,
  todayKey,
  onPublish,
}: {
  cards: Card[];
  todayKey: string;
  onPublish: (card: Card) => void;
}) {
  const [filter, setFilter] = useState<"all" | "overdue" | "planned" | "pending" | "published">(
    "all",
  );
  // 지난/예정 필터 — 같은 칩을 다시 누르면 해제(전체)
  const [timeFilter, setTimeFilter] = useState<"all" | "past" | "future">("all");
  const [search, setSearch] = useState("");
  // 정렬 — 기본은 기획일(예정일) 미래 → 과거
  const [sort, setSort] = useState<"planDate" | "title" | "status" | "publishDate">("planDate");

  const isOverdue = (c: Card) =>
    // 날짜 없는 카드(09-01 옵셔널화)는 «지남»이 아니다
    Boolean(c.scheduledDate) && (c.scheduledDate as string) < todayKey && c.status !== "published";

  const counts = {
    all: cards.length,
    overdue: cards.filter(isOverdue).length,
    planned: cards.filter((c) => c.status === "planned").length,
    pending: cards.filter((c) => c.status === "pending").length,
    published: cards.filter((c) => c.status === "published").length,
  };

  const inTime = (c: Card) =>
    timeFilter === "all"
      ? true
      : timeFilter === "past"
        ? (c.scheduledDate ?? "") < todayKey
        : (c.scheduledDate ?? "") >= todayKey;

  const keyword = search.trim();
  // 주제 검색 — 제목과 캡션(본문·해시태그)을 함께 뒤진다 (09-01)
  const searchText = (c: Card) =>
    c.title +
    (c.caption
      ? ` ${c.caption.hook} ${c.caption.body} ${c.caption.cta} ${c.caption.hashtags.join(" ")}`
      : "");
  const STATUS_ORDER: Record<Card["status"], number> = {
    planned: 0,
    pending: 1,
    published: 2,
    discarded: 3,
  };
  const planDateDesc = (a: Card, b: Card) =>
    (b.scheduledDate ?? "").localeCompare(a.scheduledDate ?? "");
  const filtered = cards
    .filter((c) =>
      filter === "all" ? true : filter === "overdue" ? isOverdue(c) : c.status === filter,
    )
    .filter(inTime)
    .filter((c) => keyword === "" || searchText(c).includes(keyword))
    .sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "ko");
      if (sort === "status") return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || planDateDesc(a, b);
      if (sort === "publishDate") {
        // 발행된 카드 먼저(최근 발행 위), 미발행은 뒤에서 기획일순
        const ap = a.publishedAt ? a.publishedAt.toMillis() : null;
        const bp = b.publishedAt ? b.publishedAt.toMillis() : null;
        if (ap !== null && bp !== null) return bp - ap;
        if (ap !== null) return -1;
        if (bp !== null) return 1;
        return planDateDesc(a, b);
      }
      return planDateDesc(a, b); // 기획일(기본) — 미래 → 과거
    });

  const STATUS_CHIPS = [
    ["all", "전체"],
    ["overdue", "놓친 카드"],
    ["planned", "제작 대기"],
    ["pending", "업로드 대기"],
    ["published", "발행"],
  ] as const;
  const TIME_CHIPS = [
    ["past", "지난 카드만 보기"],
    ["future", "예정된 카드만 보기"],
  ] as const;

  const chipClass = (active: boolean) =>
    [
      "h-9 whitespace-nowrap rounded-pill px-3 text-body",
      active
        ? "bg-berry-light font-semibold text-berry-dark"
        : "bg-surface-muted text-sub hover:text-ink", // 비활성은 회색 면 (09-01)
    ].join(" ");

  return (
    <section className="mt-4">
      {/* 필터 줄 — 상태 · 기간 · 검색 */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_CHIPS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={chipClass(filter === key)}
          >
            {label} {counts[key]}
          </button>
        ))}
        <span aria-hidden className="mx-1 h-4 w-px bg-line" />
        {/* 글자형 필터 — 두 항목을 구분점으로 나누고, 켜진 쪽만 ✓·베리·밑줄 (09-01) */}
        <div className="flex h-9 items-center gap-2">
          {TIME_CHIPS.map(([key, label], i) => (
            <span key={key} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="text-caption text-sub/40">·</span>}
              <button
                type="button"
                onClick={() => setTimeFilter(timeFilter === key ? "all" : key)}
                aria-pressed={timeFilter === key}
                className={[
                  "text-caption transition-colors",
                  timeFilter === key
                    ? "font-semibold text-berry-dark underline decoration-2 underline-offset-4"
                    : "text-sub/70 hover:text-ink",
                ].join(" ")}
              >
                {label}
              </button>
            </span>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="주제 검색"
          className="ml-auto h-9 w-full rounded-md border border-line bg-surface px-3 text-body text-ink placeholder:text-sub/60 sm:w-[200px]"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          aria-label="정렬 기준"
          className="h-9 rounded-md border border-line bg-surface px-2.5 text-body text-ink"
        >
          <option value="planDate">기획일</option>
          <option value="title">제목</option>
          <option value="status">상태</option>
          <option value="publishDate">발행일</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-2">
          <p className="text-body text-sub">조건에 맞는 카드가 없어요.</p>
          {/* 필터 교집합이 비었을 때 스스로 빠져나오는 길 (09-01) */}
          {(filter !== "all" || timeFilter !== "all" || keyword !== "") && (
            <button
              type="button"
              onClick={() => {
                setFilter("all");
                setTimeFilter("all");
                setSearch("");
              }}
              className="mt-1 h-10 rounded-md border border-line bg-surface px-4 text-body font-semibold text-ink hover:bg-surface-muted"
            >
              필터 초기화
            </button>
          )}
          {filter === "all" && timeFilter === "all" && keyword === "" && (
            <Link
              href="/plan/new"
              className="mt-1 flex h-11 items-center rounded-md bg-berry px-5 text-body font-semibold text-white hover:bg-berry-dark"
            >
              기획하기
            </Link>
          )}
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {filtered.map((card) => {
            const pub = card.publishedAt != null ? card.publishedAt.toDate() : null;
            const pubKey = pub
              ? `${pub.getFullYear()}-${String(pub.getMonth() + 1).padStart(2, "0")}-${String(
                  pub.getDate(),
                ).padStart(2, "0")}`
              : null;
            return (
              <li
                key={card.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface p-3"
              >
                <Link href={`/card/${card.id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold text-ink hover:underline">
                    {card.title}
                  </span>
                  <span className="mt-0.5 block truncate text-caption text-sub">
                    {card.scheduledDate ? formatDayLabel(card.scheduledDate) : "날짜 미정"}
                    {isOverdue(card) && " · 예정일 지남"}
                    {card.status === "published" && pubKey && ` · ${formatDayLabel(pubKey)} 발행`}
                  </span>
                </Link>
                <StatusBadge status={card.status} />
                {/* 두 액션 구분 — 제작하기는 솔리드, 올렸어요는 아웃라인 (09-01 확정) */}
                {card.status === "planned" && (
                  <Link
                    href={`/card/${card.id}/result`}
                    className="flex h-9 items-center rounded-md bg-berry px-3 text-body font-semibold text-white hover:bg-berry-dark"
                  >
                    제작하기
                  </Link>
                )}
                {card.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => onPublish(card)}
                    className="flex h-9 items-center rounded-md border-2 border-berry bg-surface px-3 text-body font-semibold text-berry hover:bg-berry-light hover:text-berry-dark"
                  >
                    올렸어요
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
  isPast,
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
  /** 지난 날짜 — 드롭을 안 받는다 (09-03) */
  isPast?: boolean;
}) {
  const [over, setOver] = useState(false);
  const dayNum = Number(dateKey.slice(8, 10));

  return (
    <div
      data-date={dateKey}
      onClick={onSelect}
      onDragOver={(e) => {
        if (isPast) return; // 지난 날짜엔 드롭 안 받는다 (09-03)
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (isPast) return;
        const cardId = e.dataTransfer.getData("text/card-id");
        if (cardId) onDropCard(cardId);
      }}
      className={[
        // 박스 없이 — 드롭 대상으로 살아 있도록 최소 높이와 hover 배경만
        "flex min-h-20 cursor-pointer flex-col gap-2 rounded-md p-1.5",
        over && dragging ? "bg-berry-tint" : isSelected ? "bg-berry-tint" : "",
        isPast && dragging ? "opacity-50" : "",
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
          {dayNum}
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
 * 그 날 상세 모달 (09-02) — 오른쪽 패널을 대신한다.
 *
 * **왜 옮겼나.** 패널은 1200 이상에서만 나오고 그보다 좁으면 아래 리스트였다 —
 * 같은 화면이 폭에 따라 다르게 동작했다. 게다가 날짜를 고르면 그 주가 펼쳐지는데
 * (아코디언), 펼쳐진 칸과 패널이 **같은 제목·상태를 두 번** 보여줬다.
 *
 * **‹ ›로 날짜를 넘긴다.** 모달의 유일한 약점은 달력을 가린다는 것이다.
 * 닫고 → 다른 날 누르고 → 다시 열고를 반복하지 않게, 창 안에서 하루씩 옮긴다.
 * 빈 날도 그대로 보여준다 — 건너뛰면 지금 며칠을 보고 있는지 알 수 없다.
 *
 * 빠져나갈 길 셋 — Esc · 바깥 누르기 · 닫기 버튼.
 */
function DayModal({
  dateKey,
  cards,
  todayKey,
  highlightId,
  restDay,
  onPublish,
  onDiscard,
  onMove,
  onClose,
}: {
  dateKey: string;
  cards: Card[];
  todayKey: string;
  /** 달력에서 눌러 짚어둔 카드 (09-03). 창 안에서도 같은 것을 강조한다 */
  highlightId?: string | null;
  restDay: boolean;
  onPublish: (card: Card) => void;
  /** 버리기 — 확인은 부르는 쪽이 받는다 (09-03) */
  onDiscard: (card: Card) => void;
  /** 하루 앞뒤로 옮긴다 */
  onMove: (step: number) => void;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.focus(); // 화살표·Esc가 바로 먹게
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onMove(-1);
      else if (e.key === "ArrowRight") onMove(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onMove, onClose]);

  const dow = DAY_HEADS[parseDateKey(dateKey).getDay()];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${Number(dateKey.slice(5, 7))}월 ${Number(dateKey.slice(8, 10))}일 콘텐츠`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
      onClick={onClose}
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        data-focus-ring="none"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-[620px] flex-col overflow-hidden rounded-lg bg-surface outline-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="min-w-0 truncate text-body font-bold text-ink">
            {Number(dateKey.slice(5, 7))}월 {Number(dateKey.slice(8, 10))}일 ({dow})
            {dateKey === todayKey && (
              <span className="ml-2 rounded-pill bg-berry-light px-2 py-0.5 text-caption font-semibold text-berry-dark">
                오늘
              </span>
            )}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onMove(-1)}
              aria-label="앞날"
              className="flex size-9 items-center justify-center rounded-md text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              aria-label="다음날"
              className="flex size-9 items-center justify-center rounded-md text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
            >
              <ChevronRight size={16} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="flex size-9 items-center justify-center rounded-md text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-4">
          <DayPanel
            bare
            dateKey={dateKey}
            cards={cards}
            todayKey={todayKey}
            highlightId={highlightId}
            restDay={restDay}
            onPublish={onPublish}
            onDiscard={onDiscard}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * 선택 날짜 미리보기 패널 (Desktop ≥1200) — 썸네일·캡션은 여기서만 보여준다.
 * 칸(Compact)이 «무엇이 언제»라면 패널은 «어떤 내용이고, 지금 뭘 할 차례인지»다 (08-31).
 */
function DayPanel({
  bare,
  dateKey,
  cards,
  todayKey,
  highlightId,
  restDay,
  onPublish,
  onDiscard,
}: {
  /** 모달 안에서는 상자와 날짜 제목을 창이 이미 그린다 — 두 번 그리지 않는다 */
  bare?: boolean;
  dateKey: string;
  /** 이 카드를 짚어 보여준다 (09-03) */
  highlightId?: string | null;
  cards: Card[];
  todayKey: string;
  restDay: boolean; // 업로드 요일이 아닌 빈 날 — 문구를 바꾼다 (08-31)
  onPublish: (card: Card) => void;
  /** 있으면 카드마다 「버리기」를 단다 (09-03). 없으면 안 그린다 */
  onDiscard?: (card: Card) => void;
}) {
  const dow = DAY_HEADS[parseDateKey(dateKey).getDay()];

  /*
    **제작 여부로 나눈다** (09-03).

    「완료」라고 부르지 않는 이유 — `pending`(업로드 대기)은 만들어는 뒀지만 올릴 일이
    남은 상태다. 완료라고 하면 할 일이 끝난 것처럼 읽힌다. 그래서 만든 시점을 기준으로
    「만들어야 해요 / 만들어 뒀어요」다.

    **할 일이 남은 쪽을 위에 둔다** — 이 화면의 목적이 「지금 뭘 해야 하나」다.
  */
  const todo = cards.filter((c) => c.status === "planned");
  const made = cards.filter((c) => c.status !== "planned");
  const sections = [
    { key: "todo", label: "만들어야 해요", cards: todo },
    { key: "made", label: "만들어 뒀어요", cards: made },
  ].filter((sec) => sec.cards.length > 0);
  const showHeads = sections.length > 1;

  return (
    <div className={bare ? "" : "rounded-lg border border-line bg-surface p-4"}>
      {!bare && (
        <h2 className="text-body font-semibold text-ink">
          {Number(dateKey.slice(5, 7))}월 {Number(dateKey.slice(8, 10))}일 ({dow})
          {dateKey === todayKey && (
            <span className="ml-2 rounded-pill bg-berry-light px-2 py-0.5 text-caption font-semibold text-berry-dark">
              오늘
            </span>
          )}
        </h2>
      )}

      {cards.length === 0 ? (
        <div className={bare ? "" : "mt-3"}>
          <p className="text-body text-sub">
            {restDay ? "쉬어가는 날이에요." : "아직 예정된 콘텐츠가 없어요."}
          </p>
          <Link
            href="/plan/new"
            className="mt-2 inline-block text-body font-semibold text-berry-dark underline"
          >
            {restDay ? "콘텐츠 추가하기" : "기획하기"}
          </Link>
        </div>
      ) : (
        <ul className={`flex flex-col gap-3 ${bare ? "" : "mt-3"}`}>
          {sections.map((sec) => (
            <li key={sec.key}>
              {/*
                **머리글은 양쪽에 다 있을 때만 단다** (09-03).
                하루에 카드가 하나뿐인 날이 대부분인데 거기까지 붙이면
                제목이 카드보다 커진다 — 나눌 것이 없으면 나누지 않는다.
              */}
              {showHeads && (
                <p className="mb-2 text-label font-semibold text-sub">
                  {sec.label} {sec.cards.length}
                </p>
              )}
              {/*
                카드를 **좌우로** 늘어놓는다 (09-03). 세로로 쌓으면 하루에 여럿일 때
                아래로 길어져 한눈에 안 들어온다. 앱의 제작 결과·템플릿과 같은 가로 스크롤.
                `overscroll-x-contain` — 밀 때 모달이 통째로 안 밀리게.
              */}
              <ul className="flex items-stretch gap-3 overflow-x-auto overscroll-x-contain pb-1">
                {sec.cards.map((card) => (
            <li key={card.id} className="flex">
              {/* 딱 필요한 것만 — 제목·상태·대상·안내·CTA·상세 (08-31 v2, 사진·캡션 제외) */}
              <article
                className={[
                  "flex h-full w-[240px] shrink-0 flex-col items-start gap-2 rounded-lg border p-3",
                  /*
                    **누른 그 카드를 짚어준다** (09-03). 하루에 카드가 둘이면
                    창을 열었을 때 어느 것을 눌렀는지 알 수 없었다.
                    카드가 하나뿐이면 강조가 의미 없으므로 걸지 않는다.

                    **면은 칠하지 않는다** (09-04) — `bg-berry-tint`(#F0E6EA)가
                    「올렸어요」 hover의 `berry-light`(#F2DCE5) · 「버리기」 hover의
                    `surface-muted`(#F6F2F4)와 거의 같은 색이라, 짚인 카드 위에서만
                    호버가 안 먹는 것처럼 보였다. 테두리·링만으로 충분히 짚인다.

                    **링은 안쪽에 그린다**(`ring-inset`, 09-04) — 카드를 좌우로
                    늘어놓는 `overflow-x-auto` 줄이 상자 밖 2px를 잘라내서, 맨 앞
                    카드가 짚였을 때 왼쪽 테두리가 세로로 잘려 보였다.
                  */
                  card.id === highlightId && cards.length > 1
                    ? "border-berry ring-2 ring-inset ring-berry"
                    : "border-line",
                ].join(" ")}
              >
                <h3 className="line-clamp-2 w-full break-keep text-body font-semibold text-ink">
                  {card.title}
                </h3>
                <StatusBadge status={card.status} />
                <p className="line-clamp-1 w-full text-caption text-sub">
                  {card.audience}
                  {card.scheduledDate !== undefined &&
                    card.scheduledDate < todayKey &&
                    card.status !== "published" && (
                    <span className="ml-1.5">· 예정일 지남</span>
                  )}
                </p>

                {/*
                  다음 할 일 — 정보(위)와 안내(아래)를 선·색으로 구분한다 (08-31).
                  `mt-auto` — 카드 바닥에 붙인다. 제목 길이가 달라도 CTA 줄이 나란히
                  맞춰져 카드 높이가 통일된다 (09-03).
                */}
                <div className="mt-auto flex w-full flex-col items-start gap-2 border-t border-line pt-2.5">
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
                      {/* 목록보기와 같은 구분 — 제작하기=솔리드, 올렸어요=아웃라인 (09-01) */}
                      <button
                        type="button"
                        onClick={() => onPublish(card)}
                        className="flex h-9 w-full items-center justify-center rounded-md border-2 border-berry bg-surface text-body font-semibold text-berry hover:bg-berry-light hover:text-berry-dark"
                      >
                        올렸어요
                      </button>
                    </>
                  )}
                  {card.status === "published" && (
                    <p className="break-keep text-caption text-ink">✓ 발행을 마친 콘텐츠예요.</p>
                  )}

                  {/*
                    「상세 보기」와 「버리기」를 한 줄에 두되 **양 끝으로 벌린다** (09-03).
                    나란히 붙여두면 되돌릴 수 없는 쪽을 잘못 누르기 쉽다.
                    버리기는 글자만 — 색 있는 버튼으로 만들면 위에 있는 CTA와 경쟁한다.
                  */}
                  <div className="flex w-full items-center justify-between gap-3">
                    <Link
                      href={`/card/${card.id}`}
                      className="text-caption font-semibold text-berry-dark underline underline-offset-2"
                    >
                      상세 보기 →
                    </Link>
                    {onDiscard && (
                      <button
                        type="button"
                        onClick={() => onDiscard(card)}
                        className="rounded-md px-2 py-1 text-caption text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-warn"
                      >
                        버리기
                      </button>
                    )}
                  </div>
                </div>
              </article>
            </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
