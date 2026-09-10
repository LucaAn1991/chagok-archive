"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import AppTopNav from "@/components/AppTopNav";
import PageHeader from "@/components/PageHeader";
import MobileBottomNav from "@/components/MobileBottomNav";
import { audienceLine, formatMonthDayWeekday } from "@/lib/format";
import type { Card, Plan } from "@/types";

/**
 * 지난 기획 상세 (F10·F11 · 08-31 §8 개편).
 * 구성: 공통 헤더(뒤로가기) → 제목 → 입력 원문 → 만들어진 카드 목록(대상·예정일)
 *       → 하단 [이어서 기획하기] 하나.
 * 대화 전문은 DB(messages)에 그대로 보관되지만 이 화면에는 원문만 보여준다 (08-31 확정).
 */

type DetailState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "notfound" }
  | { phase: "ready"; plan: Plan; cards: Card[] };

export default function PlanDetailPage() {
  const router = useRouter();
  const { planId } = useParams<{ planId: string }>();
  const [state, setState] = useState<DetailState>({ phase: "loading" });
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
          const snap = await getDoc(doc(db, "plans", planId));
          if (!snap.exists() || snap.data().userId !== user.uid) {
            if (!cancelled) setState({ phase: "notfound" });
            return;
          }
          const plan = { ...(snap.data() as Omit<Plan, "id">), id: snap.id };

          // 이 세션으로 만들어진 카드 — 인덱스 (userId, planId, scheduledDate) (PLAN §7)
          const cardSnap = await getDocs(
            query(
              collection(db, "cards"),
              where("userId", "==", user.uid),
              where("planId", "==", planId),
              orderBy("scheduledDate", "asc"),
            ),
          );
          const cards = cardSnap.docs
            .map((d) => ({ ...(d.data() as Omit<Card, "id">), id: d.id }))
            .filter((c) => c.status !== "discarded");

          if (!cancelled) setState({ phase: "ready", plan, cards });
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
    <div className="flex flex-1 flex-col">
      <AppTopNav />

      <div className="flex min-w-0 flex-1 flex-col">
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[960px] flex-1 p-4 pb-24 md:p-6 md:pb-8 min-[1200px]:p-8">
          <PageHeader fallbackHref="/plan/history" backLabel="지난 기획" />

          {state.phase === "loading" && (
            <div aria-hidden className="flex animate-pulse flex-col gap-4 pt-2">
              <div className="h-7 w-64 rounded-sm bg-surface-muted" />
              <div className="h-24 rounded-lg bg-surface-muted" />
              <div className="h-40 rounded-lg bg-surface-muted" />
            </div>
          )}

          {state.phase === "notfound" && (
            <section className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-body-l text-ink">기획을 찾을 수 없어요.</p>
              <Link
                href="/plan/history"
                className="mt-6 flex h-11 items-center justify-center rounded-md border-2 border-berry bg-surface px-6 text-body font-semibold text-berry transition-colors duration-200 hover:bg-berry-tint hover:text-berry-dark"
              >
                지난 기획 목록으로
              </Link>
            </section>
          )}

          {state.phase === "error" && (
            <section className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-body-l text-ink">기획을 불러오지 못했어요.</p>
              <button
                type="button"
                onClick={() => {
                  setState({ phase: "loading" });
                  setReloadKey((k) => k + 1);
                }}
                className="mt-6 flex h-11 items-center justify-center rounded-md border-2 border-berry bg-surface px-6 text-body font-semibold text-berry transition-colors duration-200 hover:bg-berry-tint hover:text-berry-dark"
              >
                다시 시도
              </button>
            </section>
          )}

          {state.phase === "ready" && <DetailBody plan={state.plan} cards={state.cards} />}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}

function DetailBody({ plan, cards }: { plan: Plan; cards: Card[] }) {
  // 입력 원문 — 첫 사용자 발화. 대화 전문은 DB에 그대로 있다
  const original = plan.messages.find((m) => m.role === "user")?.text ?? plan.topic;

  return (
    <>
      <h1 className="text-h3 font-bold text-ink">{plan.seriesTitle || plan.topic}</h1>

      {/* 입력 원문 — 목록의 짧은 제목과 달리 사용자가 쓴 그대로 보관·표시 (08-31 §5) */}
      <section className="mt-4">
        <h2 className="text-label font-semibold text-sub">입력 원문</h2>
        <p className="mt-1.5 whitespace-pre-wrap rounded-lg border border-line bg-surface p-4 text-body text-ink">
          {original}
        </p>
      </section>

      {/* 만들어진 카드 — 카드마다 대상 라벨 · 예정일 (08-31 §8) */}
      <section className="mt-6">
        {cards.length === 0 ? (
          <p className="text-body text-sub">이 기획으로 만든 카드가 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {cards.map((card) => (
              <li key={card.id}>
                <Link href={`/card/${card.id}`} className="block min-w-0">
                  <span className="block truncate text-body font-semibold text-ink">
                    {card.title}
                  </span>
                  <span className="mt-0.5 block text-caption text-sub">
                    {audienceLine(card.audience)} · {formatMonthDayWeekday(card.scheduledDate ?? "")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 이어서 기획하기 (F11) — 하단 버튼 하나 */}
      <Link
        href={`/plan/new?from=${plan.id}`}
        className="mt-8 flex h-12 w-full items-center justify-center rounded-md bg-action inset-ring inset-ring-action-border text-[15px] font-semibold text-on-action transition-colors duration-200 hover:bg-action-hover"
      >
        이어서 기획하기
      </Link>
    </>
  );
}
