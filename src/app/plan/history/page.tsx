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
 * 지난 기획 목록 (F10 · 08-31 개편) — 눈으로 훑을 수 있는 목록.
 *
 * - 날짜별 2열 그룹 (날짜는 그룹 첫 행에만 · 최신 날짜가 위)
 * - 한 행 = 제목(굵게·말줄임) + «카드 N장» 회색 한 줄. 대상 나열 없음
 * - 올린 카드가 1장 이상일 때만 «N장 올림» — 0은 화면에 그리지 않는다
 * - 행 구분선 없음, 그룹 사이에만 구분선
 * - 기본 20건 + [더 보기] (무한 스크롤 금지)
 */

type Row = Plan & { uploadedCount: number };

type ListState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; rows: Row[] };

const PAGE_SIZE = 20;

/** confirmedAt → 로컬 'YYYY-MM-DD' (그룹 키) */
function dateKeyOf(ts: { toDate: () => Date } | null): string {
  if (!ts) return "";
  const d = ts.toDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 'YYYY-MM-DD' → '8월 31일' — «확정» 같은 말은 붙이지 않는다 */
function dateLabel(key: string): string {
  const [, m, d] = key.split("-").map(Number);
  return `${m}월 ${d}일`;
}

/** '오후 3:12' — 같은 날 같은 제목이 겹칠 때만 쓴다 */
function timeLabel(ts: { toDate: () => Date } | null): string {
  if (!ts) return "";
  const d = ts.toDate();
  const h = d.getHours();
  const period = h < 12 ? "오전" : "오후";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${hour12}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 목록용 제목 — 확정 시점에 저장된 짧은 제목(seriesTitle), 없으면 주제 원문 */
function listTitle(row: Row): string {
  return row.seriesTitle || row.topic;
}

export default function PlanHistoryPage() {
  const router = useRouter();
  const [state, setState] = useState<ListState>({ phase: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

          // 세션별 올린 카드 수 — 1장 이상일 때만 표시된다
          const cardSnap = await getDocs(
            query(collection(db, "cards"), where("userId", "==", user.uid)),
          );
          const uploadedByPlan = new Map<string, number>();
          for (const doc of cardSnap.docs) {
            const card = doc.data() as Card;
            if (card.status === "published") {
              uploadedByPlan.set(card.planId, (uploadedByPlan.get(card.planId) ?? 0) + 1);
            }
          }

          const rows = plans.map((plan) => ({
            ...plan,
            uploadedCount: uploadedByPlan.get(plan.id) ?? 0,
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
              <div className="h-14 rounded-lg bg-surface-muted" />
              <div className="h-14 rounded-lg bg-surface-muted" />
              <div className="h-14 rounded-lg bg-surface-muted" />
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
              <p className="text-body-l text-ink">아직 지난 기획이 없어요</p>
              <Link
                href="/plan/new"
                className="mt-6 flex h-11 items-center justify-center rounded-md bg-berry px-6 text-body font-semibold text-white transition-colors duration-200 hover:bg-berry-dark"
              >
                새 기획 시작하기
              </Link>
            </section>
          )}

          {state.phase === "ready" && state.rows.length > 0 && (
            <HistoryList
              rows={state.rows.slice(0, visibleCount)}
              hasMore={state.rows.length > visibleCount}
              onMore={() => setVisibleCount((n) => n + PAGE_SIZE)}
            />
          )}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}

function HistoryList({
  rows,
  hasMore,
  onMore,
}: {
  rows: Row[];
  hasMore: boolean;
  onMore: () => void;
}) {
  // 날짜별 그룹 — 최신 날짜가 위 (rows는 이미 confirmedAt 내림차순)
  const groups: { dateKey: string; rows: Row[] }[] = [];
  for (const row of rows) {
    const key = dateKeyOf(row.confirmedAt);
    const last = groups[groups.length - 1];
    if (last && last.dateKey === key) last.rows.push(row);
    else groups.push({ dateKey: key, rows: [row] });
  }

  return (
    <div className="mt-5">
      {groups.map((group, gi) => {
        // 같은 날짜 안에서 제목이 겹칠 때만 시각을 덧붙인다 (08-31 §6)
        const titleCount = new Map<string, number>();
        for (const row of group.rows) {
          const t = listTitle(row);
          titleCount.set(t, (titleCount.get(t) ?? 0) + 1);
        }

        return (
          <section
            key={group.dateKey || gi}
            className={gi > 0 ? "mt-4 border-t border-line pt-4" : ""}
          >
            <div className="flex gap-3">
              <span className="w-16 shrink-0 pt-0.5 text-caption text-sub">
                {group.dateKey ? dateLabel(group.dateKey) : "날짜 없음"}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                {group.rows.map((row) => {
                  const title = listTitle(row);
                  const duplicated = (titleCount.get(title) ?? 0) > 1;
                  return (
                    <Link key={row.id} href={`/plan/${row.id}`} className="block min-w-0">
                      <span className="block truncate text-body font-semibold text-ink">
                        {title}
                      </span>
                      <span className="mt-0.5 block text-caption text-sub">
                        {duplicated && `${timeLabel(row.confirmedAt)} · `}카드 {row.cardCount}장
                        {row.uploadedCount > 0 && ` · ${row.uploadedCount}장 올림`}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}

      {hasMore && (
        <button
          type="button"
          onClick={onMore}
          className="mt-6 flex h-11 w-full items-center justify-center rounded-md border border-line text-body font-semibold text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
        >
          더 보기
        </button>
      )}
    </div>
  );
}
