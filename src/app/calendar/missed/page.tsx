"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { ArrowLeft } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import InlineAlert from "@/components/InlineAlert";
import StatusBadge from "@/components/StatusBadge";
import { formatDateLabel, todayKey } from "@/lib/calendar";
import type { Card, Plan } from "@/types";

/**
 * 놓친 카드 목록 (F14 · PLAN.md §3-1).
 *
 * **overdue는 상태가 아니다** (DESIGN.md §11). `scheduledDate < today && status != 'published'`
 * 로 «여기서» 계산한다. 별도 status를 만들면 발행률 분모가 흐려진다.
 *
 * 이 화면의 존재 이유는 회수다 — 「올렸어요」를 안 눌러 미발행으로 잡힌 카드를
 * 되찾아온다 (PRD 위험 4). 그래서 세 가지 행동을 한자리에 둔다:
 * **올렸어요 · 날짜 다시 잡기 · 버리기.**
 *
 * **0건일 때 죄책감을 주지 않는다** (PLAN.md §3-1). 빨간색·경고 아이콘을 쓰지 않고,
 * 밀린 게 없다는 사실만 담담히 말한다.
 *
 * 묶는 기준은 `plan.seriesTitle`이다. 원 기획이 지워졌거나 없는 카드는
 * 「따로 만든 카드」로 모은다 — 묶이지 않는다고 목록에서 빠지면 안 된다.
 */

const UNGROUPED = "따로 만든 카드";

type Phase = "loading" | "ready" | "error";
type Group = { title: string; cards: Card[] };

export default function MissedCardsPage() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [cards, setCards] = useState<Card[]>([]);
  const [seriesByPlanId, setSeriesByPlanId] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<Card | null>(null);

  const today = todayKey();

  const load = useCallback(
    async (uid: string) => {
      // 예정일이 오늘보다 이전인 것만. status 필터는 클라이언트에서 —
      // Firestore는 부등호를 한 필드에만 걸 수 있어 scheduledDate 범위와 status !=를 같이 못 준다
      const snap = await getDocs(
        query(
          collection(db, "cards"),
          where("userId", "==", uid),
          where("scheduledDate", "<", today),
        ),
      );

      const overdue = snap.docs
        .map((d) => ({ ...(d.data() as Card), id: d.id }))
        .filter((c) => c.status !== "published" && c.status !== "discarded")
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

      setCards(overdue);

      // 묶음 제목은 plan에 있다. 같은 기획을 여러 번 읽지 않도록 planId를 먼저 추린다
      const planIds = [...new Set(overdue.map((c) => c.planId).filter(Boolean))];
      const entries = await Promise.all(
        planIds.map(async (id) => {
          const p = await getDoc(doc(db, "plans", id)).catch(() => null);
          const title = (p?.data() as Plan | undefined)?.seriesTitle;
          return [id, title ?? ""] as const;
        }),
      );
      setSeriesByPlanId(Object.fromEntries(entries.filter(([, t]) => t)));
    },
    [today],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      try {
        await load(user.uid);
        setPhase("ready");
      } catch {
        setPhase("error");
      }
    });
    return unsubscribe;
  }, [router, load]);

  /** 시리즈별 묶음 — 원 기획이 없는 카드도 반드시 어딘가에 담긴다 */
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Card[]>();
    for (const c of cards) {
      const title = seriesByPlanId[c.planId] || UNGROUPED;
      const list = map.get(title);
      if (list) list.push(c);
      else map.set(title, [c]);
    }
    // «따로 만든 카드»는 항상 맨 뒤 — 이름이 붙은 시리즈가 먼저 눈에 들어와야 한다
    return [...map.entries()]
      .map(([title, list]) => ({ title, cards: list }))
      .sort((a, b) =>
        a.title === UNGROUPED ? 1 : b.title === UNGROUPED ? -1 : a.title.localeCompare(b.title),
      );
  }, [cards, seriesByPlanId]);

  /** 처리한 카드는 더 이상 «놓친» 것이 아니므로 목록에서 뺀다 */
  function removeFromList(cardId: string) {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
  }

  async function markPublished(card: Card) {
    setBusyId(card.id);
    setError(null);
    try {
      // 보안 규칙이 published로 갈 때 publishedAt을 함께 요구한다 (PLAN §7 원칙 ③)
      await updateDoc(doc(db, "cards", card.id), {
        status: "published",
        publishedAt: serverTimestamp(),
      });
      removeFromList(card.id);
    } catch {
      setError("처리하지 못했어요. 다시 시도해주세요.");
    } finally {
      setBusyId(null);
    }
  }

  async function reschedule(card: Card, date: string) {
    if (!date || date === card.scheduledDate) return;
    setBusyId(card.id);
    setError(null);
    try {
      await updateDoc(doc(db, "cards", card.id), { scheduledDate: date });
      if (date >= today) {
        removeFromList(card.id); // 오늘 이후로 옮겼으면 더 이상 놓친 카드가 아니다
      } else {
        setCards((prev) =>
          prev
            .map((c) => (c.id === card.id ? { ...c, scheduledDate: date } : c))
            .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)),
        );
      }
    } catch {
      setError("날짜를 옮기지 못했어요. 다시 시도해주세요.");
    } finally {
      setBusyId(null);
    }
  }

  async function discard(card: Card) {
    setBusyId(card.id);
    setError(null);
    try {
      await updateDoc(doc(db, "cards", card.id), { status: "discarded" });
      removeFromList(card.id);
      setConfirmDiscard(null);
    } catch {
      setError("버리지 못했어요. 다시 시도해주세요.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-1">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[720px] flex-1 p-4 pb-24 md:p-6 md:pb-8 min-[1200px]:p-8">
          <Link
            href="/calendar"
            className="inline-flex items-center gap-1 text-body text-sub hover:text-ink"
          >
            <ArrowLeft size={16} aria-hidden />
            캘린더
          </Link>

          <header className="mt-3 flex flex-col gap-1">
            <h1 className="text-h3 font-bold text-ink">지나간 카드</h1>
            <p className="text-body text-sub">
              예정일이 지났지만 아직 올리지 않은 카드예요. 지금 올려도 늦지 않아요.
            </p>
          </header>

          {error && (
            <div className="mt-4">
              <InlineAlert>{error}</InlineAlert>
            </div>
          )}

          {phase === "loading" && (
            <div aria-hidden className="mt-6 flex animate-pulse flex-col gap-3">
              <div className="h-6 w-32 rounded-md bg-surface-muted" />
              <div className="h-28 rounded-lg bg-surface-muted" />
              <div className="h-28 rounded-lg bg-surface-muted" />
            </div>
          )}

          {phase === "error" && (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border border-line bg-surface p-8">
              <p className="text-body text-ink">목록을 불러오지 못했어요.</p>
              <button
                type="button"
                onClick={() => location.reload()}
                className="h-11 rounded-md border border-line px-4 text-body font-semibold text-ink"
              >
                다시 시도
              </button>
            </div>
          )}

          {/* 0건 — 죄책감을 주지 않는다. 경고색·아이콘을 쓰지 않는다 (PLAN §3-1) */}
          {phase === "ready" && cards.length === 0 && (
            <div className="mt-6 flex flex-col items-center gap-2 rounded-lg border border-line bg-surface p-10">
              <p className="text-body font-semibold text-ink">밀린 카드가 없어요.</p>
              <p className="text-body text-sub">차곡차곡 잘 쌓고 계세요.</p>
              <Link
                href="/calendar"
                className="mt-2 text-body text-berry-dark underline underline-offset-4"
              >
                캘린더 보기
              </Link>
            </div>
          )}

          {phase === "ready" && groups.length > 0 && (
            <div className="mt-6 flex flex-col gap-6">
              {groups.map((group) => (
                <section key={group.title} className="flex flex-col gap-2">
                  <h2 className="text-body font-semibold text-ink">
                    {group.title}
                    <span className="ml-1.5 text-caption font-normal text-sub">
                      {group.cards.length}건
                    </span>
                  </h2>

                  <ul className="flex flex-col gap-2">
                    {group.cards.map((card) => (
                      <li
                        key={card.id}
                        className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
                      >
                        <div className="flex items-start gap-3">
                          <span className="min-w-0 flex-1">
                            <Link
                              href={`/card/${card.id}`}
                              className="block truncate text-body font-semibold text-ink hover:text-berry-dark"
                            >
                              {card.title}
                            </Link>
                            <span className="mt-0.5 block text-caption text-sub">
                              {formatDateLabel(card.scheduledDate)} 예정 · {card.audience}
                            </span>
                          </span>
                          <StatusBadge status={card.status} />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => markPublished(card)}
                            disabled={busyId === card.id}
                            className="h-10 rounded-md bg-berry px-4 text-body font-semibold text-white
                                       hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
                          >
                            올렸어요
                          </button>

                          <label className="flex items-center gap-1.5 text-caption text-sub">
                            날짜 다시 잡기
                            <input
                              type="date"
                              defaultValue={card.scheduledDate}
                              disabled={busyId === card.id}
                              onChange={(e) => reschedule(card, e.target.value)}
                              className="h-10 rounded-md border border-line bg-surface px-2
                                         text-body text-ink"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => setConfirmDiscard(card)}
                            disabled={busyId === card.id}
                            className="ml-auto h-10 rounded-md px-3 text-body text-sub
                                       hover:bg-surface-muted hover:text-ink disabled:text-sub/50"
                          >
                            버리기
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* 버리기는 되돌릴 수 없다 → 확인 모달 (PLAN.md §3-1 「카드 버리기」) */}
      {confirmDiscard && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="discard-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setConfirmDiscard(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-[400px] flex-col gap-3 rounded-lg bg-surface p-6"
          >
            <h2 id="discard-title" className="text-title font-bold text-ink">
              이 카드를 버릴까요?
            </h2>
            <p className="text-body text-sub">
              «{confirmDiscard.title}»을 버리면 목록에서 사라져요. 되돌릴 수 없어요.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDiscard(null)}
                className="h-11 flex-1 rounded-md border border-line text-body font-semibold text-ink"
              >
                그대로 두기
              </button>
              <button
                type="button"
                onClick={() => discard(confirmDiscard)}
                disabled={busyId === confirmDiscard.id}
                className="h-11 flex-1 rounded-md bg-berry text-body font-semibold text-white
                           hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
              >
                버리기
              </button>
            </div>
          </div>
        </div>
      )}

      <MobileBottomNav />
    </div>
  );
}
