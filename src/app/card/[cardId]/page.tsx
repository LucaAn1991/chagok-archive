"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Send,
  X,
} from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import type { Card } from "@/types";

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
  // 카드뉴스 미리보기 — 완성 PNG는 저장하지 않으므로(PLAN §9) 즉석 렌더 API에서 받는다
  const [slideUrls, setSlideUrls] = useState<string[]>([]);
  const [slideError, setSlideError] = useState(false);
  // 인스타 미리보기 모달 — 열려 있는 슬라이드 index (08-31)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
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

        /*
          슬라이드 이미지는 페이지를 막지 않는다 (09-01 버그 수정) — 8장 렌더를
          기다리느라 상세가 스켈레톤에 갇혔었다. 화면 먼저, 이미지는 뒤에서 채운다.
        */
        if (data.slides?.length) {
          void (async () => {
            try {
              const token = await user.getIdToken();
              for (let order = 0; order < data.slides.length; order++) {
                const res = await fetch(`/api/cards/${cardId}/slides/${order}/image`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) throw new Error();
                const url = URL.createObjectURL(await res.blob());
                setSlideUrls((prev) => [...prev, url]);
              }
            } catch {
              setSlideError(true);
            }
          })();
        }

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
      {/* 뒤로 — 진입 경로가 여럿(캘린더·홈·놓친 카드)이라 왔던 곳으로 돌아간다 */}
      <PageHeader fallbackHref="/" backLabel="돌아가기" />
      <div className="mt-3 flex flex-col gap-6">

        {/* 주제 + 상태 — 배지는 제목과 같은 라인 오른쪽 (08-31) */}
        <header className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="min-w-0 break-keep text-h3 font-bold text-ink">{card.title}</h1>
            <span className="mt-1 shrink-0">
              <StatusBadge status={card.status} />
            </span>
          </div>
          {overdue && (
            <p className="text-body text-sub">예정일이 지났어요. 날짜를 다시 잡아볼까요?</p>
          )}
        </header>

        {/* 기획 정보 — 세 줄 같은 높이(min-h-9)·중앙 정렬, 예정일 입력 때문에
            줄이 틀어지지 않게 (09-01). 기획의도는 상세에서만 노출 */}
        <section
          aria-label="기획 정보"
          className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-4"
        >
          <div className="flex min-h-9 items-center gap-3">
            <span className="w-16 shrink-0 text-label font-semibold text-sub">대상</span>
            <p className="min-w-0 break-keep text-body text-ink">{card.audience}</p>
          </div>
          <div className="flex min-h-9 items-center gap-3">
            <span className="w-16 shrink-0 text-label font-semibold text-sub">기획의도</span>
            <p className="min-w-0 break-keep text-body text-ink">{card.intent}</p>
          </div>
          <div className="flex min-h-9 items-center gap-3">
            <label htmlFor="scheduledDate" className="w-16 shrink-0 text-label font-semibold text-sub">
              예정일
            </label>
            <div className="flex items-center gap-2">
              <input
                id="scheduledDate"
                type="date"
                value={dateDraft}
                disabled={discarded}
                onChange={(e) => setDateDraft(e.target.value)}
                className="h-8 rounded-md border border-line bg-surface px-2.5 text-body text-ink"
              />
              {dateDraft !== card.scheduledDate && (
                <button
                  type="button"
                  onClick={saveScheduledDate}
                  disabled={savingDate}
                  className="h-8 rounded-md border-2 border-berry bg-surface px-3 text-body font-semibold text-berry disabled:border-line disabled:text-sub"
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

        {/* 카드뉴스 — 박스 없이 온보딩 취향 캐러셀처럼 큼직하게 넘겨본다 (08-31 v2).
            카드를 누르면 인스타 구성 그대로의 미리보기 모달 */}
        {card.slides.length > 0 && (
          <section aria-label="카드뉴스" className="flex flex-col gap-2">
            <span className="text-label font-semibold text-sub">
              카드뉴스 · {card.slides.length}장
            </span>
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
              {slideUrls.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setPreviewIndex(i)}
                  className="shrink-0 snap-start"
                  aria-label={`슬라이드 ${i + 1} 미리보기`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="aspect-square w-56 rounded-lg border border-line object-cover transition-transform duration-200 hover:scale-[1.02]"
                  />
                </button>
              ))}
              {!slideError &&
                slideUrls.length < card.slides.length &&
                Array.from({ length: card.slides.length - slideUrls.length }).map((_, i) => (
                  <div
                    key={`sk-${i}`}
                    className="aspect-square w-56 shrink-0 animate-pulse rounded-lg bg-surface-muted"
                  />
                ))}
            </div>
            {slideError && slideUrls.length === 0 && (
              <p className="text-caption text-sub">
                이미지를 불러오지 못했어요. 제작 결과 보기에서 다시 시도해주세요.
              </p>
            )}
          </section>
        )}

        {/* 캡션 미리보기 — 제작이 끝난 카드는 실제 게시물처럼: 본문 + #해시태그 (08-31).
            편집은 제작 결과 페이지의 몫, 여기는 보기 전용 */}
        {card.caption && (
          <section
            aria-label="캡션 미리보기"
            className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6"
          >
            <span className="text-label font-semibold text-sub">캡션</span>
            <p className="whitespace-pre-wrap break-keep text-body leading-relaxed text-ink">
              {card.caption.hook}
              {"\n\n"}
              {card.caption.body}
              {"\n\n"}
              {card.caption.cta}
            </p>
            {card.caption.hashtags.length > 0 && (
              <p className="break-keep text-body text-berry-dark">
                {card.caption.hashtags.map((tag) => `#${tag}`).join(" ")}
              </p>
            )}
          </section>
        )}

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
              {card.status === "planned" ? "콘텐츠 제작하기" : "캡션·카드뉴스 수정하기"}
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

        {/* 인스타 미리보기 — 실제 게시물과 같은 구성: 사진 1장 + 좌우 슬라이드 + 캡션·해시태그 (08-31) */}
        {previewIndex !== null && slideUrls[previewIndex] && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ig-preview-title"
            onClick={() => setPreviewIndex(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[92vh] w-full max-w-[400px] flex-col overflow-hidden rounded-xl bg-surface shadow-lg"
            >
              {/* 제목 바 — 이게 뭘 하는 화면인지 먼저 (09-01) */}
              <div className="flex items-center justify-between border-b border-line py-2 pl-4 pr-2">
                <h2 id="ig-preview-title" className="text-body font-semibold text-ink">
                  업로드 미리보기
                </h2>
                <button
                  type="button"
                  onClick={() => setPreviewIndex(null)}
                  aria-label="닫기"
                  className="flex size-9 items-center justify-center rounded-md text-sub hover:bg-surface-muted"
                >
                  <X size={18} aria-hidden />
                </button>
              </div>

              {/* 계정 줄 — 인스타 구성 재현 */}
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <span aria-hidden className="size-8 rounded-pill bg-berry-light" />
                <span className="text-body font-semibold text-ink">내 계정</span>
              </div>

              {/* 사진 — 한 장씩, 좌우로 넘긴다 */}
              <div className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slideUrls[previewIndex]}
                  alt={`슬라이드 ${previewIndex + 1}`}
                  className="aspect-square w-full object-cover"
                />
                {previewIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => setPreviewIndex(previewIndex - 1)}
                    aria-label="이전 슬라이드"
                    className="absolute left-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-pill bg-surface/90 text-ink shadow-sm hover:bg-surface"
                  >
                    <ChevronLeft size={18} aria-hidden />
                  </button>
                )}
                {previewIndex < slideUrls.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setPreviewIndex(previewIndex + 1)}
                    aria-label="다음 슬라이드"
                    className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-pill bg-surface/90 text-ink shadow-sm hover:bg-surface"
                  >
                    <ChevronRight size={18} aria-hidden />
                  </button>
                )}
              </div>

              {/* 위치 점 — 흰 슬라이드 위에선 안 보여서 실제 피드처럼 사진 아래에 (08-31) */}
              {slideUrls.length > 1 && (
                <div className="flex justify-center gap-1 pt-2.5">
                  {slideUrls.map((_, i) => (
                    <span
                      key={i}
                      aria-hidden
                      className={[
                        "size-1.5 rounded-pill",
                        i === previewIndex ? "bg-berry" : "bg-line",
                      ].join(" ")}
                    />
                  ))}
                </div>
              )}

              {/* 액션 아이콘 줄 — 구성 재현용, 동작은 없다 */}
              <div aria-hidden className="flex items-center gap-4 px-3 pt-2 text-ink">
                <Heart size={22} />
                <MessageCircle size={22} />
                <Send size={22} />
                <Bookmark size={22} className="ml-auto" />
              </div>

              {/* 캡션 + 해시태그 */}
              {card.caption && (
                <div className="min-h-0 overflow-y-auto px-3 pb-4 pt-2">
                  <p className="whitespace-pre-wrap break-keep text-body leading-relaxed text-ink">
                    <span className="font-semibold">내 계정</span> {card.caption.hook}
                    {"\n\n"}
                    {card.caption.body}
                    {"\n\n"}
                    {card.caption.cta}
                  </p>
                  {card.caption.hashtags.length > 0 && (
                    <p className="mt-2 break-keep text-body text-berry-dark">
                      {card.caption.hashtags.map((tag) => `#${tag}`).join(" ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
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
            className="fixed right-4 top-16 z-50 rounded-md bg-ink px-4 py-2.5 text-body text-white shadow-lg md:right-8 md:top-20"
          >
            {toast}
          </div>
        )}
      </div>
    </AppShell>
  );
}
