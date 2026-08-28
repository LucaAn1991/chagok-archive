"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import InlineAlert from "@/components/InlineAlert";
import Image from "next/image";
import { getSampleSet, type StyleExample } from "@/lib/style-examples";

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

            <StyleCarousel examples={getSampleSet(field)} selected={selected} onToggle={toggleExample} />

            {/* 액션 블록 — 캐러셀이 주인공이라 조작부는 가운데로 좁게 모은다 */}
            <div className="mx-auto mt-2 w-full max-w-[560px]">
              {/* selection feedback — 선택 전엔 비워둔다 (헤더가 이미 설명함). 높이는 유지해 버튼이 안 튀게 */}
              <p className="h-5 text-center text-caption text-sub">
                {selected.length > 0 ? `${selected.length}개 선택했어요` : ""}
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
  examples,
  selected,
  onToggle,
}: {
  examples: StyleExample[];
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
      {/* Chevron은 트랙 바깥에 띄운다 — 카드 첫 장이 제목 왼쪽 라인과 정렬되고,
          게시물을 가리지 않는다. 자리가 없는 폭에서는 숨김(드래그·스와이프로 충분) */}
      <div className="relative">
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
          className="flex w-full snap-x gap-5 overflow-x-auto pb-2
                     [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {examples.map((example) => {
            const isSelected = selected.includes(example.id);
            return (
              <button
                key={example.id}
                type="button"
                onClick={() => {
                  if (drag.current.moved) {
                    drag.current.moved = false;
                    return; // 드래그 끝의 클릭은 선택이 아니다
                  }
                  onToggle(example.id);
                }}
                aria-pressed={isSelected}
                className={[
                  "relative aspect-[4/5] w-[280px] shrink-0 snap-start overflow-hidden",
                  "rounded-lg border-2 text-left transition-colors duration-200 sm:w-[320px]",
                  isSelected ? "border-berry" : "border-line",
                ].join(" ")}
              >
                <PostExample example={example} />
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
          onClick={() => scrollToCard(Math.max(0, active - 1))}
          aria-label="이전 게시물 보기"
          className="absolute -left-14 top-1/2 hidden size-11 -translate-y-1/2 items-center
                     justify-center rounded-pill border border-line bg-surface text-ink
                     hover:bg-surface-muted min-[1340px]:flex"
        >
          <ChevronLeft size={20} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => scrollToCard(Math.min(examples.length - 1, active + 1))}
          aria-label="다음 게시물 보기"
          className="absolute -right-14 top-1/2 hidden size-11 -translate-y-1/2 items-center
                     justify-center rounded-pill border border-line bg-surface text-ink
                     hover:bg-surface-muted min-[1340px]:flex"
        >
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   게시물 예시 — 한 크리에이터의 피드에서 볼 법한 서로 다른 게시물들.
   내용·형식은 src/lib/style-examples.ts 데이터에서 온다 (세트 교체 대비).
   사진은 임시 에셋(Unsplash — public/onboarding-samples/README.md).
   @TODO: 실제 시안·사진 확정 시 교체 (DESIGN.md §18)
   ════════════════════════════════════════════════════════════ */
function PostExample({ example }: { example: StyleExample }) {
  const { contentFormat, title, note, meta, items, photo } = example;

  switch (contentFormat) {
    case "thought":
      // 짧은 생각 — 여백 중심 · 타이포 중심 · 장식 최소
      return (
        <span className="flex h-full flex-col bg-surface p-8">
          <span className="my-auto">
            <span className="block whitespace-pre-line text-[23px] font-bold leading-[1.5] text-ink">
              {title}
            </span>
            <span className="mt-5 block h-px w-9 bg-ink/25" />
            {note && (
              <span className="mt-4 block whitespace-pre-line text-[12px] leading-[1.7] text-sub">
                {note}
              </span>
            )}
          </span>
          <span className="text-[10px] text-sub">@chagok.daily</span>
        </span>
      );

    case "editorial":
      // 사진 + 에세이 — 매거진 구성
      return (
        <span className="flex h-full flex-col bg-surface">
          <span className="relative block h-[52%] shrink-0 overflow-hidden">
            {photo && <Image src={photo} alt="" fill sizes="320px" className="object-cover" />}
          </span>
          <span className="flex flex-1 flex-col p-5">
            <span className="text-[9px] font-semibold tracking-[0.25em] text-berry-dark">
              모닝 에세이
            </span>
            <span className="mt-2 whitespace-pre-line text-[16px] font-bold leading-[1.4] text-ink">
              {title}
            </span>
            <span className="mt-2.5 flex flex-col gap-1.5">
              <span className="h-1.5 w-full rounded-pill bg-ink/10" />
              <span className="h-1.5 w-4/5 rounded-pill bg-ink/10" />
            </span>
            <span className="mt-auto self-end text-[9px] text-sub">02</span>
          </span>
        </span>
      );

    case "routine":
      // 데일리 루틴 — 부드러운 그래픽 + 작은 정보 3개
      return (
        <span className="relative flex h-full flex-col overflow-hidden bg-berry-light p-5">
          <span className="absolute -right-9 -top-9 size-24 rounded-pill bg-berry-tint" />
          <span className="absolute -bottom-10 -left-8 size-28 rounded-pill bg-purple/12" />
          <span className="relative mt-1 text-center text-[16px] font-bold leading-[1.45] text-berry-dark">
            {title}
          </span>
          <span className="relative mt-5 flex flex-col gap-2.5">
            {items?.map((item) => (
              <span
                key={item}
                className="flex items-center gap-2.5 rounded-xl bg-surface/95 px-4 py-3"
              >
                <span className="size-2 shrink-0 rounded-pill bg-berry/60" />
                <span className="text-[12px] font-semibold text-ink">{item}</span>
              </span>
            ))}
          </span>
          <span className="relative mt-auto flex justify-center gap-1.5 pt-3">
            <span className="h-1.5 w-6 rounded-pill bg-berry/30" />
            <span className="h-1.5 w-3 rounded-pill bg-purple/25" />
          </span>
        </span>
      );

    case "statement":
      // 한 문장 스테이트먼트 — 강한 대비 · 큰 타이포
      return (
        <span className="flex h-full flex-col bg-ink p-6">
          <span className="text-[42px] font-bold leading-none text-berry">“</span>
          <span className="mt-auto whitespace-pre-line text-[25px] font-bold leading-[1.3] text-white">
            {title}
          </span>
          <span className="mt-5 h-1 w-10 bg-berry" />
          <span className="mt-3 text-[10px] text-white/50">@chagok.daily</span>
        </span>
      );

    case "diary":
      // 사진 중심 기록 — 개인 피드 스냅샷
      return (
        <span className="relative block h-full overflow-hidden">
          {photo && <Image src={photo} alt="" fill sizes="320px" className="object-cover" />}
          <span className="absolute bottom-0 left-0 h-28 w-full bg-ink/20" />
          <span className="absolute bottom-0 left-0 h-16 w-full bg-ink/25" />
          {meta && (
            <span className="absolute left-3 top-3 rounded-sm bg-surface/90 px-2 py-1 text-[10px] font-bold text-ink">
              {meta}
            </span>
          )}
          <span className="absolute bottom-4 left-4 flex flex-col gap-1">
            <span className="text-[14px] font-semibold leading-[1.4] text-white">{title}</span>
            {note && <span className="text-[11px] text-white/85">{note}</span>}
          </span>
        </span>
      );

    case "informational":
      // 정보 카드뉴스 — 정보 단위 3개가 첫 화면에 보인다
      return (
        <span className="flex h-full flex-col bg-surface p-5">
          <span className="flex items-center gap-2">
            <span className="rounded-sm bg-berry-tint px-1.5 py-0.5 text-[10px] font-bold text-berry-dark">
              가이드
            </span>
            <span className="text-[10px] text-sub">운동 습관</span>
          </span>
          <span className="mt-2.5 whitespace-pre-line text-[15px] font-bold leading-[1.4] text-ink">
            {title}
          </span>
          <span className="mt-3.5 flex flex-1 flex-col justify-start gap-2">
            {items?.map((item, i) => (
              <span
                key={item}
                className="flex items-start gap-2.5 rounded-md border border-line bg-surface p-2.5"
              >
                <span
                  className="flex size-5 shrink-0 items-center justify-center rounded-pill
                             bg-berry text-[10px] font-bold text-white"
                >
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-[12px] font-semibold leading-none text-ink">{item}</span>
                  <span className="h-1 w-4/5 rounded-pill bg-ink/10" />
                </span>
              </span>
            ))}
          </span>
          <span className="mt-2.5 flex items-center gap-2">
            <span className="flex h-1 flex-1 overflow-hidden rounded-pill bg-surface-muted">
              <span className="w-1/3 rounded-pill bg-berry" />
            </span>
            <span className="text-[9px] text-sub">1 / 3</span>
          </span>
        </span>
      );

    case "comparison": {
      // 비교·변화 — 위(전)/아래(후) 분할 + 가운데 칩
      const [before = "", after = ""] = items ?? [];
      const [beforeLabel, beforeText] = before.split("|");
      const [afterLabel, afterText] = after.split("|");
      return (
        <span className="relative flex h-full flex-col">
          <span className="flex flex-1 flex-col justify-center gap-1.5 bg-surface-muted p-6">
            <span className="text-[10px] font-semibold tracking-[0.15em] text-sub">
              {beforeLabel}
            </span>
            <span className="text-[17px] font-bold leading-[1.35] text-ink">{beforeText}</span>
          </span>
          <span className="flex flex-1 flex-col justify-center gap-1.5 bg-berry-light p-6">
            <span className="text-[10px] font-semibold tracking-[0.15em] text-berry-dark">
              {afterLabel}
            </span>
            <span className="text-[17px] font-bold leading-[1.35] text-berry-dark">
              {afterText}
            </span>
          </span>
          {meta && (
            <span
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                         rounded-pill bg-ink px-3 py-1 text-[10px] font-bold text-white"
            >
              {meta}
            </span>
          )}
        </span>
      );
    }

    case "checklist":
      // 체크리스트 — 저장 유도형. 앞 2개는 완료 상태로 그린다 (데모)
      return (
        <span className="flex h-full flex-col bg-surface p-5">
          <span className="whitespace-pre-line text-[16px] font-bold leading-[1.4] text-ink">
            {title}
          </span>
          <span className="mt-4 flex flex-1 flex-col justify-start gap-3">
            {items?.map((item, i) => {
              const done = i < 2;
              return (
                <span key={item} className="flex items-center gap-2.5">
                  <span
                    className={
                      done
                        ? "flex size-5 shrink-0 items-center justify-center rounded-sm bg-berry text-white"
                        : "size-5 shrink-0 rounded-sm border-2 border-line"
                    }
                  >
                    {done && <Check size={12} aria-hidden />}
                  </span>
                  <span
                    className={`text-[12px] font-semibold ${
                      done ? "text-sub line-through" : "text-ink"
                    }`}
                  >
                    {item}
                  </span>
                </span>
              );
            })}
          </span>
          <span className="text-[10px] text-sub">저장해두고 체크해요</span>
        </span>
      );

    case "quote":
      // 인용·글귀 — 얇은 프레임 · 가운데 정렬 · 문학적
      return (
        <span className="flex h-full bg-surface p-3">
          <span className="flex flex-1 flex-col items-center justify-center rounded-sm border border-ink/20 px-5 text-center">
            <span className="text-[28px] font-bold leading-none text-berry/70">“</span>
            <span className="mt-2 whitespace-pre-line text-[13px] font-semibold leading-[1.9] text-ink">
              {title}
            </span>
            {note && <span className="mt-4 text-[11px] text-sub">{note}</span>}
          </span>
        </span>
      );

    case "collage":
      // 사진 콜라주 — photo dump. 사진 2장 + 색면 + 제목 셀 그리드
      return (
        <span className="flex h-full flex-col bg-surface p-3">
          <span className="grid flex-1 grid-cols-2 grid-rows-2 gap-2">
            <span className="relative block overflow-hidden rounded-sm">
              {example.photos?.[0] && (
                <Image src={example.photos[0]} alt="" fill sizes="160px" className="object-cover" />
              )}
            </span>
            <span className="relative block overflow-hidden rounded-sm">
              {example.photos?.[1] && (
                <Image src={example.photos[1]} alt="" fill sizes="160px" className="object-cover" />
              )}
            </span>
            <span className="flex items-center justify-center rounded-sm bg-berry-light">
              <span className="whitespace-pre-line text-center text-[12px] font-bold leading-[1.5] text-berry-dark">
                {title}
              </span>
            </span>
            <span className="rounded-sm bg-purple/15" />
          </span>
          <span className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-sub">@chagok.daily</span>
            {note && <span className="text-[10px] text-sub">{note}</span>}
          </span>
        </span>
      );

    case "review":
      // 사용 후기 — 별점 + 좋았던 점/아쉬운 점
      return (
        <span className="flex h-full flex-col bg-surface p-5">
          <span className="flex items-center gap-2">
            <span className="rounded-sm bg-berry-tint px-1.5 py-0.5 text-[10px] font-bold text-berry-dark">
              리뷰
            </span>
            {meta && <span className="text-[10px] text-sub">{meta}</span>}
          </span>
          <span className="mt-2.5 whitespace-pre-line text-[16px] font-bold leading-[1.4] text-ink">
            {title}
          </span>
          <span className="mt-2 flex items-center gap-1.5">
            <span className="text-[13px] tracking-[0.12em] text-berry">
              ★★★★<span className="text-line">★</span>
            </span>
            <span className="text-[11px] font-semibold text-ink">4.0</span>
          </span>
          <span className="mt-3.5 flex flex-1 flex-col justify-start gap-2">
            {items?.map((item) => {
              const [label, text] = item.split("|");
              const good = label.startsWith("좋");
              return (
                <span key={item} className="flex items-center gap-2">
                  <span
                    className={[
                      "shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-bold",
                      good ? "bg-berry-light text-berry-dark" : "bg-surface-muted text-sub",
                    ].join(" ")}
                  >
                    {label}
                  </span>
                  <span className="text-[11px] font-medium text-ink">{text}</span>
                </span>
              );
            })}
          </span>
          {note && <span className="text-[10px] text-berry-dark">{note}</span>}
        </span>
      );

    default:
      return null;
  }
}
