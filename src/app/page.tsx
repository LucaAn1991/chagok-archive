"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Landing from "@/components/Landing";
import { useRouter } from "next/navigation";
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
import { ArrowUp, ChevronRight } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import AppTopNav from "@/components/AppTopNav";
import NoticeBanner from "@/components/NoticeBanner";
import MobileBottomNav from "@/components/MobileBottomNav";
import FeaturedContentCard from "@/components/FeaturedContentCard";
import TodayCardRail from "@/components/TodayCardRail";
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

/** 로컬 기준 'YYYY-MM-DD' — KST로 맞춘 Date(`kstToday()`)를 넘겨서 쓴다 */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * KST 기준 «오늘»의 'YYYY-MM-DD'. 홈의 날짜 판정은 전부 이걸 쓴다 (09-08).
 *
 * 예전엔 기기 시간대를 그대로 썼다 — 헤더는 `kstToday()`로 KST 날짜를 찍는데
 * 카드 판정만 로컬이라, 시간대가 다른 기기에서 열면 둘이 하루씩 어긋났다.
 * 어긋나면 오늘 카드가 「날짜 지난 카드」(D)로 잘못 잡히고, D는 경고 없이
 * `scheduledDate`를 다음 발행일로 덮어쓴다 — 남의 일정이 조용히 밀린다.
 * 한국 사용자 전용 서비스라 기준을 KST 하나로 못박는다.
 */
function kstTodayKey(now: Date = new Date()): string {
  return toDateKey(kstToday(now));
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
  const targets = nextPublishDates(uploadDays, kstTodayKey(), cards.length, taken);
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
 *   A  이번 주 (월~일)      → 「앞으로 올릴 콘텐츠」의 첫 탭 (기본)
 *   B  다음 주 이후          → 같은 섹션의 «N월에 올릴 콘텐츠» 탭 (09-04에 합침)
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
      /** 오늘 올릴 카드 **전부** (09-03). 여러 장이면 가로 카드 줄로 보여준다 */
      todayCards: DatedCard[];
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
        // 요일·주 범위·오늘 모두 KST 기준 하나로 맞춘다 (09-08, kstTodayKey 주석)
        const kstNow = kstToday();
        const mondayFirstIndex = (kstNow.getDay() + 6) % 7; // JS 0=일 → 0=월 규약으로
        const publishToday = uploadDays.includes(mondayFirstIndex);

        const todayKey = toDateKey(kstNow);
        const { start, end } = thisWeekRange(kstNow);
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
        const todayCards = weekCards.filter(
          (c) => c.scheduledDate === todayKey && c.status !== "published",
        );
        const todayCard = todayCards[0] ?? null;
        // 오늘 이후 가장 가까운 카드 — 케이스 C용. 이번 주 밖(다음 주 이후)도 잡는다
        const nextCard =
          dated.find((c) => c.scheduledDate > todayKey && c.status !== "published") ?? null;

        if (cancelled) return; // 화면을 떠났으면 상태를 건드리지 않는다
        setState({
          phase: "ready",
          hasAnyCard: allSnap.docs.length > 0,
          todayCard,
          todayCards,
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
    <div className="flex flex-1 flex-col">
      <AppTopNav />
      <NoticeBanner />

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          09-04 — 모바일 전용 로고·프로필 줄이 여기 있었다. 상단 바(`AppTopNav`)가
          모든 폭에서 같은 것을 그리게 되면서 두 줄이 겹쳐 지웠다.
        */}
        {/* 홈 최대 폭 960 (DESIGN.md §4) · 하단 탭에 가리지 않게 모바일만 여유 패딩 */}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[960px] flex-1 px-4 py-3 pb-20 md:p-6 md:pb-8 min-[1200px]:p-8">
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

/**
 * 오늘 카드가 여러 장일 때, 첫 장 아래 가로 줄에 곁들이는 최대 장수 (DESIGN §9).
 * 첫 장까지 합쳐 5장. 넘치는 것은 아래 「이번 주 콘텐츠」 목록이 받는다.
 */
const TODAY_RAIL_MAX = 4;

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
  todayCards,
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
  todayCards: DatedCard[];
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
  // now는 «지금 몇 시»가 필요한 인사말용이라 진짜 현재 시각 그대로 둔다.
  // 날짜 판정만 KST로 맞춘다 — kstToday()를 greetingFor에 넘기면 시각이 0시로 뭉개진다.
  const now = new Date();
  const todayKey = kstTodayKey(now);

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
      {/*
        홈은 최상위 화면이라 뒤로가기도 화면 제목도 없다 (09-04).

        **09-08 — `<PageHeader isRoot />`를 지웠다.** `isRoot`면 화살표가 없고
        `title`·`action`도 안 넘기니 `PageHeader`는 `return null`이었다 —
        아무것도 그리지 않는 컴포넌트를 마운트만 하고 있었다.
        `isRoot`는 다른 화면에서 계속 쓰이므로 `PageHeader` 쪽은 그대로 둔다.
      */}
      {/*
        인사 한 줄 + 오늘 날짜 — 이모지 없음, KST 고정 9구간 (09-01, lib/greetings.ts)

        **09-03 — 인사를 줄였다.** 인사가 24px 굵게로 화면에서 제일 컸고, 정작
        «지금 뭘 해야 하나»를 말하는 줄이 그 아래 본문 크기였다. 홈의 목적은
        「지금 무엇을 해야 하는지 하나를 정해서 보여준다」인데(DESIGN §9)
        인사는 그 하나가 아니다. 한 줄 메타로 내리고 자리를 아래에 넘긴다.
      */}
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-body font-semibold text-sub">{greetingFor(now)}</p>
        <span className="text-caption text-sub">{formatMonthDayWeekday(kstToday(now))}</span>
      </header>

      {/* 자동 이월 알림 — 조용한 한 줄. 경고색·느낌표·뱃지 없음 (§3) */}
      {movedCount > 0 && (
        <p role="status" className="-mt-2 text-caption text-sub md:-mt-4">
          카드 {movedCount}장을 다음 발행일로 옮겨뒀어요
        </p>
      )}

      {situation === "A" && todayCard && (
        <section>
          <h1 className="break-keep text-h2 font-bold leading-snug text-ink">
            {/*
              여러 장이면 개수를 말한다 (09-03). 「콘텐츠에요!」만 있으면 큰 카드가
              하나뿐이라 «오늘 할 일이 하나»로 읽힌다 — 실제로 그렇게 읽혔다.
            */}
            {todayCards.length > 1
              ? `오늘 올릴 콘텐츠가 ${todayCards.length}개 있어요!`
              : "오늘 올릴 콘텐츠에요! 바로 제작해볼까요?"}
          </h1>
          {/*
            **개수는 문장이 말하고, 무게는 첫 장이 가진다** (09-08, DESIGN §9 개정).

            09-03엔 여러 장이면 가로 줄에 «동등한 카드»를 늘어놓았다. 오늘 7장이면
            같은 크기·같은 색의 [제작하기]가 7개 서서, §0의 「주 버튼과 보조 버튼을
            같은 크기로 두지 않는다」·§6의 「한 화면에 primary는 1개」·§9의
            「하나를 정해서 보여준다」에 한꺼번에 걸렸다.

            09-03이 실제로 고친 것은 **헤드라인**이었다(개수를 말해준다). 그 문장은
            그대로 두고 무게만 나눈다 — 첫 장은 Featured + primary, 나머지는 곁들임.
          */}
          <div className="mt-3 flex flex-col gap-3 md:mt-4">
            <FeaturedContentCard card={todayCard} ctaHref={`/card/${todayCard.id}/result`} />
            {/* 곁들임은 최대 4장 — 첫 장까지 5장. 넘치는 것은 아래 목록이 받는다 */}
            {todayCards.length > 1 && (
              <TodayCardRail cards={todayCards.slice(1, 1 + TODAY_RAIL_MAX)} />
            )}
          </div>
        </section>
      )}

      {situation === "B" && (
        <section>
          <h1 className="break-keep text-h2 font-bold leading-snug text-ink">
            오늘 발행일이에요! 오늘은 어떤 콘텐츠를 올리고 싶으세요?
          </h1>
          <div className="mt-4">
            <OneLineIdeaInput />
          </div>
        </section>
      )}

      {situation === "C" && nextCard && (
        <section>
          <h1 className="break-keep text-h2 font-bold leading-snug text-ink">
            {relativeDayLabel(nextCard.scheduledDate, todayKey)} 올릴 콘텐츠에요!
          </h1>
          <div className="mt-3 md:mt-4">
            <FeaturedContentCard ahead card={nextCard} ctaHref={`/card/${nextCard.id}/result`} />
          </div>
        </section>
      )}

      {situation === "E" && (
        /* 날짜 없는 카드가 그날의 주 행동 (§6) — 하단 C 줄은 이때 중앙으로 올라와 숨긴다 */
        <section>
          <h1 className="break-keep text-h2 font-bold leading-snug text-ink">
            언젠가 올릴 콘텐츠가 {somedayCards.length}개 있어요. 날짜를 정해볼까요?
          </h1>
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
          <h1 className="break-keep text-h2 font-bold leading-snug text-ink">요즘 올리고 싶은 거 있으세요? 여러 개여도 좋아요</h1>
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

      {/*
        맨 위 큰 카드는 목록에서 뺀다 (09-03).
        같은 카드가 위아래로 두 번 나와서, 오늘 3장인데 «하나만 보인다»고 읽혔다.
        헤드라인이 이미 그 카드를 말하고 있으므로 목록에서 또 셀 이유가 없다.
      */}
      <UpcomingSection
        weekCards={weekCards}
        futureCards={futureCards}
        excludeIds={
          /* 위에 실제로 보여준 것만 뺀다 — 상한(5장)을 넘긴 카드는 이 목록이 받는다 */
          situation === "A"
            ? todayCards.slice(0, 1 + TODAY_RAIL_MAX).map((c) => c.id)
            : nextCard
              ? [nextCard.id]
              : []
        }
      />
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
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-action inset-ring inset-ring-action-border text-on-action transition-colors duration-200 hover:bg-action-hover"
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
    /*
      **누를 수 있다는 걸 보이게 한다** (09-03).

      제목 글자만 있어서 눌리는 줄 몰랐다. 손을 올리면 면이 켜지고 화살표가 짙어진다.
      `-mx-2 px-2` — 강조 면을 글자보다 넓게 잡되 **자리는 그대로** 둔다.
      바깥 여백을 음수로 당긴 만큼 안쪽에 돌려주는 방식이라 줄이 밀리지 않는다.

      ⚠️ **hover만으로 끝내지 않는다.** 모바일에는 hover가 없어서, 늘 보이는
      화살표를 함께 둔다. 평소엔 연하게, 올리면 짙어진다.

      **강조는 브랜드색으로 한다** (09-03). 중립 회색 면은 손을 올렸는지 아닌지가
      잘 안 보였다. 연분홍 면 + 진한 글자 + 화살표가 살짝 오른쪽으로 나간다 —
      «눌리는 것»과 «가는 방향»을 함께 말한다.
      대비는 지킨다: berry-dark on berry-light = 4.85:1 (실측).
      hover는 스쳐 지나가는 상태라 §2 「색 비율 5%」와 부딪히지 않는다.
    */
    <Link
      href={`/card/${card.id}`}
      className="group -mx-2 flex min-h-11 min-w-0 items-center gap-2 rounded-md px-2 py-1.5
                 transition-colors duration-200 hover:bg-berry-light"
    >
      <span
        className="block min-w-0 flex-1 truncate text-body text-ink
                   transition-colors duration-200 group-hover:font-semibold group-hover:text-berry-dark"
      >
        {title}
      </span>
      <ChevronRight
        size={15}
        aria-hidden
        className="shrink-0 text-line transition-all duration-200
                   group-hover:translate-x-0.5 group-hover:text-berry-dark"
      />
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
              "flex min-h-11 w-16 shrink-0 items-center self-start text-caption",
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
 * A·B — 앞으로 올릴 콘텐츠 (09-04에 둘을 한 섹션으로 합쳤다).
 *
 * 예전엔 A(이번 주)만 펼쳐져 있고 B(다음 달)는 **작은 회색 접힌 한 줄**이었다.
 * 있는 줄도 모르고 지나가는 자리였다 — 기획 화면의 세부 질문지와 같은 문제.
 * 탭으로 나란히 놓고 **개수를 탭에 박아**, 안 열어도 저쪽에 몇 개 있는지 보이게 했다.
 *
 * **기본은 언제나 「이번 주」다.** 홈의 존재 이유가 「지금 뭘 해야 하나」라서,
 * 둘을 나란히 두더라도 무게까지 같게 두지는 않는다. 이번 주가 비었을 때만
 * 다음 달이 첫 탭이 된다.
 *
 * **한쪽이 비면 탭을 그리지 않는다** — 탭이 하나뿐인 토글은 토글이 아니다.
 */
function UpcomingSection({
  weekCards,
  futureCards,
  excludeIds,
}: {
  weekCards: DatedCard[];
  /** 다음 주 이후 카드 (B) — 전부 넘겨주면 여기서 «첫 달»만 골라 쓴다 */
  futureCards: DatedCard[];
  /** 위에서 이미 보여준 카드들 — 목록에 또 넣지 않는다 (09-03) */
  excludeIds?: string[];
}) {
  const [picked, setPicked] = useState<"week" | "month">("week");

  const todayKey = kstTodayKey();
  // 「올릴」 목록 — 이미 올린 카드는 접는다. 이미 만들어둔 카드(올리기만 남음)는 들어온다
  const shown = new Set(excludeIds ?? []);
  const week = weekCards.filter((c) => c.status !== "published" && !shown.has(c.id));

  /*
    **탭 이름이 곧 목록의 범위 약속이다** (09-04).

    예전 코드는 「9월에 올릴 콘텐츠 2개」라고 세어놓고 펼치면 10월 카드까지
    그렸다 — 숫자와 목록이 어긋났다. 「9월」이라고 적었으면 9월만 보여준다.
    그 너머는 「전체보기 → 캘린더」가 맡는다.
  */
  const firstMonth =
    futureCards.length > 0 ? Number(futureCards[0].scheduledDate.split("-")[1]) : null;
  const month =
    firstMonth === null
      ? []
      : futureCards.filter((c) => Number(c.scheduledDate.split("-")[1]) === firstMonth);

  const tabs = [
    week.length > 0
      ? { key: "week" as const, label: "이번 주 콘텐츠", cards: week, today: todayKey }
      : null,
    month.length > 0
      ? { key: "month" as const, label: `${firstMonth}월에 올릴 콘텐츠`, cards: month, today: "" }
      : null,
  ].filter((t) => t !== null);

  if (tabs.length === 0) return null;
  const active = tabs.find((t) => t.key === picked) ?? tabs[0];

  return (
    <section className="border-y border-line py-2.5">
      {/*
        **좁은 폭에서는 링크가 아랫줄로 내려간다** (09-08). 「캘린더에서 보기」로 이름을
        늘리면서 390px에서 한 줄에 다 들어가지 않게 됐다 — 탭을 줄여 글자를 자르는
        대신 줄을 바꾼다. 탭 이름과 개수가 잘리면 이 줄이 하는 일이 사라진다.
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {tabs.length === 1 ? (
          <h2 className="text-title font-bold text-ink">{active.label}</h2>
        ) : (
          /*
            **`role="tab"`을 뗐다** (09-08). `tablist`·`tab`만 있고 `tabpanel`도
            `aria-controls`도 화살표 키 이동도 없어서, 보조기기에는 「탭이라고 주장하지만
            탭처럼 굴지 않는 것」이었다. 실제 하는 일은 목록 필터 두 개를 켜고 끄는 것이라
            **누름 상태를 가진 버튼**(`aria-pressed`)이 정확하다. 코드도 줄어든다.
          */
          <div role="group" aria-label="앞으로 올릴 콘텐츠" className="flex min-w-0 gap-1">
            {tabs.map((tab) => {
              const on = tab.key === active.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(tab.key)}
                  className={[
                    "flex h-11 items-center gap-1.5 rounded-md px-2.5 transition-colors duration-200",
                    on
                      ? "bg-berry-light font-bold text-berry-dark"
                      : "text-sub hover:bg-surface-muted hover:text-ink",
                  ].join(" ")}
                >
                  <span className="truncate text-body">{tab.label}</span>
                  <span className="text-caption font-semibold">{tab.cards.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {/*
          배정 카드 전체 목록은 캘린더가 담당 — 새 페이지를 만들지 않는다.
          이름을 「전체보기」에서 바꿨다 (09-08) — «무엇의» 전체인지 말하지 않아서
          누르기 전엔 어디로 가는지 알 수 없었다. 갈 곳을 그대로 적는다.
        */}
        <Link
          href="/calendar"
          className="ml-auto flex h-11 shrink-0 items-center px-1 text-caption font-semibold text-berry transition-colors duration-200 hover:text-berry-dark"
        >
          캘린더에서 보기
        </Link>
      </div>

      {/* 「남아있다」는 밀린 일감처럼 읽힌다 — §1 Calm에 맞춰 세기만 한다 (09-08) */}
      {tabs.length === 1 && (
        <p className="mt-0.5 text-caption text-sub">{active.cards.length}개 있어요</p>
      )}

      {/*
        목록이 통째로 갈리는 것을 소리로도 알린다 (09-08). 버튼의 누름 상태는
        바뀌었다고 읽히지만, **아래 목록이 다른 것으로 바뀐 사실**은 말해주지 않는다.
      */}
      <p role="status" className="sr-only">
        {active.label} {active.cards.length}개
      </p>

      <div className="mt-2">
        <DateGroupedList cards={active.cards} todayKey={active.today} />
      </div>
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
          className="flex min-h-11 min-w-0 items-center gap-1 text-body text-sub transition-colors duration-200 hover:text-ink"
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
            ? "flex h-11 items-center justify-center rounded-md bg-action inset-ring inset-ring-action-border px-6 text-body font-semibold text-on-action transition-colors duration-200 hover:bg-action-hover"
            : "flex h-11 shrink-0 items-center text-caption font-semibold text-berry transition-colors duration-200 hover:text-berry-dark"
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
              className="flex h-10 items-center justify-center rounded-md bg-action inset-ring inset-ring-action-border px-4 text-body font-semibold text-on-action transition-colors duration-200 hover:bg-action-hover"
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
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-action inset-ring inset-ring-action-border text-on-action transition-colors duration-200 hover:bg-action-hover"
      >
        <ArrowUp size={18} aria-hidden />
      </button>
    </form>
  );
}

/* ============================================================
   로딩 · 에러
   ============================================================ */

/**
 * Auth 판정 대기 — 로그인인지 아닌지 아직 모르는 아주 짧은 구간.
 *
 * **09-08 — 글자에서 골격으로 바꿨다.** 「불러오는 중...」 텍스트와 `HomeSkeleton`의
 * 회색 골격, 같은 「로딩」에 두 가지 말투가 있었다. 골격 쪽을 남긴 이유는 ① 글자는
 * 읽히는 순간 사라져서 깜빡임으로 보이고 ② 여기서 로그인이면 곧 홈 골격이 이어지므로
 * 같은 언어로 말하는 편이 이어 붙는다. 로그아웃이면 랜딩이 덮는다.
 */
function FullPageLoading() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[960px] flex-1 p-4 md:p-6">
      <div aria-hidden className="flex animate-pulse flex-col gap-4 pt-2">
        <div className="h-7 w-56 rounded-sm bg-surface-muted" />
        <div className="h-5 w-72 rounded-sm bg-surface-muted" />
      </div>
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
        className="mt-6 flex h-11 items-center justify-center rounded-md border-2 border-berry bg-surface px-6 text-body font-semibold text-berry transition-colors duration-200 hover:bg-berry-tint hover:text-berry-dark"
      >
        다시 시도
      </button>
    </section>
  );
}
