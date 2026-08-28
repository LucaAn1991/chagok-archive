"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import InlineAlert from "@/components/InlineAlert";
import { STYLE_EXAMPLES } from "@/lib/style-examples";

/**
 * 온보딩 — 2단계 (F1 · 08-28 재구성, PLAN 변경 이력).
 * ① 콘텐츠 방향(서술형) + 업로드 빈도(주기+요일)
 * ② 게시물 취향 수집 — 예시 6종을 둘러보고 마음에 드는 것을 고른다 (복수).
 *    «템플릿 하나를 고르는» 화면이 아니다. 차곡이 취향 속성을 알아가는 단계다.
 *
 * 완료하면 홈이 아니라 곧바로 첫 AI 기획 대화(/plan/new)로 간다 (08-28 스펙 §8).
 * ⚠️ PRD §5-2 «홈 상태 A로 간다»와 어긋남 — PRD 갱신 대기 (PLAN 변경 이력).
 *
 * 중간 이탈 시 저장하지 않는다 (PLAN §3). onboardedAt은 서버만 쓴다.
 */

const FREQUENCIES = [1, 2, 3, 4, 5, 6, 7] as const;
const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"]; // index = 저장값 (0=월 … 6=일)

// 둘째 줄 들여쓰기 — «예) » 너비만큼 밀어 홈트레이닝과 줄맞춤
const FIELD_PLACEHOLDER = [
  "예) 홈트레이닝 루틴과 운동 기록을 공유하고 싶어요.",
  "　  뷰티 제품을 직접 써본 후기를 올리고 싶어요.",
].join("\n");

export default function OnboardingPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "form">("loading");
  const [step, setStep] = useState<1 | 2>(1);
  const [field, setField] = useState("");
  const [frequency, setFrequency] = useState<number | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
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

  /** 주기 선택 — 매일(7)이면 요일은 어차피 전체라 UI 없이 자동 저장 */
  function selectFrequency(n: number) {
    setFrequency(n);
    setDays(n === 7 ? [0, 1, 2, 3, 4, 5, 6] : []);
    setError(null);
  }

  /** 요일 토글 — 주기 개수까지만 */
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

  function toggleExample(id: string) {
    setError(null);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  }

  /** 완료 — visualPreferences는 선택 id만 보내고 속성은 서버가 붙인다 */
  async function complete(preferences: string[] | null) {
    if (submitting) return;
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
          visualPreferences: preferences ? { selectedExamples: preferences } : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "저장하지 못했어요. 잠시 후 다시 시도해주세요.");
        setSubmitting(false);
        return;
      }
      router.replace("/plan/new"); // 첫 AI 기획 대화로 직행 (스펙 §8 · §12)
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
      <div className={step === 1 ? "w-full max-w-[560px]" : "w-full max-w-[1200px]"}>
        {step === 1 ? (
          <>
            <h1 className="text-h2 font-bold text-ink">거의 다 됐어요</h1>
            <p className="mt-2 text-body text-sub">콘텐츠 준비에 필요한 것만 알려주세요.</p>

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

                {/* 주기 칩 — 질문 바로 밑 한 줄. 테두리 두께가 바뀌면 칸이 흔들려서 두 상태 모두 2px */}
                <div className="mt-1 flex gap-1.5">
                  {FREQUENCIES.map((n) => {
                    const isSelected = frequency === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => selectFrequency(n)}
                        aria-pressed={isSelected}
                        className={[
                          "h-10 flex-1 rounded-pill border-2 text-body font-semibold",
                          isSelected
                            ? "border-berry bg-berry-light text-berry-dark"
                            : "border-line bg-surface text-ink",
                        ].join(" ")}
                      >
                        {n === 7 ? "매일" : `주 ${n}회`}
                      </button>
                    );
                  })}
                </div>

                {/* 요일 — 주기를 고르면 나타난다. 매일은 확인 문구만 (칩 없음) */}
                {daily && (
                  <p className="mt-4 flex items-center gap-1.5 text-body text-ink">
                    <Check size={16} className="shrink-0 text-berry" aria-hidden />
                    매일 업로드하도록 설정했어요.
                  </p>
                )}
                {frequency != null && !daily && (
                  <>
                    <p className="mt-4 text-body font-semibold text-ink">
                      어떤 요일이 편하세요? {frequency}개를 골라주세요.
                    </p>
                    <div className="flex gap-1.5">
                      {DAY_LABELS.map((label, d) => {
                        const isSelected = days.includes(d);
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => toggleDay(d)}
                            aria-pressed={isSelected}
                            className={[
                              "flex h-10 flex-1 items-center justify-center gap-1 rounded-pill",
                              "border-2 text-body font-semibold",
                              isSelected
                                ? "border-berry bg-berry-light text-berry-dark"
                                : "border-line bg-surface text-ink",
                            ].join(" ")}
                          >
                            {isSelected && <Check size={14} aria-hidden />}
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
                좋아하는 게시물 골라보기
              </button>

              <p className="text-center text-caption text-sub">
                입력한 내용은 나중에 설정에서 언제든 바꿀 수 있어요.
              </p>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-h2 font-bold text-ink">어떤 게시물이 마음에 드세요?</h1>
            <p className="mt-2 text-body text-sub">
              평소 올리고 싶은 느낌을 골라주세요.
              <br />
              여러 개 골라도 괜찮아요.
            </p>

            <StyleCarousel selected={selected} onToggle={toggleExample} />

            {/* 액션 블록 — 캐러셀이 주인공이라 조작부는 가운데로 좁게 모은다 */}
            <div className="mx-auto mt-2 w-full max-w-[560px]">
              {/* selection feedback — 부담 없이, 개수만 */}
              <p className="text-center text-caption text-sub">
                {selected.length > 0
                  ? `${selected.length}개 골랐어요.`
                  : "마음에 드는 게시물을 눌러 골라주세요."}
              </p>

              {error && <div className="mt-3"><InlineAlert>{error}</InlineAlert></div>}

              <div className="mt-4 flex flex-col gap-3">
                {/* PRD §5-2 확정 문구 — 1개 이상 골라야 활성화 (스펙 §8) */}
                <button
                  type="button"
                  onClick={() => complete(selected)}
                  disabled={submitting || selected.length === 0}
                  className="h-12 rounded-md bg-berry text-[15px] font-semibold text-white
                             hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
                >
                  {submitting ? "···" : "첫 콘텐츠를 같이 정해볼까요?"}
                </button>

                <div className="flex items-center justify-between">
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
                  {/* 건너뛰기 — 취향 null 저장 후 동일 진행 */}
                  <button
                    type="button"
                    onClick={() => complete(null)}
                    disabled={submitting}
                    className="text-body text-sub hover:text-ink"
                  >
                    잘 모르겠어요
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

/* ════════════════════════════════════════════════════════════
   게시물 취향 캐러셀 — 이 화면의 주인공 (08-28 데스크톱 개편).
   Desktop: 320px 카드 3장 + 다음 장 일부 노출 · 바깥 가장자리 Chevron ·
   마우스 드래그 · 점 페이지네이션. Mobile: 1장 중심 스와이프.
   ════════════════════════════════════════════════════════════ */
const CARD_GAP = 20; // gap-5

function StyleCarousel({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // 마우스 드래그 스크롤 — 드래그였으면 이어지는 클릭 선택을 무시한다
  const drag = useRef({ down: false, startX: 0, scroll: 0, moved: false });

  function cardWidth() {
    const card = trackRef.current?.firstElementChild as HTMLElement | null;
    return (card?.offsetWidth ?? 320) + CARD_GAP;
  }

  function scrollToCard(i: number) {
    trackRef.current?.scrollTo({ left: i * cardWidth(), behavior: "smooth" });
  }

  return (
    <div className="mt-8">
      {/* Chevron은 트랙 바깥 가장자리 — 게시물을 가리지 않는다 (스펙 §3) */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => scrollToCard(Math.max(0, active - 1))}
          aria-label="이전 게시물 보기"
          className="hidden size-11 shrink-0 items-center justify-center rounded-pill
                     border border-line bg-surface text-ink hover:bg-surface-muted sm:flex"
        >
          <ChevronLeft size={20} aria-hidden />
        </button>

        <div
          ref={trackRef}
          onScroll={() => {
            const el = trackRef.current;
            if (el) setActive(Math.round(el.scrollLeft / cardWidth()));
          }}
          onPointerDown={(e) => {
            if (e.pointerType !== "mouse") return; // 터치는 브라우저 기본 스와이프
            const el = trackRef.current!;
            drag.current = { down: true, startX: e.clientX, scroll: el.scrollLeft, moved: false };
          }}
          onPointerMove={(e) => {
            if (!drag.current.down || e.pointerType !== "mouse") return;
            const dx = e.clientX - drag.current.startX;
            if (Math.abs(dx) > 5) drag.current.moved = true;
            trackRef.current!.scrollLeft = drag.current.scroll - dx;
          }}
          onPointerUp={() => {
            drag.current.down = false;
          }}
          onPointerLeave={() => {
            drag.current.down = false;
          }}
          className="flex min-w-0 flex-1 snap-x gap-5 overflow-x-auto pb-2
                     [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {STYLE_EXAMPLES.map(({ id }) => {
            const isSelected = selected.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (drag.current.moved) {
                    drag.current.moved = false;
                    return; // 드래그 끝의 클릭은 선택이 아니다
                  }
                  onToggle(id);
                }}
                aria-pressed={isSelected}
                className={[
                  "relative aspect-[4/5] w-[280px] shrink-0 snap-start overflow-hidden",
                  "rounded-lg border-2 text-left transition-colors duration-200 sm:w-[320px]",
                  isSelected ? "border-berry" : "border-line",
                ].join(" ")}
              >
                <PostExample id={id} />
                {isSelected && (
                  <>
                    {/* very subtle berry tint (스펙 §6) */}
                    <span className="pointer-events-none absolute inset-0 bg-berry/5" />
                    <span
                      className="absolute right-2 top-2 flex size-7 items-center
                                 justify-center rounded-pill bg-berry text-white"
                    >
                      <Check size={16} aria-hidden />
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => scrollToCard(Math.min(STYLE_EXAMPLES.length - 1, active + 1))}
          aria-label="다음 게시물 보기"
          className="hidden size-11 shrink-0 items-center justify-center rounded-pill
                     border border-line bg-surface text-ink hover:bg-surface-muted sm:flex"
        >
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>

      {/* 페이지네이션 점 — 클릭 영역 넉넉하게 (DESIGN.md §5) */}
      <div className="mt-1 flex items-center justify-center">
        {STYLE_EXAMPLES.map(({ id }, i) => (
          <button
            key={id}
            type="button"
            onClick={() => scrollToCard(i)}
            aria-label={`${i + 1}번째 게시물로 이동`}
            aria-current={i === active}
            className="flex size-8 items-center justify-center"
          >
            <span
              className={`size-1.5 rounded-pill ${i === active ? "bg-berry" : "bg-berry/30"}`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   게시물 예시 6종 — 같은 주제 «운동을 꾸준히 만드는 3가지 방법»을
   타이포 크기·정렬·여백·사진 비중·밀도·위계가 다른 구성으로.
   토큰 색으로만 그린다 (사진 에셋 없음). 안의 짧은 장식 문구는 데모다.
   @TODO: 실제 시안·사진 확정 시 교체 (DESIGN.md §18)
   ════════════════════════════════════════════════════════════ */
const METHODS = ["작게 시작하기", "같은 시간에 하기", "기록 남기기"]; // 데모 콘텐츠

function PostExample({ id }: { id: string }) {
  switch (id) {
    case "style_minimal_01":
      // 여백 최대 · 큰 타이포 · 왼쪽 정렬 · 장식 최소
      return (
        <span className="flex h-full flex-col bg-surface p-8">
          <span className="my-auto">
            <span className="block text-[24px] font-bold leading-[1.45] text-ink">
              운동을 꾸준히
              <br />
              만드는
              <br />
              3가지 방법
            </span>
            <span className="mt-6 block h-px w-9 bg-ink/25" />
          </span>
          <span className="text-[10px] text-sub">01</span>
        </span>
      );

    case "style_editorial_01":
      // 사진 상단 절반 + 매거진 위계 (오버라인·헤드라인·본문·페이지 번호)
      return (
        <span className="flex h-full flex-col bg-surface">
          <span className="relative h-[46%] shrink-0 overflow-hidden bg-purple/30">
            <span className="absolute -right-10 -top-10 size-36 rounded-pill bg-purple/40" />
            <span className="absolute bottom-0 left-0 h-12 w-full bg-purple/20" />
          </span>
          <span className="flex flex-1 flex-col p-5">
            <span className="text-[9px] font-semibold tracking-[0.25em] text-berry-dark">
              루틴 노트
            </span>
            <span className="mt-2 text-[17px] font-bold leading-[1.35] text-ink">
              운동을 꾸준히 만드는
              <br />
              3가지 방법
            </span>
            <span className="mt-3 h-px w-full bg-line" />
            <span className="mt-2.5 flex flex-col gap-1.5">
              <span className="h-1.5 w-full rounded-pill bg-ink/10" />
              <span className="h-1.5 w-5/6 rounded-pill bg-ink/10" />
              <span className="h-1.5 w-2/3 rounded-pill bg-ink/10" />
            </span>
            <span className="mt-auto self-end text-[9px] text-sub">02</span>
          </span>
        </span>
      );

    case "style_soft_01":
      // 파스텔 · 둥근 요소 · 가운데 정렬 · 따뜻함 (캐릭터 없이)
      return (
        <span className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-berry-light p-6">
          <span className="absolute -left-8 -top-8 size-28 rounded-pill bg-berry-tint" />
          <span className="absolute -right-9 top-20 size-24 rounded-pill bg-purple/15" />
          <span className="absolute -bottom-10 left-10 size-32 rounded-pill bg-surface/50" />
          <span className="relative rounded-xl bg-surface/95 px-7 py-6 text-center">
            <span className="text-[16px] font-bold leading-[1.55] text-berry-dark">
              운동을 꾸준히
              <br />
              만드는 3가지 방법
            </span>
          </span>
          <span className="relative mt-5 flex gap-1.5">
            <span className="h-2 w-8 rounded-pill bg-berry/30" />
            <span className="h-2 w-5 rounded-pill bg-purple/25" />
            <span className="h-2 w-6 rounded-pill bg-berry/20" />
          </span>
        </span>
      );

    case "style_bold_01":
      // 아주 큰 헤드라인 · 강한 대비 · 아래 정렬
      return (
        <span className="flex h-full flex-col bg-ink p-6">
          <span className="h-2 w-10 bg-berry" />
          <span className="mt-auto text-[27px] font-bold leading-[1.2] text-white">
            운동을
            <br />
            꾸준히 만드는
            <br />
            3가지 방법
          </span>
          <span className="mt-6 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-white/50">01 / 05</span>
            <span className="flex gap-1">
              <span className="h-1 w-6 bg-berry" />
              <span className="h-1 w-3 bg-white/30" />
            </span>
          </span>
        </span>
      );

    case "style_photo_01":
      // 사진이 캔버스 전부 — 텍스트 오버레이 최소 · 피드 스냅샷 느낌
      return (
        <span className="relative block h-full overflow-hidden bg-purple/40">
          <span className="absolute -left-12 top-12 size-44 rounded-pill bg-berry-light/50" />
          <span className="absolute right-8 top-28 size-16 rounded-pill bg-surface/30" />
          <span className="absolute bottom-0 left-0 h-28 w-full bg-ink/15" />
          <span className="absolute bottom-0 left-0 h-16 w-full bg-ink/25" />
          <span className="absolute right-3 top-3 rounded-pill bg-ink/35 px-2 py-0.5 text-[10px] font-semibold text-white">
            1/5
          </span>
          <span className="absolute bottom-5 left-5 text-[14px] font-semibold leading-[1.45] text-white">
            운동을 꾸준히 만드는
            <br />
            3가지 방법
          </span>
        </span>
      );

    case "style_info_01":
      // 정보 구조 · 숫자 · 높은 밀도 · 스캔 가능
      return (
        <span className="flex h-full flex-col bg-surface p-5">
          <span className="flex items-center gap-2">
            <span className="rounded-sm bg-berry-tint px-1.5 py-0.5 text-[10px] font-bold text-berry-dark">
              가이드
            </span>
            <span className="text-[10px] text-sub">운동 습관</span>
          </span>
          <span className="mt-2.5 text-[16px] font-bold leading-[1.35] text-ink">
            운동을 꾸준히 만드는
            <br />
            3가지 방법
          </span>
          <span className="mt-4 flex flex-1 flex-col justify-start gap-2.5">
            {METHODS.map((method, i) => (
              <span key={method} className="flex items-start gap-2.5 rounded-md bg-surface-muted p-3">
                <span
                  className="flex size-5 shrink-0 items-center justify-center rounded-pill
                             bg-berry text-[10px] font-bold text-white"
                >
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-[12px] font-semibold leading-none text-ink">{method}</span>
                  <span className="h-1 w-4/5 rounded-pill bg-ink/10" />
                </span>
              </span>
            ))}
          </span>
          <span className="mt-3 flex items-center gap-2">
            <span className="flex h-1 flex-1 overflow-hidden rounded-pill bg-surface-muted">
              <span className="w-1/3 rounded-pill bg-berry" />
            </span>
            <span className="text-[9px] text-sub">1 / 3</span>
          </span>
        </span>
      );

    default:
      return null;
  }
}
