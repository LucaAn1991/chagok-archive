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
   게시물 예시 — 3개 visual direction (08-28 전면 재작업, 이전 시안 폐기).
   UI 카드·슬라이드·와이어프레임이 아니라 실제 피드에 올릴 크리에이티브를
   그린다. 캔버스 안 색은 브랜드 토큰의 의도적 예외 (style-examples.ts 주석).
   @TODO: 실제 시안·사진 확정 시 교체 (DESIGN.md §18)
   ════════════════════════════════════════════════════════════ */
function PostExample({ example }: { example: StyleExample }) {
  const { title, note, meta, photo } = example;

  switch (example.id) {
    // ── A. WARM LIFESTYLE — 필름 저널: 사진 75% + 따뜻한 여백 + 작은 기록 ──
    case "direction_warm_01":
      return (
        <span className="flex h-full flex-col bg-[#F6F0E7] p-3">
          <span className="relative block flex-1 overflow-hidden">
            {photo && <Image src={photo} alt="" fill sizes="320px" className="object-cover" />}
          </span>
          <span className="flex flex-col gap-1 px-1 pb-1 pt-3">
            <span className="flex items-baseline justify-between">
              <span className="text-[8px] font-semibold tracking-[0.3em] text-[#A08D7C]">
                {meta}
              </span>
              <span className="text-[8px] tracking-[0.25em] text-[#C9BBAB]">FILM 03</span>
            </span>
            <span className="text-[13px] font-semibold text-[#3F362E]">{title}</span>
            {note && <span className="text-[10px] text-[#8D7E6F]">{note}</span>}
          </span>
        </span>
      );

    // ── B. MODERN EDITORIAL — 흑백 사진 블리드 + 넉아웃 숫자 + 지그재그 타이포 ──
    case "direction_editorial_01": {
      const [line1 = "", line2 = "", line3 = ""] = title.split("\n");
      return (
        <span className="relative block h-full overflow-hidden bg-[#EBE7E0]">
          <span className="absolute right-0 top-0 block h-[56%] w-[78%]">
            {photo && <Image src={photo} alt="" fill sizes="320px" className="object-cover" />}
          </span>
          {/* 종이색 넉아웃 숫자 — 사진 위 레이어링 */}
          <span className="absolute right-3 top-[34%] text-[58px] font-bold leading-none text-[#EBE7E0]">
            02
          </span>
          {/* 왼쪽 세로 캡션 */}
          <span className="absolute left-3 top-5 text-[8px] tracking-[0.35em] text-[#A39889] [writing-mode:vertical-rl]">
            WORKOUT ESSAY
          </span>
          {/* 지그재그 헤드라인 */}
          <span className="absolute bottom-12 left-4 right-4 flex flex-col">
            <span className="text-[26px] font-bold leading-[1.18] text-[#232019]">{line1}</span>
            <span className="self-end text-[26px] font-bold leading-[1.18] text-[#232019]">
              {line2}
            </span>
            <span className="text-[26px] font-bold leading-[1.18] text-[#232019]">{line3}</span>
          </span>
          {note && (
            <span className="absolute bottom-5 left-4 text-[9px] tracking-[0.1em] text-[#8A8177]">
              {note}
            </span>
          )}
        </span>
      );
    }

    // ── C. GRAPHIC/TYPOGRAPHIC — 딥그린 포스터 · 오버사이즈 지그재그 · 도형 ──
    case "direction_graphic_01": {
      const lines = title.split("\n");
      return (
        <span className="relative flex h-full flex-col overflow-hidden bg-[#1C3129] p-5">
          <span className="absolute -right-16 top-24 size-48 rounded-pill border-2 border-[#E8613C]/70" />
          <span className="absolute right-7 top-[55%] size-2.5 rounded-pill bg-[#E8613C]" />
          <span className="flex items-center justify-between text-[8px] tracking-[0.3em] text-[#F2EBDC]/50">
            <span>NO EXCUSE</span>
            <span>08 / 28</span>
          </span>
          <span className="relative mt-auto flex flex-col pb-3">
            {lines.map((line, i) => (
              <span
                key={line}
                className={[
                  "text-[33px] font-bold leading-[1.16]",
                  i % 2 === 1 ? "self-end" : "",
                  i === 2 ? "text-[#E8613C]" : "text-[#F2EBDC]",
                ].join(" ")}
              >
                {line}
              </span>
            ))}
          </span>
          {note && (
            <span className="relative text-[9px] tracking-[0.15em] text-[#F2EBDC]/60">{note}</span>
          )}
        </span>
      );
    }

    default:
      return null;
  }
}
