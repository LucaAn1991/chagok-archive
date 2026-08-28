"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import AIChatBubble from "@/components/AIChatBubble";
import type { Plan } from "@/types";

/**
 * 지난 기획 상세 — 대화 히스토리 전문 · 확정 기획안 · [이어서 기획하기] (F10·F11 · IA 2.4).
 * 카드 상세의 「생성 출처」에서도 이 화면으로 들어온다.
 */

type DetailState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "notfound" }
  | { phase: "ready"; plan: Plan };

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
          // 남의 문서는 보안 규칙이 거부한다 — 조회 실패와 없음 모두 404로 취급
          if (!snap.exists() || snap.data().userId !== user.uid) {
            if (!cancelled) setState({ phase: "notfound" });
            return;
          }
          const plan = { ...(snap.data() as Omit<Plan, "id">), id: snap.id };
          if (!cancelled) setState({ phase: "ready", plan });
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
          {state.phase === "loading" && (
            <div aria-hidden className="flex animate-pulse flex-col gap-4 pt-2">
              <div className="h-7 w-64 rounded-sm bg-surface-muted" />
              <div className="h-40 rounded-lg bg-surface-muted" />
            </div>
          )}

          {state.phase === "notfound" && (
            <section className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-body-l text-ink">기획을 찾을 수 없어요.</p>
              <Link
                href="/plan/history"
                className="mt-6 flex h-11 items-center justify-center rounded-md border-2 border-berry bg-surface px-6 text-body font-semibold text-berry transition-colors duration-200 hover:bg-berry-tint"
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
                className="mt-6 flex h-11 items-center justify-center rounded-md border-2 border-berry bg-surface px-6 text-body font-semibold text-berry transition-colors duration-200 hover:bg-berry-tint"
              >
                다시 시도
              </button>
            </section>
          )}

          {state.phase === "ready" && (
            <>
              {/* 확정 기획안 */}
              <h1 className="text-h3 font-bold text-ink">{state.plan.topic}</h1>
              <dl className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
                <div>
                  <dt className="text-label font-semibold text-sub">대상</dt>
                  <dd className="mt-0.5 text-body text-ink">
                    {state.plan.audiences.join(" · ") || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-label font-semibold text-sub">기획의도</dt>
                  <dd className="mt-0.5 text-body text-ink">{state.plan.intent || "—"}</dd>
                </div>
                <div>
                  <dt className="text-label font-semibold text-sub">카드</dt>
                  <dd className="mt-0.5 text-body text-ink">
                    {state.plan.cardCount}장
                    {state.plan.status === "draft" && " · 아직 확정 전이에요"}
                  </dd>
                </div>
              </dl>

              {/* 이어서 기획하기 (F11) */}
              <Link
                href={`/plan/new?from=${state.plan.id}`}
                className="mt-4 flex h-12 w-full items-center justify-center rounded-md bg-berry text-[15px] font-semibold text-white transition-colors duration-200 hover:bg-berry-dark"
              >
                이어서 기획하기
              </Link>

              {/* 대화 히스토리 전문 */}
              <h2 className="mt-8 text-title font-bold text-ink">대화 히스토리</h2>
              <div className="mt-4 flex flex-col gap-4">
                {state.plan.messages.length === 0 && (
                  <p className="text-body text-sub">남아 있는 대화가 없어요.</p>
                )}
                {state.plan.messages.map((m, i) => (
                  <AIChatBubble
                    key={i}
                    role={m.role}
                    text={m.text}
                    showAvatar={
                      m.role === "assistant" && state.plan.messages[i - 1]?.role !== "assistant"
                    }
                  />
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
