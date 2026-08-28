"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Check } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import InlineAlert from "@/components/InlineAlert";
import type { LayoutId } from "@/types";

/**
 * 온보딩 — 2단계 (F1 · 08-28 재구성, PLAN 변경 이력).
 * ① 콘텐츠 방향(서술형) + 업로드 빈도(주기+요일)  ② 게시물 취향 템플릿 선택.
 * 말투·피할 표현은 설정-콘텐츠에서.
 *
 * 활동 «업종»이 아니라 «콘텐츠 방향»을 받는다 — 질문 문구가 그래서
 * 「어떤 콘텐츠를 만들고 싶으세요?」다 (08-28 확정).
 *
 * 끝나면 곧바로 «첫 콘텐츠를 같이 정해볼까요?»로 홈 상태 A (PRD §5-2).
 * 중간 이탈 시 저장하지 않는다 (PLAN §3). onboardedAt은 서버만 쓴다.
 */

const FREQUENCIES = [1, 2, 3, 4, 5, 6, 7] as const;
const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"]; // index = 저장값 (0=월 … 6=일)

const FIELD_PLACEHOLDER = [
  "예) 홈트레이닝 루틴과 운동 기록을 공유하고 싶어요.",
  "뷰티 제품을 직접 써본 후기를 올리고 싶어요.",
].join("\n");

/**
 * 취향 템플릿 3종 — 이름은 PLAN §2-3 확정 레이아웃(text-only·image-full·list)에서.
 * @TODO: DESIGN.md §18 «카드뉴스 레이아웃 6종의 실제 시안» 확정 시 목업 교체
 */
const STYLE_OPTIONS: { id: LayoutId; label: string }[] = [
  { id: "text-only", label: "텍스트 중심" },
  { id: "image-full", label: "이미지 중심" },
  { id: "list", label: "리스트 정리형" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "form">("loading");
  const [step, setStep] = useState<1 | 2>(1);
  const [field, setField] = useState("");
  const [frequency, setFrequency] = useState<number | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [style, setStyle] = useState<LayoutId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 가드 — 비로그인은 로그인으로, 이미 완료한 사람은 홈으로
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists() && snap.data().onboardedAt != null) {
          router.replace("/");
          return;
        }
      } catch {
        // 읽기 실패 — 문서가 없어도 서버가 만들어주므로 폼으로 진행
      }
      setPhase("form");
    });
    return unsubscribe;
  }, [router]);

  /** 주기 선택 — 매일(7)이면 요일 전체 자동 선택, 아니면 처음부터 다시 고른다 */
  function selectFrequency(n: number) {
    setFrequency(n);
    setDays(n === 7 ? [0, 1, 2, 3, 4, 5, 6] : []);
    setError(null);
  }

  /** 요일 토글 — 주기 개수까지만. 매일은 손대지 않는다 */
  function toggleDay(d: number) {
    if (frequency == null || frequency === 7) return;
    setError(null);
    setDays((prev) => {
      if (prev.includes(d)) return prev.filter((v) => v !== d);
      if (prev.length >= frequency) return prev; // 개수 초과 — 무시
      return [...prev, d].sort();
    });
  }

  /** 1단계 검증 → 2단계로 */
  function goToStep2() {
    const trimmed = field.trim();
    if (!trimmed) {
      setError("만들고 싶은 콘텐츠를 적어주세요.");
      return;
    }
    if (frequency == null) {
      setError("주기를 골라주세요.");
      return;
    }
    if (days.length !== frequency) {
      setError(`요일을 ${frequency}개 골라주세요.`);
      return;
    }
    setError(null);
    setStep(2);
  }

  async function handleSubmit() {
    if (submitting) return;
    if (style == null) {
      setError("마음에 드는 템플릿을 골라주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) {
        router.replace("/login");
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          field: field.trim(),
          uploadFrequency: frequency,
          uploadDays: days,
          preferredLayout: style,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "저장하지 못했어요. 잠시 후 다시 시도해주세요.");
        setSubmitting(false);
        return;
      }
      router.replace("/"); // 홈 상태 A — 첫 아이디어 말하기 (PRD §5-2)
    } catch {
      setError("네트워크 연결을 확인해주세요.");
      setSubmitting(false);
    }
  }

  if (phase === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center p-4">
        <p className="text-body text-sub">불러오는 중…</p>
      </main>
    );
  }

  const daily = frequency === 7;

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-[560px]">
        {step === 1 ? (
          <>
            <h1 className="text-h2 font-bold text-ink">거의 다 됐어요</h1>
            {/* 60초 — PRD §5-2 확정값 */}
            <p className="mt-2 text-body text-sub">
              콘텐츠 준비에 필요한 것만 알려주세요. 60초면 충분해요.
            </p>

            <div className="mt-8 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label htmlFor="field" className="text-body font-semibold text-ink">
                  어떤 콘텐츠를 만들고 싶으세요?
                </label>
                <textarea
                  id="field"
                  rows={3}
                  value={field}
                  onChange={(e) => {
                    setField(e.target.value);
                    setError(null);
                  }}
                  placeholder={FIELD_PLACEHOLDER}
                  maxLength={200}
                  className="w-full resize-none rounded-md border border-line bg-surface px-4 py-3
                             text-body leading-[1.6] text-ink placeholder:text-sub/60"
                />
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-body font-semibold text-ink">
                  일주일에 몇 번 올리는 걸 목표로 하시나요?
                </p>

                {/* 주기 — 한 줄 배치. 테두리 두께가 바뀌면 칸이 흔들려서 두 상태 모두 2px */}
                <p className="mt-1 text-caption text-sub">주기</p>
                <div className="flex gap-1.5">
                  {FREQUENCIES.map((n) => {
                    const selected = frequency === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => selectFrequency(n)}
                        aria-pressed={selected}
                        className={[
                          "h-10 flex-1 rounded-pill border-2 text-body font-semibold",
                          selected
                            ? "border-berry bg-berry-light text-berry-dark"
                            : "border-line bg-surface text-ink",
                        ].join(" ")}
                      >
                        {n === 7 ? "매일" : `주 ${n}회`}
                      </button>
                    );
                  })}
                </div>

                {/* 요일 — 주기를 고르면 나타난다 */}
                {frequency != null && (
                  <>
                    <p className="mt-3 text-caption text-sub">
                      {daily
                        ? "요일 — 매일이라 전부 선택했어요"
                        : `요일 — ${frequency}개를 골라주세요`}
                    </p>
                    <div className="flex gap-1.5">
                      {DAY_LABELS.map((label, d) => {
                        const selected = days.includes(d);
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => toggleDay(d)}
                            aria-pressed={selected}
                            disabled={daily}
                            className={[
                              "flex h-10 flex-1 items-center justify-center gap-1 rounded-pill",
                              "border-2 text-body font-semibold",
                              selected
                                ? "border-berry bg-berry-light text-berry-dark"
                                : "border-line bg-surface text-ink",
                              daily ? "cursor-default" : "",
                            ].join(" ")}
                          >
                            {selected && <Check size={14} aria-hidden />}
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {error && <InlineAlert>{error}</InlineAlert>}

              <button
                type="button"
                onClick={goToStep2}
                className="h-12 rounded-md bg-berry text-[15px] font-semibold text-white
                           hover:bg-berry-dark"
              >
                내 취향도 알려줄게요
              </button>

              <p className="text-center text-caption text-sub">
                입력한 내용은 나중에 설정에서 언제든 바꿀 수 있어요.
              </p>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-h2 font-bold text-ink">어떤 스타일이 제일 마음에 드세요?</h1>
            <p className="mt-2 text-body text-sub">
              고른 취향은 카드뉴스를 만들 때 참고해요.
            </p>

            {/* 게시물 취향 — 가로 스크롤 캐러셀 (샘플이 늘어나도 그대로) */}
            <div className="mt-8 flex snap-x gap-3 overflow-x-auto pb-2">
              {STYLE_OPTIONS.map(({ id, label }) => {
                const selected = style === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setStyle(id);
                      setError(null);
                    }}
                    aria-pressed={selected}
                    className={[
                      "w-[170px] shrink-0 snap-start rounded-lg border-2 bg-surface p-3 text-left",
                      selected ? "border-berry" : "border-line",
                    ].join(" ")}
                  >
                    <StylePreview id={id} />
                    <span className="mt-2 flex items-center gap-1 text-body font-semibold text-ink">
                      {selected && <Check size={16} className="text-berry" aria-hidden />}
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

            {error && <InlineAlert>{error}</InlineAlert>}

            <div className="mt-6 flex flex-col gap-3">
              {/* PRD §5-2 — 온보딩이 끝나는 자리의 확정 문구 */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="h-12 rounded-md bg-berry text-[15px] font-semibold text-white
                           hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
              >
                {submitting ? "···" : "첫 콘텐츠를 같이 정해볼까요?"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError(null);
                }}
                className="text-body text-sub hover:text-ink"
              >
                ← 이전으로
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

/**
 * 스타일 미리보기 — 토큰 색으로만 그린 임시 목업 (4:5).
 * @TODO: 레이아웃 6종 실제 시안 확정 시 교체 (DESIGN.md §18)
 */
function StylePreview({ id }: { id: LayoutId }) {
  return (
    <span className="flex aspect-[4/5] flex-col justify-center gap-1.5 rounded-md bg-berry-tint p-3">
      {id === "text-only" && (
        <>
          <span className="h-2 w-4/5 rounded-pill bg-ink/70" />
          <span className="h-2 w-3/5 rounded-pill bg-ink/70" />
          <span className="mt-1 h-1.5 w-2/5 rounded-pill bg-berry-dark/50" />
        </>
      )}
      {id === "image-full" && (
        <>
          <span className="flex-1 rounded-sm bg-purple/30" />
          <span className="h-1.5 w-3/5 rounded-pill bg-ink/60" />
        </>
      )}
      {id === "list" && (
        <>
          {[1, 2, 3].map((i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="size-1.5 shrink-0 rounded-pill bg-berry" />
              <span className="h-1.5 w-full rounded-pill bg-ink/50" />
            </span>
          ))}
        </>
      )}
    </span>
  );
}
