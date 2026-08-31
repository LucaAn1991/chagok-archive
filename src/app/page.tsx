"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { ArrowUp, CircleUserRound } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import FeaturedContentCard from "@/components/FeaturedContentCard";
import StatusBadge from "@/components/StatusBadge";
import { formatMonthDayWeekday } from "@/lib/format";
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
            limit(5),
          ),
        );
        const nextCard =
          nextSnap.docs
            .map((d) => ({ ...(d.data() as Omit<Card, "id">), id: d.id }))
            .find((c) => c.status !== "discarded") ?? null;

        if (cancelled) return; // 화면을 떠났으면 상태를 건드리지 않는다
        setState({
          phase: "ready",
          hasAnyCard: !anySnap.empty,
          todayCard,
          nextCard,
          publishToday,
          weekCards,
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
            <span aria-hidden className="h-5 w-5 rounded-sm" style={{ background: "var(--grad)" }} />
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
        <main className="mx-auto w-full max-w-[960px] flex-1 p-4 pb-24 md:p-6 md:pb-8 min-[1200px]:p-8">
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
}: {
  hasAnyCard: boolean;
  todayCard: Card | null;
  nextCard: Card | null;
  publishToday: boolean;
  weekCards: Card[];
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
    <div className="flex flex-col gap-8">
      {/* 인사 한 줄 + 오늘 날짜 — 이모지 없음 (08-31) */}
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-h2 font-bold text-ink">{greetingForHour(now.getHours())}</h1>
        <span className="text-body text-sub">{formatMonthDayWeekday(now)}</span>
      </header>

      {situation === "A" && todayCard && (
        <section>
          <p className="text-body-l text-ink">오늘 올릴 콘텐츠에요! 바로 제작해볼까요?</p>
          <div className="mt-4">
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
          <div className="mt-4">
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

/* ============================================================
   이번 주 예정 — 상태 B의 보조 영역 (DESIGN.md §9)
   ============================================================ */

function WeekSection({ weekCards }: { weekCards: Card[] }) {
  if (weekCards.length === 0) return null; // 빈 상황은 Hero(A·C)가 이미 말하고 있다

  const todayKey = toDateKey(new Date());

  return (
    <section>
      <h2 className="text-title font-bold text-ink">이번 주 예정</h2>
      <ul className="mt-3 flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
        {weekCards.map((card) => {
          const [, m, d] = card.scheduledDate.split("-").map(Number);
          const weekday = ["일", "월", "화", "수", "목", "금", "토"][
            new Date(card.scheduledDate + "T00:00:00").getDay()
          ];
          const isToday = card.scheduledDate === todayKey;
          return (
            <li key={card.id} className="border-b border-line last:border-b-0">
              <Link
                href={`/card/${card.id}`}
                className="flex min-h-14 items-center gap-4 px-4 py-3 transition-colors duration-200 hover:bg-surface-muted"
              >
                <span
                  className={[
                    "w-14 shrink-0 text-caption",
                    isToday ? "font-semibold text-berry" : "text-sub",
                  ].join(" ")}
                >
                  {isToday ? "오늘" : `${m}.${d} (${weekday})`}
                </span>
                <span className="min-w-0 flex-1 truncate text-body text-ink">
                  {card.shortTitle || card.title}
                </span>
                <StatusBadge status={card.status} />
              </Link>
            </li>
          );
        })}
      </ul>
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
