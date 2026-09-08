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
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { Trash2 } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
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

const DAY_HEADS = ["일", "월", "화", "수", "목", "금", "토"];

/** '2026-08-28' → '8월 28일 (금)' — 놓친 카드는 최근이라 연도는 뺀다 */
function formatDayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${m}월 ${d}일 (${DAY_HEADS[new Date(y, m - 1, d).getDay()]})`;
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
      <main id="main" tabIndex={-1} className="flex min-h-screen items-center justify-center">
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
  // 올렸어요 — 실제 올린 날짜를 물어본다 (08-31 요청)
  const [publishId, setPublishId] = useState<string | null>(null);
  const [publishDate, setPublishDate] = useState("");
  // 버리기 확인 모달 — 되돌릴 수 없으므로 (PLAN §2 · 카드 상세와 동일)
  const [discardTarget, setDiscardTarget] = useState<Card | null>(null);

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
          .map((d) => {
            const data = d.data() as Omit<Card, "id">;
            // 과도기 방어 — 옛 코드의 'crafted'는 pending으로 읽는다 (08-31 상태 개편)
            const status = (data.status as string) === "crafted" ? "pending" : data.status;
            return { ...data, status, id: d.id };
          })
          .filter(
            (c) =>
              // 날짜가 빈 카드(기획 도중 미완성 데이터)는 «놓친» 게 아니다
              c.scheduledDate !== "" && c.status !== "published" && c.status !== "discarded",
          );

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

  /** 올렸어요 — 실제 올린 날짜를 받아 기록한다 (F9: published는 publishedAt 필수) */
  async function markPublished(card: Card) {
    if (!publishDate) return;
    setBusyId(card.id);
    try {
      const [y, m, d] = publishDate.split("-").map(Number);
      await updateDoc(doc(db, "cards", card.id), {
        status: "published",
        publishIntent: "yes",
        // 정오로 만든다 — 자정은 UTC 표기에서 하루 밀릴 수 있다
        publishedAt: Timestamp.fromDate(new Date(y, m - 1, d, 12)),
        scheduledDate: publishDate, // 캘린더에도 실제 올린 날로 보이게
      });
      removeCard(card.id);
      setPublishId(null);
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
    <AppShell width={960}>
      <PageHeader fallbackHref="/calendar" backLabel="돌아가기" />

      <h1 className="mt-3 text-title font-bold text-ink">놓친 카드</h1>

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
                    className="rounded-lg border border-line bg-surface p-4 md:p-5"
                  >
                    {/* 정보는 한 줄씩 내려 쓴다 — 카드가 화면을 채우게 (08-31 피드백) */}
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/card/${card.id}`} className="min-w-0">
                        <span className="block text-body-l font-semibold text-ink hover:underline">
                          {card.title}
                        </span>
                      </Link>
                      <StatusBadge status={card.status} />
                    </div>
                    <p className="mt-2 text-body text-sub">
                      {formatDayLabel(card.scheduledDate ?? "")} 예정이었어요
                    </p>
                    <p className="mt-1 text-body text-sub">{card.audience}</p>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {/* 제작 대기 카드는 다음 행동이 «제작» — 제일 앞, primary (09-01) */}
                      {card.status === "planned" && (
                        <Link
                          href={`/card/${card.id}/result`}
                          className="flex h-9 items-center rounded-md bg-berry px-3 text-body font-semibold text-white hover:bg-berry-dark"
                        >
                          제작하기
                        </Link>
                      )}
                      {publishId === card.id ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-body text-sub">언제 올리셨어요?</span>
                          <input
                            type="date"
                            value={publishDate}
                            min={card.scheduledDate}
                            max={todayKey}
                            onChange={(e) => setPublishDate(e.target.value)}
                            className="h-9 rounded-md border border-line bg-surface px-2 text-body text-ink"
                          />
                          <button
                            type="button"
                            disabled={busy || !publishDate}
                            onClick={() => void markPublished(card)}
                            className="h-9 rounded-md bg-berry px-3 text-body font-semibold text-white hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
                          >
                            확인
                          </button>
                          <button
                            type="button"
                            onClick={() => setPublishId(null)}
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
                            setPublishId(card.id);
                            setPublishDate(todayKey);
                            setRescheduleId(null);
                          }}
                          className={
                            card.status === "planned"
                              ? "h-9 rounded-md border-2 border-berry bg-surface px-3 text-body font-semibold text-berry hover:bg-berry-light hover:text-berry-dark disabled:border-line disabled:text-sub"
                              : "h-9 rounded-md bg-berry px-3 text-body font-semibold text-white hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
                          }
                        >
                          올렸어요
                        </button>
                      )}

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
                            setPublishId(null);
                          }}
                          className="h-9 rounded-md border border-line bg-surface px-3 text-body font-semibold text-ink hover:bg-surface-muted disabled:text-sub"
                        >
                          날짜 다시 잡기
                        </button>
                      )}

                      {/* destructive — 휴지통 아이콘 + 확인 모달 (되돌릴 수 없으므로, PLAN §2) */}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setDiscardTarget(card)}
                        aria-label="버리기"
                        title="버리기"
                        className="ml-auto flex size-9 items-center justify-center rounded-md border border-warn text-warn hover:bg-surface-muted disabled:border-line disabled:text-sub"
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

      {/* 버리기 확인 모달 — 카드 상세와 같은 문구·패턴 (DESIGN §13) */}
      {discardTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="discard-title"
          onClick={() => setDiscardTarget(null)}
          className="overlay-in fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="modal-in flex w-full max-w-[400px] flex-col gap-4 rounded-xl bg-surface p-6 shadow-modal"
          >
            <h2 id="discard-title" className="text-title font-bold text-ink">
              이 카드를 버릴까요?
            </h2>
            <p className="text-body text-sub">
              버린 카드는 되돌릴 수 없어요. 삭제되는 건 아니고, 계획했던 기록으로 남아요.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDiscardTarget(null)}
                className="h-11 flex-1 rounded-md border border-line bg-surface text-body font-semibold text-ink"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = discardTarget;
                  setDiscardTarget(null);
                  void discard(target);
                }}
                className="h-11 flex-1 rounded-md border border-warn bg-transparent text-body font-semibold text-warn"
              >
                버리기
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div
          role="alert"
          className="fixed right-4 top-16 z-50 rounded-md bg-ink px-4 py-2.5 text-body text-white shadow-lg md:right-8 md:top-20"
        >
          {notice}
        </div>
      )}
    </AppShell>
  );
}
