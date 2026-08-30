"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { ChevronLeft } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import StatusBadge from "@/components/StatusBadge";
import type { Card } from "@/types";

/**
 * 놓친 카드 모아보기 (F14) — PLAN §3 · §4.
 *
 * overdue = scheduledDate < 오늘 && status ∉ {published, discarded}.
 * 별도 status를 만들지 않는다 (PLAN §3 «overdue 계산»).
 * plan.seriesTitle로 묶어 보여주고, 카드마다 세 가지 회수 동작:
 *   올렸어요(→published) · 날짜 재지정 · 버리기(→discarded)
 * 0건 empty state는 죄책감 없는 문구 — 빨간색·경고 금지 (PLAN §2 F14).
 */

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function MissedPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      setUid(user.uid);
    });
    return unsubscribe;
  }, [router]);

  if (!uid) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-body text-sub">불러오는 중…</p>
      </main>
    );
  }
  return <MissedView uid={uid} />;
}

type Group = { seriesTitle: string; cards: Card[] };
type ViewState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "ready"; groups: Group[] };

function MissedView({ uid }: { uid: string }) {
  const router = useRouter();
  const todayKey = toDateKey(new Date());

  const [state, setState] = useState<ViewState>({ phase: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 날짜 재지정 — 어떤 카드의 날짜 입력이 열려 있나
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // 온보딩 가드 (PLAN §3)
        const userSnap = await getDoc(doc(db, "users", uid));
        if (!userSnap.exists()) {
          await signOut(auth);
          return;
        }
        if (userSnap.data().onboardedAt == null) {
          router.replace("/onboarding");
          return;
        }

        // overdue 조회 — (userId, scheduledDate) 인덱스, status는 클라이언트 필터
        const snap = await getDocs(
          query(
            collection(db, "cards"),
            where("userId", "==", uid),
            where("scheduledDate", "<", todayKey),
            orderBy("scheduledDate", "asc"),
          ),
        );
        const cards = snap.docs
          .map((d) => ({ ...(d.data() as Omit<Card, "id">), id: d.id }))
          .filter((c) => c.status !== "published" && c.status !== "discarded");

        // plan.seriesTitle로 묶는다 (PLAN §3 F14) — plan이 없으면 카드 제목으로
        const planIds = [...new Set(cards.map((c) => c.planId))];
        const titles = new Map<string, string>();
        await Promise.all(
          planIds.map(async (planId) => {
            try {
              const planSnap = await getDoc(doc(db, "plans", planId));
              if (planSnap.exists()) {
                titles.set(planId, planSnap.data().seriesTitle ?? planSnap.data().topic ?? "");
              }
            } catch {
              // plan 접근 실패 → 묶음 제목 없이 진행 (출처 숨김 — PLAN §3 F6과 동일 태도)
            }
          }),
        );

        const bySeries = new Map<string, Card[]>();
        for (const card of cards) {
          const key = titles.get(card.planId) || "기타";
          const list = bySeries.get(key) ?? [];
          list.push(card);
          bySeries.set(key, list);
        }
        const groups = [...bySeries.entries()].map(([seriesTitle, list]) => ({
          seriesTitle,
          cards: list,
        }));

        if (cancelled) return;
        setState({ phase: "ready", groups });
      } catch {
        if (!cancelled) setState({ phase: "error" });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [uid, router, todayKey, reloadKey]);

  function showNotice(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 3000);
  }

  /** 목록에서 카드 제거 (동작 성공 후) */
  function removeCard(cardId: string) {
    if (state.phase !== "ready") return;
    setState({
      phase: "ready",
      groups: state.groups
        .map((g) => ({ ...g, cards: g.cards.filter((c) => c.id !== cardId) }))
        .filter((g) => g.cards.length > 0),
    });
  }

  /** 올렸어요 — F9와 동일한 규칙 (published는 publishedAt 필수) */
  async function markPublished(card: Card) {
    setBusyId(card.id);
    try {
      await updateDoc(doc(db, "cards", card.id), {
        status: "published",
        publishIntent: "yes",
        publishedAt: serverTimestamp(),
      });
      removeCard(card.id);
      showNotice("발행 완료로 기록했어요.");
    } catch {
      showNotice("저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusyId(null);
    }
  }

  /** 날짜 재지정 — 캘린더 드래그와 동일한 쓰기 */
  async function reschedule(card: Card) {
    if (!rescheduleDate) return;
    setBusyId(card.id);
    try {
      await updateDoc(doc(db, "cards", card.id), { scheduledDate: rescheduleDate });
      removeCard(card.id);
      setRescheduleId(null);
      showNotice("일정을 다시 잡았어요.");
    } catch {
      showNotice("저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusyId(null);
    }
  }

  /** 버리기 — 삭제가 아니라 discarded (PLAN §2) */
  async function discard(card: Card) {
    setBusyId(card.id);
    try {
      await updateDoc(doc(db, "cards", card.id), { status: "discarded" });
      removeCard(card.id);
      showNotice("카드를 버렸어요.");
    } catch {
      showNotice("저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-1">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[960px] flex-1 p-4 pb-24 md:p-6 md:pb-8 min-[1200px]:p-8">
          <div className="flex items-center gap-2">
            <Link
              href="/calendar"
              aria-label="캘린더로 돌아가기"
              className="flex size-11 items-center justify-center rounded-md text-sub hover:bg-surface-muted"
            >
              <ChevronLeft size={20} aria-hidden />
            </Link>
            <h1 className="text-title font-bold text-ink">놓친 카드</h1>
          </div>

          {state.phase === "loading" && (
            <div className="mt-6 flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-muted" />
              ))}
            </div>
          )}

          {state.phase === "error" && (
            <div className="mt-16 flex flex-col items-center gap-3">
              <p className="text-body text-sub">목록을 불러오지 못했어요.</p>
              <button
                type="button"
                onClick={() => {
                  setState({ phase: "loading" });
                  setReloadKey((k) => k + 1);
                }}
                className="h-11 rounded-md border border-line bg-surface px-5 text-body font-semibold text-ink hover:bg-surface-muted"
              >
                다시 시도
              </button>
            </div>
          )}

          {/* 0건 — 죄책감 없는 문구, 빨간색·경고 금지 (PLAN §2 F14) */}
          {state.phase === "ready" && state.groups.length === 0 && (
            <div className="mt-16 flex flex-col items-center gap-2">
              <p className="text-body-l font-semibold text-ink">밀린 카드가 없어요</p>
              <p className="text-body text-sub">지금 페이스 그대로면 충분해요.</p>
              <Link
                href="/calendar"
                className="mt-3 flex h-11 items-center rounded-md border border-line bg-surface px-5 text-body font-semibold text-ink hover:bg-surface-muted"
              >
                캘린더로 돌아가기
              </Link>
            </div>
          )}

          {state.phase === "ready" &&
            state.groups.map((group) => (
              <section key={group.seriesTitle} className="mt-6">
                <h2 className="text-body font-semibold text-ink">{group.seriesTitle}</h2>
                <ul className="mt-2 flex flex-col gap-2">
                  {group.cards.map((card) => {
                    const busy = busyId === card.id;
                    return (
                      <li
                        key={card.id}
                        className="rounded-lg border border-line bg-surface p-3"
                      >
                        <div className="flex items-center gap-3">
                          <Link href={`/card/${card.id}`} className="min-w-0 flex-1">
                            <span className="block truncate text-body font-semibold text-ink hover:underline">
                              {card.title}
                            </span>
                            <span className="mt-0.5 block text-caption text-sub">
                              {card.scheduledDate} 예정이었어요 · {card.audience}
                            </span>
                          </Link>
                          <StatusBadge status={card.status} />
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void markPublished(card)}
                            className="h-9 rounded-md bg-berry px-3 text-body font-semibold text-white hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
                          >
                            올렸어요
                          </button>

                          {rescheduleId === card.id ? (
                            <span className="flex items-center gap-2">
                              <input
                                type="date"
                                value={rescheduleDate}
                                min={todayKey}
                                onChange={(e) => setRescheduleDate(e.target.value)}
                                className="h-9 rounded-md border border-line bg-surface px-2 text-body text-ink"
                              />
                              <button
                                type="button"
                                disabled={busy || !rescheduleDate}
                                onClick={() => void reschedule(card)}
                                className="h-9 rounded-md border-2 border-berry bg-surface px-3 text-body font-semibold text-berry hover:bg-berry-light hover:text-berry-dark disabled:border-line disabled:text-sub"
                              >
                                확정
                              </button>
                              <button
                                type="button"
                                onClick={() => setRescheduleId(null)}
                                className="text-body text-sub hover:text-ink"
                              >
                                취소
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setRescheduleId(card.id);
                                setRescheduleDate(todayKey);
                              }}
                              className="h-9 rounded-md border border-line bg-surface px-3 text-body font-semibold text-ink hover:bg-surface-muted disabled:text-sub"
                            >
                              날짜 다시 잡기
                            </button>
                          )}

                          {/* destructive — 투명 배경 + --warn (DESIGN §6) */}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void discard(card)}
                            className="ml-auto h-9 rounded-md border border-warn px-3 text-body font-semibold text-warn hover:bg-surface-muted disabled:border-line disabled:text-sub"
                          >
                            버리기
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

          {notice && (
            <div
              role="alert"
              className="fixed bottom-20 left-1/2 -translate-x-1/2 rounded-md border border-line bg-surface px-4 py-2.5 text-body text-ink shadow-sm md:bottom-8"
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
