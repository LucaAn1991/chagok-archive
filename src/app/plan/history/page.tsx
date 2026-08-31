"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import PageHeader from "@/components/PageHeader";
import PlanTabs from "@/components/PlanTabs";
import type { Card, Plan } from "@/types";

/**
 * 지난 기획 목록 — 확정 세션 목록 (F10 · IA 2.3).
 * 주제 · 확정일 · 카드 수 · 진행 상태를 보여준다. 0건이면 empty state.
 */

type Row = Plan & { publishedCount: number };

type ListState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; rows: Row[] };

function formatDate(ts: { toDate: () => Date } | null): string {
  if (!ts) return "";
  const d = ts.toDate();
  return `${d.getMonth() + 1}.${d.getDate()}`;
}

export default function PlanHistoryPage() {
  const router = useRouter();
  const [state, setState] = useState<ListState>({ phase: "loading" });
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
          // 인덱스 (userId ASC, status ASC, confirmedAt DESC) 사용 (PLAN §7)
          const planSnap = await getDocs(
            query(
              collection(db, "plans"),
              where("userId", "==", user.uid),
              where("status", "==", "confirmed"),
              orderBy("confirmedAt", "desc"),
            ),
          );
          const plans = planSnap.docs.map((d) => ({
            ...(d.data() as Omit<Plan, "id">),
            id: d.id,
          }));

          // 진행 상태 — 기획별 발행 수를 센다 (v1 데이터 규모에서는 전체 조회로 충분)
          const cardSnap = await getDocs(
            query(collection(db, "cards"), where("userId", "==", user.uid)),
          );
          const publishedByPlan = new Map<string, number>();
          for (const doc of cardSnap.docs) {
            const card = doc.data() as Card;
            if (card.status === "published") {
              publishedByPlan.set(card.planId, (publishedByPlan.get(card.planId) ?? 0) + 1);
            }
          }

          const rows = plans.map((plan) => ({
            ...plan,
            publishedCount: publishedByPlan.get(plan.id) ?? 0,
          }));
          if (!cancelled) setState({ phase: "ready", rows });
        } catch {
          if (!cancelled) setState({ phase: "error" });
        }
      })();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router, reloadKey]);

  return (
    <div className="flex flex-1">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[720px] flex-1 p-4 pb-24 md:p-6 md:pb-8 min-[1200px]:p-8">
          <PageHeader title="AI 기획" />
          <PlanTabs />

          {state.phase === "loading" && (
            <div aria-hidden className="mt-6 flex animate-pulse flex-col gap-3">
              <div className="h-16 rounded-lg bg-surface-muted" />
              <div className="h-16 rounded-lg bg-surface-muted" />
              <div className="h-16 rounded-lg bg-surface-muted" />
            </div>
          )}

          {state.phase === "error" && (
            <section className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-body-l text-ink">지난 기획을 불러오지 못했어요.</p>
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

          {state.phase === "ready" && state.rows.length === 0 && (
            <section className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-body-l text-ink">확정된 기획이 아직 없어요.</p>
              <p className="mt-1 text-body text-sub">첫 기획을 시작해볼까요?</p>
              <Link
                href="/plan/new"
                className="mt-6 flex h-11 items-center justify-center rounded-md bg-berry px-6 text-body font-semibold text-white transition-colors duration-200 hover:bg-berry-dark"
              >
                새 기획 시작하기
              </Link>
            </section>
          )}

          {state.phase === "ready" && state.rows.length > 0 && (
            <ul className="mt-6 flex flex-col overflow-hidden rounded-lg border border-line bg-surface">
              {state.rows.map((row) => (
                <li key={row.id} className="border-b border-line last:border-b-0">
                  <Link
                    href={`/plan/${row.id}`}
                    className="flex min-h-16 items-center gap-4 px-4 py-3 transition-colors duration-200 hover:bg-surface-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-semibold text-ink">
                        {row.topic}
                      </span>
                      <span className="mt-0.5 block truncate text-caption text-sub">
                        {/* 표기 규칙 — label 변형 없이 «에게» 하나만 (08-28) */}
                        {row.audiences.length > 0 && `${row.audiences.join(" · ")}에게 · `}
                        {formatDate(row.confirmedAt)} 확정 · 카드 {row.cardCount}장
                      </span>
                    </span>
                    <span className="shrink-0 rounded-pill bg-surface-muted px-2.5 py-1 text-caption font-medium text-sub">
                      발행 {row.publishedCount}/{row.cardCount}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
