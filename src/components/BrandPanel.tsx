"use client";

import { useEffect, useState } from "react";
import { LogoFull } from "@/components/Logo";
import Image from "next/image";

/**
 * 인증 화면(로그인·회원가입·재설정) 왼쪽의 브랜드 패널.
 * Desktop(>=1200)에서만 보인다 — 좁으면 통째로 사라진다 (DESIGN.md ✕22).
 *
 * 슬라이드 3장 = 차곡의 실제 사용 흐름 한 편 (08-28 재구성 확정):
 *   ① 아이디어 → 기획   ② 기획 → 캘린더 배치   ③ 오늘의 카드 → 제작
 * 같은 콘텐츠(«퇴근 후, 요즘의 저녁» · Lifestyle 데모)가 세 장에 걸쳐
 * 이어진다 — 슬라이드 2 썸네일과 3의 게시물 사진이 같은 이유다.
 * 자동 업로드·자동 발행처럼 보이는 표현은 쓰지 않는다.
 *
 * 헤드라인·서브는 PRD §5-1 확정 카피. 슬라이드 카피는 08-28 확정본.
 * 게시물 목업 안 색·문구는 콘텐츠 세계 영역(브랜드 토큰 예외 — 08-28 확정).
 * 로고는 실제 아트워크를 쓴다 (08-31) — `components/Logo.tsx`.
 */

const EVENING_PHOTO = "/onboarding-samples/evening.jpg";
const CARD_TITLE = "퇴근 후, 요즘의 저녁"; // 슬라이드 2·3을 잇는 같은 카드 제목

const SLIDES = [
  {
    mockup: PlanMockup,
    main: "생각나는 대로\n말만 하세요.",
    sub: "막연한 생각도 차곡이\n콘텐츠 기획으로 정리해요.",
  },
  {
    mockup: CalendarMockup,
    main: "만든 카드는\n캘린더에 차곡차곡.",
    sub: "무엇을 언제 올릴지\n한눈에 볼 수 있어요.",
  },
  {
    mockup: CreateMockup,
    main: "캡션부터 카드뉴스까지,\n차곡이 다 만들어줘요.",
    sub: "오늘의 카드를 열고\n다듬기만 하면 돼요.",
  },
];

export default function BrandPanel() {
  return (
    <section
      aria-label="차곡 소개"
      className="hidden w-3/5 shrink-0 items-center justify-center border-r
                 border-line bg-berry-tint p-16 desktop:flex"
    >
      <div className="w-full max-w-[560px]">
        {/* 로고 — 실제 아트워크 (08-31). 글자까지 들어간 전체 마크를 쓴다 */}
        <LogoFull width={104} />

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
              key={main}
              className="flex h-[480px] w-full shrink-0 flex-col rounded-lg bg-berry-light p-6"
            >
              <span
                className="flex size-8 items-center justify-center self-start rounded-pill
                           bg-berry text-caption font-bold text-white"
              >
                {`0${i + 1}`}
              </span>

              <div className="mt-3 flex min-h-0 flex-1 flex-col justify-center" aria-hidden>
                <Mockup />
              </div>

              <p className="mt-3 whitespace-pre-line text-title font-bold leading-[1.45] text-ink">
                {main}
              </p>
              {/* 연한 브랜드 면 위 보조 글자는 --berry-dark (DESIGN.md §15) */}
              <p className="mt-2 whitespace-pre-line text-body leading-[1.55] text-berry-dark">
                {sub}
              </p>
            </article>
          ))}
        </div>
      </div>

      {/* 점 인디케이터 — 클릭 영역 넉넉하게 (DESIGN.md §5) */}
      <div className="mt-2 flex items-center">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.main}
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

/* ── 미니 목업 — 한 콘텐츠가 기획 → 일정 → 제작으로 이어진다 ── */

/** ① 막연한 말 → 차곡이 정리한 기획. 화살표 없이 흐름으로만 */
function PlanMockup() {
  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-[82%] self-start rounded-lg rounded-bl-sm bg-surface p-3">
        <p className="text-body leading-[1.55] text-ink">
          요즘 퇴근하고 나면 시간이 그냥 가는 것 같아요.
          <br />
          평범한 일상도 좀 기록해보고 싶어요.
        </p>
      </div>

      {/* AI가 만든 기획 카드 — 그라데이션 강조 허용 지점 (DESIGN.md §2) */}
      <div className="relative w-[88%] self-end overflow-hidden rounded-lg bg-surface p-3.5">
        <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "var(--grad)" }} />
        <p className="text-caption font-bold text-berry-dark">차곡이 정리했어요 ✦</p>
        <div className="mt-2 flex flex-col gap-1.5">
          {[
            ["주제", "퇴근 후 나만의 시간"],
            ["대상", "일상을 기록하고 싶은 직장인"],
            ["기획 의도", "공감 + 일상 기록"],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="shrink-0 rounded-sm bg-berry-tint px-1.5 py-0.5 text-caption text-berry-dark">
                {label}
              </span>
              <span className="text-caption text-ink">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** ② 그 기획이 날짜에 배치됐다 — 캘린더보다 «배치된 카드»가 주인공 */
function CalendarMockup() {
  const week = ["24", "25", "26", "27", "28", "29", "30"];
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg bg-surface p-3.5">
        <p className="text-caption font-semibold text-ink">2026년 8월</p>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {week.map((day) => (
            <span
              key={day}
              className={
                day === "27"
                  ? "flex size-7 items-center justify-center justify-self-center rounded-pill bg-berry text-caption font-bold text-white"
                  : "flex size-7 items-center justify-center justify-self-center text-caption text-sub"
              }
            >
              {day}
            </span>
          ))}
        </div>
      </div>

      {/* 27일에 배치된, 슬라이드 ①에서 만든 그 콘텐츠 */}
      <div className="flex items-center gap-3 rounded-lg bg-surface p-3">
        <span className="relative block size-12 shrink-0 overflow-hidden rounded-sm">
          <Image src={EVENING_PHOTO} alt="" fill sizes="48px" className="object-cover" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-body font-semibold text-ink">{CARD_TITLE}</span>
          <span className="mt-0.5 block text-caption text-sub">오늘 올릴 콘텐츠</span>
        </span>
      </div>
    </div>
  );
}

/** ③ 오늘의 카드를 열어 실제 게시물로 — 결과물이 가장 크게 보인다 */
function CreateMockup() {
  return (
    <div className="relative flex items-start gap-3">
      {/* 왼쪽 — 열어본 오늘의 카드 + 캡션 미리보기 */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-2">
        <div className="rounded-lg bg-surface p-3">
          <p className="text-caption text-sub">오늘의 카드</p>
          <p className="mt-1 text-body font-semibold text-ink">{CARD_TITLE}</p>
          <p className="mt-0.5 text-caption text-sub">일상을 기록하고 싶은 직장인</p>
        </div>
        <div className="rounded-lg bg-surface p-3">
          <p className="text-caption font-semibold text-berry-dark">캡션 초안</p>
          <p className="mt-1 text-caption leading-[1.6] text-ink">
            퇴근하면 그냥 누워버리기 바빴는데, 요즘은 30분이라도 나가보려고 한다…
          </p>
        </div>
      </div>

      {/* 오른쪽 — 완성된 게시물 (온보딩 Warm Lifestyle 문법, 4:5) */}
      <div className="w-[40%] shrink-0">
        <div className="flex aspect-[4/5] flex-col overflow-hidden rounded-md bg-[#F6F0E7] p-2">
          <span className="relative block flex-1 overflow-hidden">
            <Image src={EVENING_PHOTO} alt="" fill sizes="240px" className="object-cover" />
          </span>
          <span className="flex flex-col gap-0.5 px-1 pb-0.5 pt-2">
            <span className="text-[11px] font-semibold text-[#3F362E]">
              별거 없지만,
              <br />
              요즘의 저녁
            </span>
            <span className="text-[8px] tracking-[0.2em] text-[#A08D7C]">퇴근 · 산책 · 기록</span>
          </span>
        </div>
      </div>
    </div>
  );
}
