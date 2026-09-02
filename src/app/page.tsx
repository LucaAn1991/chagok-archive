"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogoSymbol } from "@/components/Logo";
import { onAuthStateChanged, signOut, type User as AuthUser } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { ArrowUp, ChevronRight, CircleUserRound } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import FeaturedContentCard from "@/components/FeaturedContentCard";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { formatMonthDayWeekday } from "@/lib/format";
import { AI_DISCLOSURE } from "@/lib/ai-disclosure";
import type { Card } from "@/types";

/**
 * `/` — 비로그인이면 랜딩, 로그인이면 홈 (PLAN.md §5 「PRD와 다르게 판단한 지점」 1).
 *
 * 홈의 목적 — 「사용자가 지금 무엇을 해야 하는지 하나를 정해서 보여준다」 (DESIGN.md §9).
 * 대시보드처럼 지표를 나열하지 않는다.
 *
 * 상황 분기 (08-31 확정) — A → B → C → D 순서로 판정, 하나만 나온다:
 *   A  오늘 배정 카드 있음            → 제작하기
 *   B  오늘 카드 없음 + 발행 요일      → 한 줄 입력창
 *   C  앞으로 배정된 카드 있음         → {상대일} + 미리 제작하기
 *   D  배정 카드 없음 (빈 상태)        → 큰 입력창 → AI 기획
 *
 * 별도 empty state를 만들지 않는다 — 빈 상황이 곧 D다.
 */
export default function RootPage() {
  // undefined = 아직 모름(Auth 초기화 중) · null = 비로그인
  const [authUser, setAuthUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => setAuthUser(user));
    return unsubscribe;
  }, []);

  if (authUser === undefined) return <FullPageLoading />;
  if (authUser === null) return <Landing />;
  return <Home uid={authUser.uid} />;
}

/* ============================================================
   랜딩 (비로그인) — 담당 밖. 진입만 막히지 않게 최소로 둔다
   ============================================================ */

function Landing() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      <div className="text-center">
        <h1 className="text-h1 font-bold text-ink">차곡</h1>
        <p className="mt-3 text-body-l text-sub">
          말하면 정리되고, 정리되면 일정이 되고,
          <br />
          일정이 하나씩 콘텐츠로 완성됩니다.
        </p>
        {/* @TODO: 랜딩 본문 — 제품 소개 · 테스트 참가자 컨텍스트 (PRD §5-1, 담당 별도) */}
      </div>
      <Link
        href="/login"
        className="flex h-12 w-full max-w-[320px] items-center justify-center rounded-md bg-berry text-[15px] font-semibold text-white transition-colors duration-200 hover:bg-berry-dark"
      >
        시작하기
      </Link>
      {/*
        사전 고지 — 「생성형 AI로 운용된다」는 사실은 **쓰기 전에** 알려야 한다
        (AI 기본법 제31조 ①, lib/ai-disclosure.ts). 그래서 가입 뒤가 아니라
        비로그인 첫 화면에 둔다.
      */}
      <p className="max-w-[320px] text-center text-caption text-sub">
        {AI_DISCLOSURE.service}
      </p>
    </main>
  );
}

/* ============================================================
   홈 (로그인)
   ============================================================ */

/** 로컬 기준 'YYYY-MM-DD' */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 이번 주 월요일~일요일. 「이번 주 예정」의 조회 범위 */
function thisWeekRange(today: Date): { start: string; end: string } {
  const day = today.getDay(); // 0=일
  const sinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - sinceMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toDateKey(monday), end: toDateKey(sunday) };
}

type HomeState =
  | { phase: "loading" }
  | { phase: "error" }
  | {
      phase: "ready";
      hasAnyCard: boolean;
      todayCard: Card | null;
      nextCard: Card | null; // 오늘 이후 가장 가까운 카드 (케이스 C)
      publishToday: boolean; // 오늘이 발행 요일인가 — user.uploadDays 기준 (케이스 B)
      weekCards: Card[];
      futureCards: Card[]; // 이번 주 이후 — ③ 접힌 나머지 요약용
    };

function Home({ uid }: { uid: string }) {
  const router = useRouter();
  const [state, setState] = useState<HomeState>({ phase: "loading" });
  // 값이 바뀔 때마다 다시 불러온다 — 「다시 시도」 버튼이 올린다
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // 온보딩 가드 — onboardedAt이 null이면 다른 화면 접근 차단 (PLAN §3)
        const userSnap = await getDoc(doc(db, "users", uid));
        if (!userSnap.exists()) {
          // user 문서 없음 → 로그아웃 처리 (PLAN §3-1 온보딩 가드)
          await signOut(auth);
          return;
        }
        if (userSnap.data().onboardedAt == null) {
          router.replace("/onboarding");
          return;
        }

        /*
         * 발행 요일 — 기존 user.uploadDays(0=월 … 6=일, 08-28 가영 추가)를 그대로 쓴다.
         * 지시서의 publishWeekdays(0=일 규약)와 같은 목적의 필드가 이미 있어 중복 생성하지
         * 않았다. 값이 없으면 임시 기본 주 2회 = [0, 3](월·목 — 지시서의 월·목과 동일).
         */
        const uploadDays: number[] = Array.isArray(userSnap.data().uploadDays)
          ? userSnap.data().uploadDays
          : [0, 3];
        const mondayFirstIndex = (new Date().getDay() + 6) % 7; // JS 0=일 → 0=월 규약으로
        const publishToday = uploadDays.includes(mondayFirstIndex);

        const todayKey = toDateKey(new Date());
        const { start, end } = thisWeekRange(new Date());
        const cardsRef = collection(db, "cards");

        // 카드가 1장이라도 있는가 — 상태 A 판정
        const anySnap = await getDocs(query(cardsRef, where("userId", "==", uid), limit(1)));

        // 이번 주 카드 — 인덱스 (userId ASC, scheduledDate ASC) 사용 (PLAN §7)
        const weekSnap = await getDocs(
          query(
            cardsRef,
            where("userId", "==", uid),
            where("scheduledDate", ">=", start),
            where("scheduledDate", "<=", end),
            orderBy("scheduledDate", "asc"),
          ),
        );
        const weekCards = weekSnap.docs
          .map((d) => ({ ...(d.data() as Omit<Card, "id">), id: d.id }))
          .filter((c) => c.status !== "discarded");

        // 오늘의 카드 (F5) — scheduledDate == today && status != 'discarded', 1건만
        const todayCard = weekCards.find((c) => c.scheduledDate === todayKey) ?? null;

        // 오늘 이후 가장 가까운 카드 — 케이스 C용. 이번 주 밖(다음 주 이후)도 잡는다
        const nextSnap = await getDocs(
          query(
            cardsRef,
            where("userId", "==", uid),
            where("scheduledDate", ">", todayKey),
            orderBy("scheduledDate", "asc"),
            limit(30),
          ),
        );
        const upcoming = nextSnap.docs
          .map((d) => ({ ...(d.data() as Omit<Card, "id">), id: d.id }))
          .filter((c) => c.status !== "discarded");
        const nextCard = upcoming[0] ?? null;
        const futureCards = upcoming.filter((c) => c.scheduledDate > end); // 이번 주 밖

        if (cancelled) return; // 화면을 떠났으면 상태를 건드리지 않는다
        setState({
          phase: "ready",
          hasAnyCard: !anySnap.empty,
          todayCard,
          nextCard,
          publishToday,
          weekCards,
          futureCards,
        });
      } catch {
        if (!cancelled) setState({ phase: "error" });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [uid, router, reloadKey]);

  return (
    <div className="flex flex-1">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 모바일 — 프로필은 상단 우측 (DESIGN.md §4) */}
        <header className="flex h-14 items-center justify-between px-4 md:hidden">
          <span className="flex items-center gap-2">
            <LogoSymbol size={20} />
            <span className="text-title font-bold text-ink">차곡</span>
          </span>
          {/* @TODO: 프로필 메뉴(설정 · 로그아웃) 팝업 — 지금은 설정으로 바로 이동 */}
          <Link
            href="/settings/content"
            aria-label="프로필"
            className="flex h-11 w-11 items-center justify-center rounded-md text-sub"
          >
            <CircleUserRound size={22} aria-hidden />
          </Link>
        </header>

        {/* 홈 최대 폭 960 (DESIGN.md §4) · 하단 탭에 가리지 않게 모바일만 여유 패딩 */}
        <main className="mx-auto w-full max-w-[960px] flex-1 px-4 py-3 pb-20 md:p-6 md:pb-8 min-[1200px]:p-8">
          {state.phase === "loading" && <HomeSkeleton />}
          {state.phase === "error" && (
            <HomeError
              onRetry={() => {
                setState({ phase: "loading" });
                setReloadKey((k) => k + 1);
              }}
            />
          )}
          {state.phase === "ready" && <HomeReady {...state} />}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}

/** 시간대별 인사 (08-31 확정 문구 — 이모지·수정 금지) */
function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 11) return "좋은 아침이에요";
  if (hour >= 11 && hour < 17) return "맛점하셨나요?";
  if (hour >= 17 && hour < 22) return "오늘 하루 고생하셨어요";
  return "늦게까지 고생 많으세요";
}

/** 상대일 표기 — 내일 / 모레 / «9월 5일에» (요일 없이) */
function relativeDayLabel(dateKey: string, todayKey: string): string {
  const diff = Math.round(
    (new Date(`${dateKey}T00:00:00`).getTime() - new Date(`${todayKey}T00:00:00`).getTime()) /
      86400000,
  );
  if (diff === 1) return "내일";
  if (diff === 2) return "모레";
  const [, m, d] = dateKey.split("-").map(Number);
  return `${m}월 ${d}일에`;
}

/**
 * 홈 본문 — 인사(시간대) + 상황 분기 (08-31 확정).
 * 케이스는 A → B → C → D 순서로 판정하고 하나만 보여준다:
 *   A 오늘 배정 카드 있음 → 제작하기
 *   B 오늘 카드는 없지만 발행 요일 → 한 줄 입력
 *   C 앞으로 배정된 카드 있음 → {상대일} + 미리 제작하기
 *   D 배정 카드 없음(빈 상태) → 큰 입력창
 */
function HomeReady({
  hasAnyCard,
  todayCard,
  nextCard,
  publishToday,
  weekCards,
  futureCards,
}: {
  hasAnyCard: boolean;
  todayCard: Card | null;
  nextCard: Card | null;
  publishToday: boolean;
  weekCards: Card[];
  futureCards: Card[];
}) {
  const now = new Date();
  const todayKey = toDateKey(now);

  const situation = todayCard
    ? ("A" as const)
    : publishToday
      ? ("B" as const)
      : nextCard
        ? ("C" as const)
        : ("D" as const);

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <PageHeader />
      {/* 인사 한 줄 + 오늘 날짜 — 이모지 없음 (08-31) */}
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-h2 font-bold text-ink">{greetingForHour(now.getHours())}</h1>
        <span className="text-body text-sub">{formatMonthDayWeekday(now)}</span>
      </header>

      {situation === "A" && todayCard && (
        <section>
          <p className="text-body-l text-ink">오늘 올릴 콘텐츠에요! 바로 제작해볼까요?</p>
          <div className="mt-3 md:mt-4">
            <FeaturedContentCard
              card={todayCard}
              ctaLabel="제작하기"
              ctaHref={`/card/${todayCard.id}/result`}
            />
          </div>
        </section>
      )}

      {situation === "B" && (
        <section>
          <p className="text-body-l text-ink">
            오늘 발행일이에요! 오늘은 어떤 콘텐츠를 올리고 싶으세요?
          </p>
          <div className="mt-4">
            <OneLineIdeaInput />
          </div>
        </section>
      )}

      {situation === "C" && nextCard && (
        <section>
          <p className="text-body-l text-ink">
            {relativeDayLabel(nextCard.scheduledDate, todayKey)} 올릴 콘텐츠에요!
          </p>
          <div className="mt-3 md:mt-4">
            <FeaturedContentCard
              card={nextCard}
              ctaLabel="미리 제작하기"
              ctaHref={`/card/${nextCard.id}/result`}
            />
          </div>
        </section>
      )}

      {situation === "D" && (
        <section>
          <p className="text-body-l text-ink">요즘 올리고 싶은 거 있으세요? 여러 개여도 좋아요</p>
          <div className="mt-4">
            <IdeaInput />
          </div>

          {!hasAnyCard && (
            /* 첫 방문 — 어떻게 흘러가는지 조용히 보여준다 (팝업 투어 대신, DESIGN §1 Calm) */
            <ol className="mt-10 flex flex-col gap-2 text-body text-sub md:flex-row md:gap-8">
              {["말하면 정리되고", "정리되면 일정이 되고", "하나씩 콘텐츠로 완성돼요"].map(
                (step, i) => (
                  <li key={step} className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-pill bg-berry-light text-caption font-semibold text-berry-dark">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ),
              )}
            </ol>
          )}
        </section>
      )}

      <WeekSection weekCards={weekCards} />
      <CollapsedFuture cards={futureCards} />
    </div>
  );
}

/* ============================================================
   케이스 B — 한 줄 입력창 (담기)
   ============================================================ */

function OneLineIdeaInput() {
  const router = useRouter();
  const [idea, setIdea] = useState("");

  function submit() {
    const trimmed = idea.trim();
    router.push(trimmed ? `/plan/new?idea=${encodeURIComponent(trimmed)}` : "/plan/new");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2"
    >
      <label htmlFor="one-line-idea" className="sr-only">
        올리고 싶은 콘텐츠
      </label>
      <input
        id="one-line-idea"
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="떠오른 생각을 그대로 적어주세요"
        className="h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-4 text-body text-ink placeholder:text-sub/60"
      />
      <button
        type="submit"
        aria-label="담기"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-berry text-white transition-colors duration-200 hover:bg-berry-dark"
      >
        <ArrowUp size={18} aria-hidden />
      </button>
    </form>
  );
}

/** 'YYYY-MM-DD' → '9/1 (월)' — 날짜 열 압축 표기 (2차 예시 형식) */
function shortDateLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-").map(Number);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][
    new Date(`${dateKey}T00:00:00`).getDay()
  ];
  return `${m}/${d} (${weekday})`;
}

/** 날짜 기준으로 묶는다 — 같은 날짜의 카드는 날짜를 한 번만 적기 위해 */
function groupByDate(cards: Card[]): { dateKey: string; cards: Card[] }[] {
  const groups: { dateKey: string; cards: Card[] }[] = [];
  for (const card of cards) {
    const last = groups[groups.length - 1];
    if (last && last.dateKey === card.scheduledDate) last.cards.push(card);
    else groups.push({ dateKey: card.scheduledDate, cards: [card] });
  }
  return groups;
}

/**
 * 카드 한 행 — 제목 한 줄만 (08-31 확정). 부제 줄 없음, 넘치면 말줄임.
 * 옛 데이터의 «— …» 꼬리는 표시에서 잘라낸다 (새 카드는 생성 단계에서 안 붙는다)
 */
function CardRow({ card }: { card: Card }) {
  const title = card.title.split(" — ")[0];
  return (
    <Link href={`/card/${card.id}`} className="block min-w-0 py-0.5">
      <span className="block truncate text-body text-ink">{title}</span>
    </Link>
  );
}

/** 날짜 열(고정 폭) + 카드 열(남는 폭) — 날짜는 그룹 첫 행에만 */
function DateGroupedList({ cards, todayKey }: { cards: Card[]; todayKey: string }) {
  return (
    <div className="flex flex-col gap-2">
      {groupByDate(cards).map((group) => (
        <div key={group.dateKey} className="flex gap-3">
          <span
            className={[
              "w-16 shrink-0 pt-1 text-caption",
              group.dateKey === todayKey ? "font-semibold text-berry-dark" : "text-sub",
            ].join(" ")}
          >
            {shortDateLabel(group.dateKey)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {group.cards.map((card) => (
              <CardRow key={card.id} card={card} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 이번 주 예정 — 가장 이른 4건까지만, 나머지는 렌더링하지 않는다 (08-31 2차).
 * 화면에 표시하는 숫자는 「이번 주엔 N개 남아있어요」 하나뿐이다.
 */
const mediaSubscribe = (cb: () => void) => {
  const mq = window.matchMedia("(max-width: 767px) and (max-height: 900px)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

function WeekSection({ weekCards }: { weekCards: Card[] }) {
  // 한 화면 규칙(08-31 2차) — 높이가 모자라는 모바일에서는 4건 → 3건으로 줄인다.
  // 폰트를 깎아 맞추지 않는다
  const compact = useSyncExternalStore(
    mediaSubscribe,
    () => window.matchMedia("(max-width: 767px) and (max-height: 900px)").matches,
    () => false,
  );
  if (weekCards.length === 0) return null;

  const todayKey = toDateKey(new Date());
  const remaining = weekCards.filter((c) => c.status !== "published").length;
  const visible = weekCards.slice(0, compact ? 3 : 4);

  return (
    <section className="border-y border-line py-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-title font-bold text-ink">이번 주 예정</h2>
        {/* 배정 카드 전체 목록은 캘린더가 담당 — 새 페이지를 만들지 않는다 */}
        <Link
          href="/calendar"
          className="text-caption font-semibold text-berry transition-colors duration-200 hover:text-berry-dark"
        >
          전체보기
        </Link>
      </div>
      <p className="mt-0.5 text-caption text-sub">이번 주엔 {remaining}개 남아있어요</p>

      <div className="mt-2">
        <DateGroupedList cards={visible} todayKey={todayKey} />
      </div>
    </section>
  );
}

/**
 * ③ 접힌 나머지 — 이번 주 밖 카드를 한 줄 요약 + 펼치기로만 (08-31 2차).
 * 예: «9월에 쓸 거 2개 있어요»
 */
function CollapsedFuture({ cards }: { cards: Card[] }) {
  const [open, setOpen] = useState(false);
  if (cards.length === 0) return null;

  const firstMonth = Number(cards[0].scheduledDate.split("-")[1]);
  const countInMonth = cards.filter(
    (c) => Number(c.scheduledDate.split("-")[1]) === firstMonth,
  ).length;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 text-body text-sub transition-colors duration-200 hover:text-ink"
      >
        <ChevronRight
          size={16}
          aria-hidden
          className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
        {firstMonth}월에 쓸 거 {countInMonth}개 있어요
      </button>
      {open && (
        <div className="mt-2">
          <DateGroupedList cards={cards} todayKey="" />
        </div>
      )}
    </section>
  );
}

/* ============================================================
   아이디어 입력 — 제출하면 새 기획 대화로 넘어간다
   ============================================================ */

function IdeaInput() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const trimmed = idea.trim();
    // @TODO: /plan/new 구현 시 ?idea= 쿼리를 읽어 대화의 첫 메시지로 넣는다
    router.push(trimmed ? `/plan/new?idea=${encodeURIComponent(trimmed)}` : "/plan/new");
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-end gap-2 rounded-lg border border-line bg-surface p-3 focus-within:border-berry"
    >
      <label htmlFor="idea" className="sr-only">
        아이디어 말하기
      </label>
      {/* 긴 아이디어 입력은 textarea — 최소 3줄, 자동 확장 (DESIGN.md §6 Form) */}
      <textarea
        id="idea"
        ref={textareaRef}
        rows={3}
        value={idea}
        onChange={(e) => {
          setIdea(e.target.value);
          const el = textareaRef.current;
          if (el) {
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }
        }}
        placeholder="예: 요즘 아침 루틴에 대해 이야기해보고 싶어요"
        className="max-h-40 min-w-0 flex-1 resize-none bg-transparent text-body text-ink outline-none placeholder:text-sub/60 focus-visible:outline-none"
      />
      <button
        type="submit"
        aria-label="전송"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-berry text-white transition-colors duration-200 hover:bg-berry-dark"
      >
        <ArrowUp size={18} aria-hidden />
      </button>
    </form>
  );
}

/* ============================================================
   로딩 · 에러
   ============================================================ */

function FullPageLoading() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <p className="text-body text-sub">불러오는 중...</p>
    </main>
  );
}

/** 화면을 막지 않는 skeleton (DESIGN.md §10) — spinner·가짜 진행률 금지(§0) */
function HomeSkeleton() {
  return (
    <div aria-hidden className="flex animate-pulse flex-col gap-4 pt-2">
      <div className="h-7 w-56 rounded-sm bg-surface-muted" />
      <div className="h-5 w-72 rounded-sm bg-surface-muted" />
      <div className="mt-2 h-44 rounded-lg bg-surface-muted" />
    </div>
  );
}

/** 에러는 인라인 · 빨간색 경고 금지 — 글자는 --ink (DESIGN.md §2 하단) */
function HomeError({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-body-l text-ink">화면을 불러오지 못했어요.</p>
      <p className="mt-1 text-body text-sub">잠시 후 다시 시도해주세요.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 flex h-11 items-center justify-center rounded-md border-2 border-berry bg-surface px-6 text-body font-semibold text-berry transition-colors duration-200 hover:bg-berry-tint"
      >
        다시 시도
      </button>
    </section>
  );
}
