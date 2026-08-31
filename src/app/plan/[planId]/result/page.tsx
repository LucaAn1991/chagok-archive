"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import AppSidebar from "@/components/AppSidebar";
import BackLink from "@/components/BackLink";
import MobileBottomNav from "@/components/MobileBottomNav";
import StatusBadge from "@/components/StatusBadge";
import { audienceLine } from "@/lib/format";
import { MAX_CARDS_PER_RUN } from "@/lib/audiences";
import type { Card } from "@/types";

/**
 * 배치 결과 확인 — 생성된 카드 + 배정된 날짜 (F4 · PLAN §4).
 * 「N개의 콘텐츠가 일정에 추가됐어요」 + 날짜 목록 (PLAN §3-1).
 */

function formatDate(dateKey: string): string {
  if (!dateKey) return "날짜 미정";
  const [, m, d] = dateKey.split("-").map(Number);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][
    new Date(`${dateKey}T00:00:00`).getDay()
  ];
  return `${m}.${d} (${weekday})`;
}

type ResultState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; cards: Card[] };

export default function PlanResultPage() {
  return (
    <Suspense fallback={null}>
      <PlanResultScreen />
    </Suspense>
  );
}

function PlanResultScreen() {
  const router = useRouter();
  const { planId } = useParams<{ planId: string }>();
  const capped = useSearchParams().get("capped") === "1";
  const [state, setState] = useState<ResultState>({ phase: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      void (async () => {
        try {
          // 인덱스 (userId ASC, planId ASC, scheduledDate ASC) 사용 (PLAN §7)
          const snap = await getDocs(
            query(
              collection(db, "cards"),
              where("userId", "==", user.uid),
              where("planId", "==", planId),
              orderBy("scheduledDate", "asc"),
            ),
          );
          const cards = snap.docs.map((d) => ({ ...(d.data() as Omit<Card, "id">), id: d.id }));
          if (!cancelled) setState({ phase: "ready", cards });
        } catch {
          if (!cancelled) setState({ phase: "error" });
        }
      })();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [planId, router, reloadKey]);

  return (
    <div className="flex flex-1">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[720px] flex-1 p-4 pb-24 md:p-6 md:pb-8 min-[1200px]:p-8">
          <BackLink fallbackHref="/plan/history">지난 기획</BackLink>

          {state.phase === "loading" && (
            <div aria-hidden className="flex animate-pulse flex-col gap-4 pt-2">
              <div className="h-7 w-64 rounded-sm bg-surface-muted" />
              <div className="h-40 rounded-lg bg-surface-muted" />
            </div>
          )}

          {state.phase === "error" && (
            <section className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-body-l text-ink">배치 결과를 불러오지 못했어요.</p>
              <button
                type="button"
                onClick={() => {
                  setState({ phase: "loading" });
                  setReloadKey((k) => k + 1);
                }}
                className="mt-6 flex h-11 items-center justify-center rounded-md border-2 border-berry bg-surface px-6 text-body font-semibold text-berry transition-colors duration-200 hover:bg-berry-tint"
              >
                다시 시도
              </button>
            </section>
          )}

          {state.phase === "ready" && state.cards.length === 0 && (
            <section className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-body-l text-ink">이 기획으로 만든 카드가 없어요.</p>
              <Link
                href="/plan/new"
                className="mt-6 flex h-11 items-center justify-center rounded-md bg-berry px-6 text-body font-semibold text-white transition-colors duration-200 hover:bg-berry-dark"
              >
                새 기획 시작하기
              </Link>
            </section>
          )}

          {state.phase === "ready" && state.cards.length > 0 && (
            <>
              <h1 className="text-h2 font-bold text-ink">
                {state.cards.length}개의 콘텐츠가 일정에 추가됐어요
              </h1>
              <p className="mt-1 text-body-l text-sub">이제 하루에 하나씩, 차곡차곡 만들면 돼요.</p>
              {capped && (
                <p className="mt-1 text-body text-sub">먼저 {MAX_CARDS_PER_RUN}장만 만들어드릴게요.</p>
              )}

              <ul className="mt-6 flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
                {state.cards.map((card) => (
                  <li key={card.id} className="border-b border-line last:border-b-0">
                    <Link
                      href={`/card/${card.id}`}
                      className="flex min-h-14 items-center gap-4 px-4 py-3 transition-colors duration-200 hover:bg-surface-muted"
                    >
                      <span className="w-16 shrink-0 text-caption text-sub">
                        {formatDate(card.scheduledDate)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body text-ink">{card.title}</span>
                        <span className="block truncate text-caption text-sub">
                          {audienceLine(card.audience)}
                        </span>
                      </span>
                      <StatusBadge status={card.status} />
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-col gap-2">
                <Link
                  href="/"
                  className="flex h-12 w-full items-center justify-center rounded-md bg-berry text-[15px] font-semibold text-white transition-colors duration-200 hover:bg-berry-dark"
                >
                  홈으로 가기
                </Link>
                <Link
                  href="/calendar"
                  className="flex h-11 w-full items-center justify-center rounded-md text-body font-semibold text-berry transition-colors duration-200 hover:text-berry-dark"
                >
                  캘린더 보기
                </Link>
              </div>
            </>
          )}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
