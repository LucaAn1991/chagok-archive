"use client";

import { useEffect, useState } from "react";

/**
 * 인증 화면(로그인·회원가입·재설정) 왼쪽의 브랜드 패널.
 * Desktop(>=1200)에서만 보인다 — 좁으면 통째로 사라진다 (DESIGN.md ✕22).
 *
 * 슬라이드 3장 = 번호 뱃지 + 미니 목업 + 확정 문구 (08-28 참고 이미지 방향).
 * 문구는 08-28 확정본(COPY.md), 목업 속 예시(운동 루틴 등)는 참고 이미지에서
 * 그대로 — 데모 콘텐츠 전용이다.
 *
 * 규칙:
 * - 카드 배경 그라데이션 금지 (✕16) — 그라데이션은 «차곡이 정리했어요»
 *   카드 윗줄에만 (허용 4곳 중 «AI가 만든 기획 카드 강조»)
 * - 사진 에셋 없음 → 색 면 목업 · 로고 캐릭터 없음 (§18 미확정)
 * - 연한 브랜드 면 위 보조 글자는 --berry-dark (§15)
 */

const SLIDES = [
  { mockup: PlanMockup,
    main: "“뭐 올리지?”에서 멈추는 날,\n생각나는 대로 말만 하세요.",
    sub: "주제와 대상은 차곡이 정리해드려요." },
  { mockup: CardsMockup,
    main: "말 한마디면\n대상이 다른 카드 여러 장 —",
    sub: "캡션과 해시태그까지 함께요." },
  { mockup: CalendarMockup,
    main: "만든 카드는\n캘린더에 차곡차곡.",
    sub: "오늘은 ‘올릴 것 하나’만 보면 돼요." },
];

export default function BrandPanel() {
  return (
    <section
      aria-label="차곡 소개"
      className="hidden w-3/5 shrink-0 items-center justify-center border-r
                 border-line bg-berry-tint p-16 desktop:flex"
    >
      <div className="w-full max-w-[560px]">
        <p className="text-h2 font-bold text-ink">차곡</p>

        {/* PRD §5-1 헤드라인 */}
        <p className="mt-6 text-h1 font-bold text-ink">
          생각을 정리하면,
          <br />
          콘텐츠가 차곡차곡
        </p>

        {/* PRD §5-1 서브 — 범주 선언 */}
        <p className="mt-4 text-body-l text-berry-dark">
          인스타그램 전용 콘텐츠 기획 어시스턴트
        </p>

        <FeatureCarousel />
      </div>
    </section>
  );
}

/**
 * 자동 슬라이드 — 5초마다 한 장. 호버·포커스 시 멈춤, 점 클릭으로 이동.
 * 전환 200ms ease-out (DESIGN.md §16 — bounce 금지).
 */
function FeatureCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [paused]);

  return (
    <div
      className="mt-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="overflow-hidden rounded-lg">
        <div
          className="flex transition-transform duration-200 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SLIDES.map(({ mockup: Mockup, main, sub }, i) => (
            <article
              key={sub}
              className="flex h-[420px] w-full shrink-0 flex-col rounded-lg bg-berry-light p-6"
            >
              <span
                className="flex size-8 items-center justify-center self-start rounded-pill
                           bg-berry text-caption font-bold text-white"
              >
                {`0${i + 1}`}
              </span>

              <div className="mt-4 flex flex-1 flex-col justify-center" aria-hidden>
                <Mockup />
              </div>

              <p className="mt-4 whitespace-pre-line text-title font-bold leading-[1.45] text-ink">
                {main}
              </p>
              <p className="mt-2 text-body text-berry-dark">{sub}</p>
            </article>
          ))}
        </div>
      </div>

      {/* 점 인디케이터 — 클릭 영역 넉넉하게 (DESIGN.md §5) */}
      <div className="mt-2 flex items-center">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.sub}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`${i + 1}번째 소개 보기`}
            aria-current={i === index}
            className="flex size-8 items-center justify-center"
          >
            <span
              className={`size-1.5 rounded-pill ${
                i === index ? "bg-berry" : "bg-berry/30"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── 미니 목업들 — 전부 토큰 색으로만 그린다. 사진·캐릭터 없음 ── */

/** ① 말풍선 → 「차곡이 정리했어요」 */
function PlanMockup() {
  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-[80%] self-start rounded-lg rounded-bl-sm bg-surface p-3">
        <p className="text-body leading-[1.5] text-ink">
          요즘 운동 시작했는데
          <br />
          작심삼일 반복 중이에요…
        </p>
      </div>

      {/* AI가 만든 기획 카드 — 그라데이션 강조 허용 지점 (DESIGN.md §2) */}
      <div className="relative w-[85%] self-end overflow-hidden rounded-lg bg-surface p-3">
        <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "var(--grad)" }} />
        <p className="text-caption font-bold text-berry-dark">차곡이 정리했어요 ✦</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-sm bg-berry-tint px-1.5 py-0.5 text-caption text-berry-dark">
            주제
          </span>
          <span className="text-caption text-ink">운동을 꾸준히 하는 방법</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="rounded-sm bg-berry-tint px-1.5 py-0.5 text-caption text-berry-dark">
            대상
          </span>
          <span className="text-caption text-ink">20~30대 직장인</span>
        </div>
      </div>
    </div>
  );
}

/** ② 대상이 다른 카드 3장 */
function CardsMockup() {
  // 분야를 나눠 보여준다 — 특정 업종 전용으로 보이지 않게 (08-28)
  const cards = [
    { photo: "bg-berry-tint", title: "운동 루틴\n꾸준히 만드는 법", tags: "#운동 #루틴" },
    { photo: "bg-purple/25", title: "홈카페 라떼\n맛있게 내리는 법", tags: "#홈카페 #레시피" },
    { photo: "bg-surface-muted", title: "가을 데일리룩\n코디 아이디어", tags: "#패션 #데일리룩" },
  ];
  return (
    <div className="flex gap-2">
      {cards.map((c) => (
        <div key={c.tags} className="flex-1 rounded-md border border-line bg-surface p-2">
          <div className={`h-14 rounded-sm ${c.photo}`} />
          <p className="mt-2 whitespace-pre-line text-caption font-semibold leading-[1.4] text-ink">
            {c.title}
          </p>
          <p className="mt-1 text-caption text-berry-dark">{c.tags}</p>
        </div>
      ))}
    </div>
  );
}

/** ③ 미니 캘린더 + 오늘의 콘텐츠 */
function CalendarMockup() {
  // 상태 점은 카드 상태색 계단 (DESIGN.md §2) — 진할수록 완료에 가깝다
  const week = [
    { day: "24", dot: "bg-st-published" },
    { day: "25", dot: "bg-st-crafted" },
    { day: "26", dot: null },
    { day: "27", dot: "bg-st-pending", today: true },
    { day: "28", dot: "bg-st-planned" },
    { day: "29", dot: "bg-st-planned" },
    { day: "30", dot: null },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg bg-surface p-3">
        <p className="text-caption font-semibold text-ink">2026년 8월</p>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {week.map(({ day, dot, today }) => (
            <div key={day} className="flex flex-col items-center gap-1">
              <span
                className={
                  today
                    ? "flex size-6 items-center justify-center rounded-pill bg-berry text-caption font-bold text-white"
                    : "flex size-6 items-center justify-center text-caption text-sub"
                }
              >
                {day}
              </span>
              <span className={`size-1 rounded-pill ${dot ?? "bg-transparent"}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-surface p-2.5">
        <span className="size-8 shrink-0 rounded-sm bg-berry-tint" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-caption font-semibold text-ink">
            운동 루틴 꾸준히 만드는 법
          </p>
          <p className="flex items-center gap-1 text-caption text-sub">
            <span className="size-1.5 rounded-pill bg-st-pending" />
            오늘 올릴 콘텐츠
          </p>
        </div>
      </div>
    </div>
  );
}
