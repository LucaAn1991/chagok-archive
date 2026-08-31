"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged, type User as AuthUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import AppShell from "@/components/AppShell";
import BackLink from "@/components/BackLink";
import StockAttribution from "@/components/StockAttribution";
import type { Card, Caption } from "@/types";

/**
 * 제작 결과 (F7·F8) — 슬라이드 · 캡션 · 부분 수정.
 *
 * - 제작 전 카드면 진입 즉시 생성 — skeleton → 순차 reveal (DESIGN.md §10)
 * - 슬라이드 PNG는 GET .../slides/[order]/image 가 즉석 렌더링. fetch + blob URL
 * - 수정은 «부분 수정이 기본»(PRD §5-7) — 캡션·슬라이드 문구를 인라인으로 고쳐
 *   PATCH .../content 로 저장한다. 글자 «내용»만 수정 가능 (DESIGN.md §12)
 *
 * @TODO: 슬라이드 순서·개수 변경, 레이아웃 선택, 사진 교체 — 다음 단계
 * @TODO: 발행 의향 팝업(F9) 연결 — 발행 상태 관리 구현 시
 */

type Phase = "loading" | "generating" | "ready" | "error" | "not-found";

/** 슬라이드 텍스트 슬롯의 한국어 라벨. 없는 키는 키 이름 그대로 보여준다 */
const SLOT_LABELS: Record<string, string> = {
  title: "제목",
  subtitle: "부제",
  body: "본문",
  message: "메시지",
  cta: "마무리 문구",
  item1: "항목 1",
  item2: "항목 2",
  item3: "항목 3",
  item4: "항목 4",
};

export default function CardResultPage() {
  const router = useRouter();
  const { cardId } = useParams<{ cardId: string }>();

  const [phase, setPhase] = useState<Phase>("loading");
  const [card, setCard] = useState<Card | null>(null);
  const [slideUrls, setSlideUrls] = useState<string[]>([]);
  const [isMock, setIsMock] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const userRef = useRef<AuthUser | null>(null);

  /* 편집 상태 */
  const [captionDraft, setCaptionDraft] = useState<Caption | null>(null);
  const [hashtagInput, setHashtagInput] = useState("");
  const [selectedSlide, setSelectedSlide] = useState<number | null>(null);
  const [slideDraft, setSlideDraft] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* blob URL은 언마운트 때만 해제한다 — 표시 중인 URL을 해제하면 이미지가 깨진다 */
  const urlsRef = useRef<string[]>([]);
  useEffect(() => {
    urlsRef.current = slideUrls;
  }, [slideUrls]);
  useEffect(() => {
    return () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const captionDirty =
    card?.caption && captionDraft
      ? JSON.stringify(card.caption) !== JSON.stringify(captionDraft)
      : false;

  const slideDirty =
    selectedSlide !== null && slideDraft && card
      ? JSON.stringify(card.slides.find((s) => s.order === selectedSlide)?.texts) !==
        JSON.stringify(slideDraft)
      : false;

  function showSavedToast() {
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  }

  /** 슬라이드 1장 PNG 로드. fresh=true면 브라우저 캐시를 우회한다(문구 수정 직후) */
  const fetchSlideImage = useCallback(
    async (order: number, token: string, fresh = false): Promise<string> => {
      const res = await fetch(`/api/cards/${cardId}/slides/${order}/image`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: fresh ? "reload" : "default",
      });
      if (!res.ok) throw new Error(`슬라이드 ${order + 1}`);
      return URL.createObjectURL(await res.blob());
    },
    [cardId],
  );

  /** 전체 슬라이드를 순서대로 받아 하나씩 공개 */
  const fetchAllSlideImages = useCallback(
    async (slideCount: number, token: string) => {
      setSlideUrls([]);
      for (let order = 0; order < slideCount; order++) {
        const url = await fetchSlideImage(order, token);
        setSlideUrls((prev) => [...prev, url]);
      }
    },
    [fetchSlideImage],
  );

  /** 캡션 + 슬라이드 구성 생성 → 이미지 로드 */
  const generate = useCallback(async () => {
    const user = userRef.current;
    if (!user) return;
    setPhase("generating");
    setErrorMessage(null);
    setSelectedSlide(null);
    setSlideDraft(null);

    try {
      const token = await user.getIdToken();
      const authHeader = { Authorization: `Bearer ${token}` };

      const [captionRes, renderRes] = await Promise.all([
        fetch(`/api/cards/${cardId}/caption`, { method: "POST", headers: authHeader }),
        fetch(`/api/cards/${cardId}/render`, { method: "POST", headers: authHeader }),
      ]);
      if (!captionRes.ok || !renderRes.ok) {
        const failed = !captionRes.ok ? captionRes : renderRes;
        const body = (await failed.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "생성에 실패했어요.");
      }

      const captionData = (await captionRes.json()) as { mock?: boolean };
      const renderData = (await renderRes.json()) as { slides: unknown[]; mock?: boolean };
      setIsMock(Boolean(captionData.mock || renderData.mock));

      const snap = await getDoc(doc(db, "cards", cardId));
      const fresh = snap.data() as Card | undefined;
      if (!fresh) throw new Error("카드를 찾을 수 없어요.");
      setCard(fresh);
      setCaptionDraft(fresh.caption);

      setPhase("ready");
      await fetchAllSlideImages(renderData.slides.length, token);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "생성에 실패했어요.");
      setPhase("error");
    }
  }, [cardId, fetchAllSlideImages]);

  /** 진입: 로그인 확인 → 카드 로드 → 제작 여부 분기 */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      userRef.current = user;

      try {
        const snap = await getDoc(doc(db, "cards", cardId));
        const data = snap.data() as Card | undefined;
        if (!data || data.userId !== user.uid) {
          setPhase("not-found");
          return;
        }
        setCard(data);
        setCaptionDraft(data.caption);

        if (data.slides.length > 0 && data.caption) {
          setPhase("ready");
          await fetchAllSlideImages(data.slides.length, await user.getIdToken());
        } else {
          await generate();
        }
      } catch {
        setErrorMessage("카드를 불러오지 못했어요.");
        setPhase("error");
      }
    });
    return unsubscribe;
  }, [cardId, router, generate, fetchAllSlideImages]);

  /** PATCH /content 공통 저장 */
  const saveContent = useCallback(
    async (payload: Record<string, unknown>): Promise<Card | null> => {
      const user = userRef.current;
      if (!user) return null;
      setSaving(true);
      setSaveError(null);
      try {
        const res = await fetch(`/api/cards/${cardId}/content`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${await user.getIdToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "저장하지 못했어요.");
        }
        const data = (await res.json()) as Pick<Card, "caption" | "slides">;
        const next = card ? { ...card, ...data } : null;
        if (next) setCard(next);
        showSavedToast();
        return next;
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "저장하지 못했어요.");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [card, cardId],
  );

  async function saveCaption() {
    if (!captionDraft) return;
    const next = await saveContent({ caption: captionDraft });
    if (next) setCaptionDraft(next.caption);
  }

  async function saveSlideTexts() {
    if (selectedSlide === null || !slideDraft) return;
    const next = await saveContent({ slides: [{ order: selectedSlide, texts: slideDraft }] });
    if (!next) return;

    // 문구가 바뀌었으니 그 슬라이드만 다시 렌더링해서 교체한다
    const user = userRef.current;
    if (!user) return;
    try {
      const url = await fetchSlideImage(selectedSlide, await user.getIdToken(), true);
      setSlideUrls((prev) => prev.map((u, i) => (i === selectedSlide ? url : u)));
    } catch {
      /* 이미지 갱신 실패는 다음 진입 때 다시 그려진다 — 저장 자체는 성공 */
    }
  }

  function selectSlide(order: number) {
    if (!card) return;
    if (selectedSlide === order) {
      setSelectedSlide(null);
      setSlideDraft(null);
      return;
    }
    setSelectedSlide(order);
    setSlideDraft({ ...card.slides.find((s) => s.order === order)?.texts });
  }

  function addHashtag() {
    const tag = hashtagInput.trim().replace(/^#/, "");
    if (!tag || !captionDraft) return;
    if (!captionDraft.hashtags.includes(tag)) {
      setCaptionDraft({ ...captionDraft, hashtags: [...captionDraft.hashtags, tag] });
    }
    setHashtagInput("");
  }

  if (phase === "not-found") {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center gap-3 py-16">
        <h1 className="text-title font-bold">카드를 찾을 수 없어요</h1>
        <Link href="/" className="text-body text-berry-dark underline underline-offset-4">
          홈으로 돌아가기
        </Link>
      </div>
      </AppShell>
    );
  }

  const inputClass =
    "w-full rounded-md border border-line bg-surface px-3 py-2 text-body text-ink";

  return (
    <AppShell>
      <BackLink fallbackHref="/">돌아가기</BackLink>
      <div className="mt-3 flex flex-col gap-6">
      <header className="flex flex-col gap-1 pt-4">
        <h1 className="text-h3 font-bold text-ink">제작 결과</h1>
        {card && <p className="text-body text-sub">{card.title}</p>}
        {isMock && (
          <p className="mt-1 self-start rounded-pill bg-surface-muted px-3 py-1 text-caption text-sub">
            개발용 샘플 모드 — AI 연동 전이라 자리 표시 문구로 생성됐어요
          </p>
        )}
      </header>

      {/* 슬라이드 */}
      <section aria-label="카드뉴스 슬라이드" className="flex flex-col gap-3">
        {phase === "generating" && (
          <p className="text-body text-purple">✦ 차곡이 카드마다 메시지와 이미지를 맞추고 있어요</p>
        )}

        {phase === "error" ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface p-6">
            <p className="text-body text-ink">{errorMessage}</p>
            <button
              type="button"
              onClick={generate}
              className="h-11 rounded-md border-2 border-berry bg-surface px-5 text-body font-semibold text-berry"
            >
              다시 만들기
            </button>
          </div>
        ) : (
          <>
            <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
              {(phase === "ready" && card ? card.slides : []).map((slide, i) =>
                slideUrls[i] ? (
                  <button
                    key={slide.order}
                    type="button"
                    onClick={() => selectSlide(slide.order)}
                    aria-pressed={selectedSlide === slide.order}
                    className={`shrink-0 snap-start rounded-lg ${
                      selectedSlide === slide.order
                        ? "outline outline-2 outline-offset-2 outline-berry"
                        : ""
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- blob URL은 next/image 대상이 아니다 */}
                    <img
                      src={slideUrls[i]}
                      alt={`슬라이드 ${i + 1} — 누르면 문구를 수정할 수 있어요`}
                      className="aspect-square w-72 rounded-lg border border-line bg-surface object-cover"
                    />
                  </button>
                ) : (
                  <div
                    key={slide.order}
                    className="aspect-square w-72 shrink-0 animate-pulse rounded-lg bg-surface-muted"
                  />
                ),
              )}
              {(phase === "loading" || phase === "generating") &&
                [0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="aspect-square w-72 shrink-0 animate-pulse rounded-lg bg-surface-muted"
                  />
                ))}
            </div>
            {phase === "ready" && selectedSlide === null && (
              <p className="text-caption text-sub">슬라이드를 누르면 문구를 수정할 수 있어요.</p>
            )}
            {phase === "ready" && card && <StockAttribution slides={card.slides} />}
          </>
        )}

        {/* 선택한 슬라이드 문구 편집 */}
        {selectedSlide !== null && slideDraft && (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
            <h2 className="text-body font-semibold text-ink">
              슬라이드 {selectedSlide + 1} 문구 수정
            </h2>
            {Object.entries(slideDraft).map(([key, value]) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-label font-semibold text-sub">
                  {SLOT_LABELS[key] ?? key}
                </span>
                <textarea
                  value={value}
                  rows={value.length > 40 ? 3 : 1}
                  onChange={(e) => setSlideDraft({ ...slideDraft, [key]: e.target.value })}
                  className={inputClass}
                />
              </label>
            ))}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={saveSlideTexts}
                disabled={!slideDirty || saving}
                className="h-11 rounded-md bg-berry px-5 text-body font-semibold text-white
                           hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
              >
                {saving ? "···" : "저장"}
              </button>
              <button
                type="button"
                onClick={() => selectSlide(selectedSlide)}
                className="text-body text-sub"
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 캡션 편집 */}
      {phase === "ready" && captionDraft && (
        <section aria-label="캡션" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-6">
          <label className="flex flex-col gap-1">
            <span className="text-label font-semibold text-sub">Hook</span>
            <textarea
              value={captionDraft.hook}
              rows={1}
              onChange={(e) => setCaptionDraft({ ...captionDraft, hook: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label font-semibold text-sub">본문</span>
            <textarea
              value={captionDraft.body}
              rows={4}
              onChange={(e) => setCaptionDraft({ ...captionDraft, body: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label font-semibold text-sub">CTA</span>
            <textarea
              value={captionDraft.cta}
              rows={1}
              onChange={(e) => setCaptionDraft({ ...captionDraft, cta: e.target.value })}
              className={inputClass}
            />
          </label>

          {/* 해시태그 — 삭제형 칩 (DESIGN.md §6) */}
          <div className="flex flex-col gap-2">
            <span className="text-label font-semibold text-sub">해시태그</span>
            <div className="flex flex-wrap items-center gap-2">
              {captionDraft.hashtags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-pill border border-line bg-surface px-3 py-1 text-caption text-sub"
                >
                  #{tag}
                  <button
                    type="button"
                    aria-label={`${tag} 삭제`}
                    onClick={() =>
                      setCaptionDraft({
                        ...captionDraft,
                        hashtags: captionDraft.hashtags.filter((t) => t !== tag),
                      })
                    }
                    className="text-sub"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={hashtagInput}
                onChange={(e) => setHashtagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addHashtag();
                  }
                }}
                placeholder="추가하고 Enter"
                className="h-8 w-36 rounded-pill border border-line bg-surface px-3 text-caption text-ink"
              />
            </div>
          </div>

          {saveError && (
            <p role="alert" className="text-body text-ink">
              {saveError}
            </p>
          )}

          {captionDirty && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={saveCaption}
                disabled={saving}
                className="h-11 rounded-md bg-berry px-5 text-body font-semibold text-white
                           hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
              >
                {saving ? "···" : "저장"}
              </button>
              <button
                type="button"
                onClick={() => card && setCaptionDraft(card.caption)}
                className="text-body text-sub"
              >
                되돌리기
              </button>
            </div>
          )}
        </section>
      )}

      {/* 저장 토스트 (DESIGN.md §13) */}
      {savedToast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-pill bg-ink px-5 py-2 text-body text-white shadow-lg"
        >
          저장됐어요.
        </div>
      )}
    </div>
      </AppShell>
  );
}
