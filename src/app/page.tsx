"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Landing from "@/components/Landing";
import { useRouter } from "next/navigation";
import { LogoSymbol } from "@/components/Logo";
import { onAuthStateChanged, signOut, type User as AuthUser } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { ArrowUp, ChevronRight, CircleUserRound } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import FeaturedContentCard from "@/components/FeaturedContentCard";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { formatMonthDayWeekday } from "@/lib/format";
import { greetingFor, kstToday } from "@/lib/greetings";
import { isConsentCurrent } from "@/lib/legal/consent-client";
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
   홈 (로그인)
   ============================================================ */

/** 로컬 기준 'YYYY-MM-DD' */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 발행 요일(0=월 … 6=일) 기준으로 오늘 «이후» 발행일을 차례로 뽑는다.
 * 이미 카드가 있는 날짜(taken)는 건너뛰고, 뽑은 날짜는 taken에 더해
 * 다음 호출·다음 장과 겹치지 않게 한다. 자동 이월(D)과 [날짜 정해주기](C)가 같이 쓴다.
 */
function nextPublishDates(
  uploadDays: number[],
  todayKey: string,
  count: number,
  taken: Set<string>,
): string[] {
  const days = uploadDays.length > 0 ? uploadDays : [0, 3];
  const out: string[] = [];
  const cursor = new Date(`${todayKey}T00:00:00`);
  // 상한 10년 — 발행 요일이 비어 있어도 무한 루프가 되지 않게
  for (let i = 0; out.length < count && i < 3660; i++) {
    cursor.setDate(cursor.getDate() + 1);
    const mondayFirst = (cursor.getDay() + 6) % 7; // JS 0=일 → 0=월 규약
    const key = toDateKey(cursor);
    if (days.includes(mondayFirst) && !taken.has(key)) {
      out.push(key);
      taken.add(key);
    }
  }
  return out;
}

/** C(날짜 없음) 카드들에 발행 주기대로 날짜를 배분해 저장한다 — 한 장씩 차례로 */
async function assignDatesToCards(cards: Card[], uploadDays: number[], takenDates: string[]) {
  const taken = new Set(takenDates);
  const targets = nextPublishDates(uploadDays, toDateKey(new Date()), cards.length, taken);
  // Firestore 배치 상한(500) 아래로 끊어서 커밋한다
  for (let i = 0; i < cards.length; i += 450) {
    const batch = writeBatch(db);
    cards.slice(i, i + 450).forEach((c, j) => {
      batch.update(doc(db, "cards", c.id), { scheduledDate: targets[i + j] });
    });
    await batch.commit();
  }
}

/** 이번 주 월요일~일요일. 「이번 주 콘텐츠」의 범위 */
function thisWeekRange(today: Date): { start: string; end: string } {
  const day = today.getDay(); // 0=일
  const sinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - sinceMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toDateKey(monday), end: toDateKey(sunday) };
}

/** 날짜가 붙은 카드 — 목록·정렬에서 scheduledDate를 안심하고 쓰기 위한 좁힘 */
type DatedCard = Card & { scheduledDate: string };

/*
 * 카드 네 갈래 (09-01) — 날짜 유무·시점으로 나눠 홈에서 자리를 달리 준다:
 *   A  이번 주 (월~일)      → 중앙 펼침 「이번 주 콘텐츠」
 *   B  다음 주 이후          → 하단 접힘 «9월에 올릴 콘텐츠 2개»
 *   C  날짜 없음             → 하단 접힘 «언젠가 올릴 콘텐츠 25개» + [날짜 정해주기]
 *   D  과거인데 아직 안 올림  → 진입 시 다음 발행일로 자동 이월 (경고 없이 조용히)
 */
type HomeState =
  | { phase: "loading" }
  | { phase: "error" }
  | {
      phase: "ready";
      hasAnyCard: boolean;
      todayCard: DatedCard | null;
      nextCard: DatedCard | null; // 오늘 이후 가장 가까운 카드 (케이스 C)
      publishToday: boolean; // 오늘이 발행 요일인가 — user.uploadDays 기준 (케이스 B)
      weekCards: DatedCard[]; // A
      futureCards: DatedCard[]; // B
      somedayCards: Card[]; // C — 만든 순서(오래된 것부터)
      movedCount: number; // D — 이번 진입에 자동 이월된 장수 (조용한 한 줄용)
      uploadDays: number[]; // 발행 요일 (0=월)
      takenDates: string[]; // 오늘 이후 이미 카드가 있는 날짜 — 배분 시 건너뛴다
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
        // 약관 동의 가드 (09-01 §5) — 기록이 없거나 저장된 버전이 현행과 다르면 (재)동의로
        if (!isConsentCurrent(userSnap.data().latestConsent)) {
          router.replace("/consent");
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

        /*
         * 카드 전체를 한 번에 받아 네 갈래로 나눈다 (09-01) —
         * 날짜 없는 카드(C)는 Firestore 범위 쿼리에 아예 안 걸려서 쿼리로는 못 가른다.
         */
        const allSnap = await getDocs(query(cardsRef, where("userId", "==", uid)));
        const all = allSnap.docs
          .map((d) => ({ ...(d.data() as Omit<Card, "id">), id: d.id }))
          .filter((c) => c.status !== "discarded");

        // 오늘 이후 이미 카드가 있는 날짜 — 이월·배분이 같은 날에 겹치지 않게 건너뛴다
        const taken = new Set(
          all
            .filter((c): c is DatedCard => Boolean(c.scheduledDate))
            .filter((c) => c.scheduledDate >= todayKey)
            .map((c) => c.scheduledDate),
        );

        // D — 날짜가 오늘보다 앞인데 아직 안 올린 카드: 다음 발행일로 조용히 옮긴다.
        // 발행일마다 한 장씩, 원래 날짜가 이른 것부터 차례로
        const overdue = all
          .filter(
            (c): c is DatedCard =>
              Boolean(c.scheduledDate) &&
              (c.scheduledDate as string) < todayKey &&
              c.status !== "published",
          )
          .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
        let movedCount = 0;
        if (overdue.length > 0) {
          const targets = nextPublishDates(uploadDays, todayKey, overdue.length, taken);
          await Promise.all(
            overdue.map((c, i) =>
              updateDoc(doc(db, "cards", c.id), { scheduledDate: targets[i] })
                .then(() => {
                  c.scheduledDate = targets[i];
                  movedCount += 1;
                })
                // 실패한 카드는 이번엔 그대로 둔다 — 다음 진입에 다시 시도된다
                .catch(() => {}),
            ),
          );
        }

        const dated = all
          .filter((c): c is DatedCard => Boolean(c.scheduledDate))
          .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
        const weekCards = dated.filter((c) => c.scheduledDate >= start && c.scheduledDate <= end); // A
        const futureCards = dated.filter((c) => c.scheduledDate > end); // B
        const somedayCards = all
          .filter((c) => !c.scheduledDate) // C
          .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));

        // 오늘의 카드 (F5) — 아직 안 올린 것만
        const todayCard =
          weekCards.find((c) => c.scheduledDate === todayKey && c.status !== "published") ?? null;
        // 오늘 이후 가장 가까운 카드 — 케이스 C용. 이번 주 밖(다음 주 이후)도 잡는다
        const nextCard =
          dated.find((c) => c.scheduledDate > todayKey && c.status !== "published") ?? null;

        if (cancelled) return; // 화면을 떠났으면 상태를 건드리지 않는다
        setState({
          phase: "ready",
          hasAnyCard: allSnap.docs.length > 0,
          todayCard,
          nextCard,
          publishToday,
          weekCards,
          futureCards,
          somedayCards,
          movedCount,
          uploadDays,
          takenDates: [...taken],
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
          {state.phase === "ready" && (
            <HomeReady {...state} onReload={() => setReloadKey((k) => k + 1)} />
          )}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
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
  somedayCards,
  movedCount,
  uploadDays,
  takenDates,
  onReload,
}: {
  hasAnyCard: boolean;
  todayCard: DatedCard | null;
  nextCard: DatedCard | null;
  publishToday: boolean;
  weekCards: DatedCard[];
  futureCards: DatedCard[];
  somedayCards: Card[];
  movedCount: number;
  uploadDays: number[];
  takenDates: string[];
  onReload: () => void;
}) {
  const now = new Date();
  const todayKey = toDateKey(now);

  // E — 이번 주(A)가 비었고 날짜 없는 카드(C)만 있으면, C가 그날의 주 행동이 된다 (§6)
  const situation = todayCard
    ? ("A" as const)
    : publishToday
      ? ("B" as const)
      : nextCard
        ? ("C" as const)
        : somedayCards.length > 0
          ? ("E" as const)
          : ("D" as const);

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <PageHeader />
      {/* 인사 한 줄 + 오늘 날짜 — 이모지 없음, KST 고정 9구간 (09-01, lib/greetings.ts) */}
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-h2 font-bold text-ink">{greetingFor(now)}</h1>
        <span className="text-body text-sub">{formatMonthDayWeekday(kstToday(now))}</span>
      </header>

      {/* 자동 이월 알림 — 조용한 한 줄. 경고색·느낌표·뱃지 없음 (§3) */}
      {movedCount > 0 && (
        <p role="status" className="-mt-2 text-caption text-sub md:-mt-4">
          카드 {movedCount}장을 다음 발행일로 옮겨뒀어요
        </p>
      )}

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

      {situation === "E" && (
        /* 날짜 없는 카드가 그날의 주 행동 (§6) — 하단 C 줄은 이때 중앙으로 올라와 숨긴다 */
        <section>
          <p className="text-body-l text-ink">
            언젠가 올릴 콘텐츠가 {somedayCards.length}개 있어요. 날짜를 정해볼까요?
          </p>
          <div className="mt-4">
            <AssignDatesControl
              cards={somedayCards}
              uploadDays={uploadDays}
              takenDates={takenDates}
              onDone={onReload}
              primary
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
      {situation !== "E" && (
        <CollapsedSomeday
          cards={somedayCards}
          uploadDays={uploadDays}
          takenDates={takenDates}
          onReload={onReload}
        />
      )}
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
function groupByDate(cards: DatedCard[]): { dateKey: string; cards: DatedCard[] }[] {
  const groups: { dateKey: string; cards: DatedCard[] }[] = [];
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
function DateGroupedList({ cards, todayKey }: { cards: DatedCard[]; todayKey: string }) {
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
 * A — 이번 주 콘텐츠 (09-01 개편). 이번 주 날짜가 붙은, 아직 안 올린 카드만.
 * 부제 숫자 = 아래 목록에 실제로 보이는 카드 수 — 날짜 없는 카드는 절대 섞지 않는다.
 */
function WeekSection({ weekCards }: { weekCards: DatedCard[] }) {
  const todayKey = toDateKey(new Date());
  // 「올릴」 목록 — 이미 올린 카드는 접는다. 이미 만들어둔 카드(올리기만 남음)는 들어온다
  const remaining = weekCards.filter((c) => c.status !== "published");
  if (remaining.length === 0) return null;

  return (
    <section className="border-y border-line py-2.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-title font-bold text-ink">이번 주 콘텐츠</h2>
        {/* 배정 카드 전체 목록은 캘린더가 담당 — 새 페이지를 만들지 않는다 */}
        <Link
          href="/calendar"
          className="text-caption font-semibold text-berry transition-colors duration-200 hover:text-berry-dark"
        >
          전체보기
        </Link>
      </div>
      <p className="mt-0.5 text-caption text-sub">{remaining.length}개 남아있어요</p>

      <div className="mt-2">
        <DateGroupedList cards={remaining} todayKey={todayKey} />
      </div>
    </section>
  );
}

/**
 * B — 다음 주 이후 카드. 접힌 한 줄 «9월에 올릴 콘텐츠 2개», 펼치면 목록 (09-01).
 */
function CollapsedFuture({ cards }: { cards: DatedCard[] }) {
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
        {firstMonth}월에 올릴 콘텐츠 {countInMonth}개
      </button>
      {open && (
        <div className="mt-2">
          <DateGroupedList cards={cards} todayKey="" />
        </div>
      )}
    </section>
  );
}

/**
 * C — 날짜 없는 카드. 접힌 한 줄 «언젠가 올릴 콘텐츠 25개» + [날짜 정해주기] (09-01).
 * 50개를 넘으면 숫자를 표시하지 않는다.
 */
function CollapsedSomeday({
  cards,
  uploadDays,
  takenDates,
  onReload,
}: {
  cards: Card[];
  uploadDays: number[];
  takenDates: string[];
  onReload: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (cards.length === 0) return null;

  const label =
    cards.length > 50 ? "언젠가 올릴 콘텐츠" : `언젠가 올릴 콘텐츠 ${cards.length}개`;

  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-1 text-body text-sub transition-colors duration-200 hover:text-ink"
        >
          <ChevronRight
            size={16}
            aria-hidden
            className={`shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          />
          <span className="truncate">{label}</span>
        </button>
        <AssignDatesControl
          cards={cards}
          uploadDays={uploadDays}
          takenDates={takenDates}
          onDone={onReload}
        />
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-0.5 pl-5">
          {cards.map((card) => (
            <CardRow key={card.id} card={card} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * [날짜 정해주기] — 누르면 먼저 확인 문구를 보여주고, 확정해야 배분한다 (§5).
 * primary면 §6 중앙용 큰 버튼, 아니면 접힌 줄 오른쪽의 작은 텍스트 버튼.
 */
function AssignDatesControl({
  cards,
  uploadDays,
  takenDates,
  onDone,
  primary,
}: {
  cards: Card[];
  uploadDays: number[];
  takenDates: string[];
  onDone: () => void;
  primary?: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const perWeek = (uploadDays.length > 0 ? uploadDays : [0, 3]).length;
  const weeks = Math.ceil(cards.length / perWeek);

  async function run() {
    setSaving(true);
    setFailed(false);
    try {
      await assignDatesToCards(cards, uploadDays, takenDates);
      onDone(); // 카드들이 B로, 이번 주에 걸린 것은 A로 — 다시 불러와 반영한다
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  if (!confirmOpen) {
    return (
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className={
          primary
            ? "flex h-11 items-center justify-center rounded-md bg-berry px-6 text-body font-semibold text-white transition-colors duration-200 hover:bg-berry-dark"
            : "shrink-0 text-caption font-semibold text-berry transition-colors duration-200 hover:text-berry-dark"
        }
      >
        날짜 정해주기
      </button>
    );
  }

  return (
    <div
      className={[
        "rounded-md border border-line bg-surface px-4 py-3",
        primary ? "" : "max-w-[360px]",
      ].join(" ")}
    >
      <p className="text-body text-ink">
        {cards.length}개를 주 {perWeek}회로 올리면 {weeks}주 걸려요. 이대로 정할까요?
      </p>
      {/* 에러도 조용히 — 빨간색·느낌표 금지 (§3) */}
      {failed && (
        <p className="mt-1 text-caption text-ink">날짜를 정하지 못했어요 — 한 번 더 눌러주세요.</p>
      )}
      <div className="mt-2.5 flex items-center gap-3">
        {saving ? (
          <p className="text-body text-sub">날짜를 정하고 있어요...</p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void run()}
              className="flex h-10 items-center justify-center rounded-md bg-berry px-4 text-body font-semibold text-white transition-colors duration-200 hover:bg-berry-dark"
            >
              이대로 정하기
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="px-1 text-body text-sub transition-colors duration-200 hover:text-ink"
            >
              취소
            </button>
          </>
        )}
      </div>
    </div>
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
