"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import AppTopNav from "@/components/AppTopNav";
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
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * 기획 한 건 삭제 (09-03) — 목록에서 먼저 빼고(낙관적) 서버에 알린다.
   * 실패하면 원래 목록으로 되돌리고 알린다. 카드는 서버에서 건드리지 않는다.
   */
  async function handleDelete(id: string) {
    const user = auth.currentUser;
    if (!user) return;
    if (state.phase !== "ready") return;

    const prevRows = state.rows;
    setState({ phase: "ready", rows: prevRows.filter((r) => r.id !== id) });

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/plans/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setState({ phase: "ready", rows: prevRows });
      setNotice("삭제하지 못했어요. 잠시 후 다시 시도해주세요.");
      setTimeout(() => setNotice(null), 3000);
    }
  }

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
    <div className="flex flex-1 flex-col">
      <AppTopNav />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 컨테이너 값은 새 기획(plan/new)과 동일 — 탭 전환 시 헤더가 좌우로 튀지 않게 (09-01) */}
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[560px] flex-1 px-[var(--plan-gap)] pb-24 pt-3 [--plan-gap:1rem] md:[--plan-gap:1.5rem] md:pb-8 lg:max-w-[1080px] lg:pt-4">
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
                className="mt-6 flex h-11 items-center justify-center rounded-md border-2 border-berry bg-surface px-6 text-body font-semibold text-berry transition-colors duration-200 hover:bg-berry-tint hover:text-berry-dark"
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
              onDelete={handleDelete}
            />
          )}

          {notice && (
            <div
              role="status"
              className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-md bg-ink px-4 py-2 text-caption text-white shadow-md md:bottom-8"
            >
              {notice}
            </div>
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
  onDelete,
}: {
  rows: Row[];
  hasMore: boolean;
  onMore: () => void;
  onDelete: (id: string) => void;
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
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {group.rows.map((row) => {
                  const title = listTitle(row);
                  const duplicated = (titleCount.get(title) ?? 0) > 1;
                  return (
                    <HistoryRow
                      key={row.id}
                      row={row}
                      title={title}
                      timeLabel={duplicated ? timeLabel(row.confirmedAt) : ""}
                      onDelete={onDelete}
                    />
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

/**
 * 목록 한 줄 (09-03) — 호버하면 배경이 옅게 깔리고 오른쪽에 삭제 버튼이 뜬다.
 *
 * 삭제는 한 번 더 물어본다: 휴지통 → 「삭제 / 취소」. 실수로 지우는 걸 막는다.
 * 모바일은 호버가 없어 휴지통을 항상 옅게 보여주고(터치로 누름), 데스크톱은
 * 호버할 때만 드러낸다. 제목(Link)과 삭제 버튼은 형제라 링크 안에 버튼이 겹치지 않는다.
 */
function HistoryRow({
  row,
  title,
  timeLabel,
  onDelete,
}: {
  row: Row;
  title: string;
  timeLabel: string;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="group -mx-2 flex min-w-0 items-center gap-2 rounded-md px-2 py-1 transition-colors duration-150 hover:bg-surface-muted">
      <Link href={`/plan/${row.id}`} className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-body font-semibold text-ink">{title}</span>
        {timeLabel && <span className="shrink-0 text-caption text-sub">{timeLabel}</span>}
      </Link>

      {confirming ? (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onDelete(row.id)}
            className="rounded-sm px-2 py-1 text-caption font-semibold text-warn hover:bg-berry-tint"
          >
            삭제
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-sm px-2 py-1 text-caption text-sub hover:bg-surface"
          >
            취소
          </button>
        </span>
      ) : (
        <button
          type="button"
          aria-label="기획 삭제"
          onClick={() => setConfirming(true)}
          className="shrink-0 rounded-sm p-1.5 text-sub transition-opacity duration-150 hover:text-warn md:opacity-0 md:group-hover:opacity-100"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
