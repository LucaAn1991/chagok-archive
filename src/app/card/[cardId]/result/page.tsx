"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged, type User as AuthUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import type { Card } from "@/types";

/**
 * 제작 결과 (F7·F8) — 슬라이드 · 캡션.
 *
 * 아직 제작 전(slides 없음)이면 진입 즉시 생성 API를 부른다 —
 * skeleton 3장 → 준비된 슬라이드부터 순차 reveal (DESIGN.md §10).
 * 슬라이드 PNG는 저장돼 있지 않고 GET .../slides/[order]/image 가 즉석
 * 렌더링한다. <img>는 인증 헤더를 못 실으므로 fetch → blob URL로 표시한다.
 *
 * @TODO: 캡션·슬라이드 텍스트 부분 수정(PRD §5-7 «부분 수정이 기본») — 다음 단계
 * @TODO: 발행 의향 팝업(F9) 연결 — 발행 상태 관리 구현 시
 */

type Phase = "loading" | "generating" | "ready" | "error" | "not-found";

export default function CardResultPage() {
  const router = useRouter();
  const { cardId } = useParams<{ cardId: string }>();

  const [phase, setPhase] = useState<Phase>("loading");
  const [card, setCard] = useState<Card | null>(null);
  const [slideUrls, setSlideUrls] = useState<string[]>([]);
  const [isMock, setIsMock] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const userRef = useRef<AuthUser | null>(null);

  /** 슬라이드 PNG를 순서대로 받아 하나씩 공개한다 */
  const fetchSlideImages = useCallback(
    async (slideCount: number, token: string) => {
      setSlideUrls([]);
      for (let order = 0; order < slideCount; order++) {
        const res = await fetch(`/api/cards/${cardId}/slides/${order}/image`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`슬라이드 ${order + 1}`);
        const url = URL.createObjectURL(await res.blob());
        setSlideUrls((prev) => [...prev, url]);
      }
    },
    [cardId],
  );

  /** 캡션 + 슬라이드 구성 생성 → 이미지 로드 */
  const generate = useCallback(async () => {
    const user = userRef.current;
    if (!user) return;
    setPhase("generating");
    setErrorMessage(null);

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

      // 생성 결과가 반영된 카드를 다시 읽는다
      const snap = await getDoc(doc(db, "cards", cardId));
      const fresh = snap.data() as Card | undefined;
      if (!fresh) throw new Error("카드를 찾을 수 없어요.");
      setCard(fresh);

      setPhase("ready");
      await fetchSlideImages(renderData.slides.length, token);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "생성에 실패했어요.");
      setPhase("error");
    }
  }, [cardId, fetchSlideImages]);

  /** 진입: 로그인 확인 → 카드 로드 → 제작 여부에 따라 분기 */
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

        if (data.slides.length > 0 && data.caption) {
          setPhase("ready");
          await fetchSlideImages(data.slides.length, await user.getIdToken());
        } else {
          await generate();
        }
      } catch {
        setErrorMessage("카드를 불러오지 못했어요.");
        setPhase("error");
      }
    });
    return unsubscribe;
  }, [cardId, router, generate, fetchSlideImages]);

  /** blob URL 정리 */
  useEffect(() => {
    return () => {
      slideUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [slideUrls]);

  if (phase === "not-found") {
    return (
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col items-center justify-center gap-3 p-4">
        <h1 className="text-title font-bold">카드를 찾을 수 없어요</h1>
        <Link href="/" className="text-body text-berry-dark underline underline-offset-4">
          홈으로 돌아가기
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-6 p-4 pb-16">
      <header className="flex flex-col gap-1 pt-4">
        <h1 className="text-h3 font-bold text-ink">제작 결과</h1>
        {card && <p className="text-body text-sub">{card.title}</p>}
        {isMock && (
          <p className="mt-1 self-start rounded-pill bg-surface-muted px-3 py-1 text-caption text-sub">
            개발용 샘플 모드 — AI 연동 전이라 자리 표시 문구로 생성됐어요
          </p>
        )}
      </header>

      {/* 슬라이드 영역 */}
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
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
            {(phase === "ready" && card ? card.slides : []).map((slide, i) =>
              slideUrls[i] ? (
                /* eslint-disable-next-line @next/next/no-img-element -- blob URL은 next/image 최적화 대상이 아니다 */
                <img
                  key={slide.order}
                  src={slideUrls[i]}
                  alt={`슬라이드 ${i + 1}`}
                  className="aspect-square w-72 shrink-0 snap-start rounded-lg border border-line bg-surface object-cover"
                />
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
        )}
      </section>

      {/* 캡션 영역 */}
      {phase === "ready" && card?.caption && (
        <section aria-label="캡션" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-6">
          <div className="flex flex-col gap-1">
            <span className="text-label font-semibold text-sub">Hook</span>
            <p className="text-body-l font-medium text-ink">{card.caption.hook}</p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-label font-semibold text-sub">본문</span>
            <p className="whitespace-pre-line text-body text-ink">{card.caption.body}</p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-label font-semibold text-sub">CTA</span>
            <p className="text-body text-ink">{card.caption.cta}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {card.caption.hashtags.map((tag) => (
              <span
                key={tag}
                className="rounded-pill border border-line bg-surface px-3 py-1 text-caption text-sub"
              >
                #{tag}
              </span>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
