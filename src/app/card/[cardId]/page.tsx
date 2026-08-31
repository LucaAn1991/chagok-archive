"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { MoreHorizontal } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import AppShell from "@/components/AppShell";
import BackLink from "@/components/BackLink";
import type { Card, CardStatus } from "@/types";

/**
 * 카드 상세 (F6) — 기획 정보 확인 · 제작 진입.
 *
 * - 기획의도는 목록 카드에서 숨기고 **여기서만** 노출한다 (DESIGN.md §6)
 * - 원 plan이 삭제됐으면 출처 링크를 숨긴다 (PLAN.md §3-1)
 * - 예정일 변경·버리기는 보안 규칙이 클라이언트 쓰기를 허용하는 필드라
 *   Firestore SDK로 직접 쓴다. 버리기는 삭제가 아니다 — status만 바뀐다 (DESIGN.md §11)
 * - overdue는 상태가 아니라 계산해서 표시만 한다
 *
 * @TODO: 주제·대상 등 기획 정보 «수정»은 PATCH /api/cards/[cardId] 구현 시
 */

type Phase = "loading" | "ready" | "not-found" | "error";

const STATUS_LABELS: Record<CardStatus, string> = {
  planned: "제작 대기",
  pending: "업로드 대기",
  published: "발행 완료",
  discarded: "버림",
};

/** 상태 배지 색 — 명도 계단 (DESIGN.md §2). 색만으로 구분하지 않고 라벨 병행 (§15) */
const STATUS_DOT_CLASS: Record<CardStatus, string> = {
  planned: "bg-st-planned",
  pending: "bg-st-pending",
  published: "bg-st-published",
  discarded: "bg-st-discarded",
};

export default function CardDetailPage() {
  const router = useRouter();
  const { cardId } = useParams<{ cardId: string }>();

  const [phase, setPhase] = useState<Phase>("loading");
  const [card, setCard] = useState<Card | null>(null);
  const [planExists, setPlanExists] = useState(false);
  const [dateDraft, setDateDraft] = useState("");
  const [savingDate, setSavingDate] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // ··· 더 보기 (버리기가 산다)
  const [discarding, setDiscarding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      try {
        const snap = await getDoc(doc(db, "cards", cardId));
        const data = snap.data() as Card | undefined;
        if (!data || data.userId !== user.uid) {
          setPhase("not-found");
          return;
        }
        setCard(data);
        setDateDraft(data.scheduledDate);

        // 원 기획 세션이 있어야만 출처 링크를 보여준다
        if (data.planId) {
          const planSnap = await getDoc(doc(db, "plans", data.planId)).catch(() => null);
          setPlanExists(Boolean(planSnap?.exists()));
        }
        setPhase("ready");
      } catch {
        setPhase("error");
      }
    });
    return unsubscribe;
  }, [cardId, router]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  }

  async function saveScheduledDate() {
    if (!card || !dateDraft || dateDraft === card.scheduledDate) return;
    setSavingDate(true);
    setActionError(null);
    try {
      await updateDoc(doc(db, "cards", cardId), { scheduledDate: dateDraft });
      setCard({ ...card, scheduledDate: dateDraft });
      showToast("일정이 변경됐어요.");
    } catch {
      setDateDraft(card.scheduledDate); // 실패 → 원위치 + Toast (PLAN.md §3-1)
      showToast("일정을 바꾸지 못했어요. 다시 시도해주세요.");
    } finally {
      setSavingDate(false);
    }
  }

  async function discardCard() {
    if (!card) return;
    setDiscarding(true);
    setActionError(null);
    try {
      await updateDoc(doc(db, "cards", cardId), { status: "discarded" });
      router.replace("/");
    } catch {
      setDiscardOpen(false);
      setActionError("카드를 버리지 못했어요. 다시 시도해주세요.");
    } finally {
      setDiscarding(false);
    }
  }

  if (phase === "loading") {
    return (
      <AppShell>
        <div aria-hidden className="flex flex-col gap-4">
          <div className="h-6 w-24 animate-pulse rounded-pill bg-surface-muted" />
          <div className="h-8 w-3/4 animate-pulse rounded-md bg-surface-muted" />
          <div className="h-40 animate-pulse rounded-lg bg-surface-muted" />
        </div>
      </AppShell>
    );
  }

  if (phase === "not-found" || phase === "error" || !card) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <h1 className="text-title font-bold">
            {phase === "error" ? "카드를 불러오지 못했어요" : "카드를 찾을 수 없어요"}
          </h1>
          <Link href="/" className="text-body text-berry-dark underline underline-offset-4">
            홈으로 돌아가기
          </Link>
        </div>
      </AppShell>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const overdue = card.scheduledDate < today && card.status !== "published";
  const discarded = card.status === "discarded";

  return (
    <AppShell>
      <BackLink fallbackHref="/">돌아가기</BackLink>

      <div className="mt-3 flex flex-col gap-6">
      {/* 상태 + 주제 */}
      <header className="flex flex-col gap-3">
        <span className="flex items-center gap-2 self-start rounded-pill border border-line bg-surface px-3 py-1 text-caption font-semibold text-ink">
          <span aria-hidden className={`h-2 w-2 rounded-pill ${STATUS_DOT_CLASS[card.status]}`} />
          {STATUS_LABELS[card.status]}
        </span>
        <h1 className="text-h3 font-bold text-ink">{card.title}</h1>
        {overdue && (
          <p className="text-body text-sub">예정일이 지났어요. 날짜를 다시 잡아볼까요?</p>
        )}
      </header>

      {/* 기획 정보 — 기획의도는 상세에서만 노출 */}
      <section aria-label="기획 정보" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-6">
        <div className="flex flex-col gap-1">
          <span className="text-label font-semibold text-sub">대상</span>
          <p className="text-body text-ink">{card.audience}</p>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-label font-semibold text-sub">기획의도</span>
          <p className="text-body text-ink">{card.intent}</p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="scheduledDate" className="text-label font-semibold text-sub">
            예정일
          </label>
          <div className="flex items-center gap-2">
            <input
              id="scheduledDate"
              type="date"
              value={dateDraft}
              disabled={discarded}
              onChange={(e) => setDateDraft(e.target.value)}
              className="h-11 rounded-md border border-line bg-surface px-3 text-body text-ink"
            />
            {dateDraft !== card.scheduledDate && (
              <button
                type="button"
                onClick={saveScheduledDate}
                disabled={savingDate}
                className="h-11 rounded-md border-2 border-berry bg-surface px-4 text-body font-semibold text-berry disabled:border-line disabled:text-sub"
              >
                {savingDate ? "···" : "날짜 저장"}
              </button>
            )}
          </div>
        </div>
        {planExists && (
          <Link
            href={`/plan/${card.planId}`}
            className="self-start text-body text-berry-dark underline underline-offset-4"
          >
            이 카드가 나온 기획 보기
          </Link>
        )}
      </section>

      {actionError && (
        <p role="alert" className="text-body text-ink">
          {actionError}
        </p>
      )}

      {/* 행동 — primary는 한 화면에 1개 (DESIGN.md §6).
          파괴적 액션(버리기)은 primary와 같은 크기로 전시하지 않는다 — ··· 메뉴 속으로 (08-31) */}
      {!discarded && (
        <section className="flex flex-col gap-3">
          <Link
            href={`/card/${cardId}/result`}
            className="flex h-12 items-center justify-center rounded-md bg-berry text-[15px] font-semibold text-white hover:bg-berry-dark"
          >
            {card.status === "planned" ? "콘텐츠 제작하기" : "제작 결과 보기"}
          </Link>
          <div className="flex items-center justify-between">
            <Link
              href={`/card/${cardId}/materials`}
              className="flex h-11 items-center rounded-md border-2 border-berry bg-surface px-4 text-body font-semibold text-berry hover:bg-berry-light hover:text-berry-dark"
            >
              사진·문구 추가하기
            </Link>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="더 보기"
                aria-expanded={menuOpen}
                className="flex size-11 items-center justify-center rounded-md border border-line text-sub hover:bg-surface-muted"
              >
                <MoreHorizontal size={20} aria-hidden />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-12 z-10 w-40 rounded-md border border-line bg-surface p-1 shadow-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setDiscardOpen(true);
                    }}
                    className="flex h-10 w-full items-center rounded-[4px] px-3 text-body text-warn hover:bg-surface-muted"
                  >
                    카드 버리기
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {discarded && (
        <p className="text-body text-sub">
          버린 카드예요. 목록에는 보이지 않지만 기록에는 남아 있어요.
        </p>
      )}

      {/* 버리기 확인 모달 — 되돌릴 수 없는 행동에만 (DESIGN.md §13) */}
      {discardOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="discard-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
        >
          <div className="flex w-full max-w-[400px] flex-col gap-4 rounded-xl bg-surface p-6 shadow-lg">
            <h2 id="discard-title" className="text-title font-bold text-ink">
              이 카드를 버릴까요?
            </h2>
            <p className="text-body text-sub">
              버린 카드는 되돌릴 수 없어요. 삭제되는 건 아니고, 계획했던 기록으로 남아요.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDiscardOpen(false)}
                className="h-11 flex-1 rounded-md border border-line bg-surface text-body font-semibold text-ink"
              >
                취소
              </button>
              <button
                type="button"
                onClick={discardCard}
                disabled={discarding}
                className="h-11 flex-1 rounded-md border border-warn bg-transparent text-body font-semibold text-warn disabled:border-line disabled:text-sub"
              >
                {discarding ? "···" : "버리기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-pill bg-ink px-5 py-2 text-body text-white shadow-lg"
        >
          {toast}
        </div>
      )}
      </div>
    </AppShell>
  );
}
