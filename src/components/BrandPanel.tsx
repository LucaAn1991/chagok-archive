"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ImagePlus, Sparkles } from "lucide-react";

/**
 * 인증 화면(로그인·회원가입·재설정) 왼쪽의 브랜드 패널.
 *
 * Desktop(>=1200)에서만 보인다. 그보다 좁으면 통째로 사라진다 —
 * 축소가 아니라 제거다 (DESIGN.md ✕22).
 *
 * 헤드라인·서브는 PRD §5-1 «카피 구성 [확정 — 08.27]» 그대로.
 * 소개 카드 3장은 08-28 사용자 확정 문구 — 전부 PRD의 확정 재료
 * (페르소나 발화·F2·F3·F7·F4·홈 원칙)에서 나왔다.
 * 숫자·고정 카드 개수를 쓰지 않는다 (PRD §5-1 결정 원칙).
 *
 * 카드 배경에 그라데이션을 쓰지 않는다 (DESIGN.md ✕16) — --berry-light 면.
 * 로고 심볼 없음 — DESIGN.md §18 «로고 최종 아트워크» 미확정.
 */

const SLIDES = [
  {
    icon: Sparkles,
    main: "“뭐 올리지?”에서 멈추는 날,\n생각나는 대로 말만 하세요.",
    sub: "주제와 대상은 차곡이 정리해드려요.",
  },
  {
    icon: ImagePlus,
    main: "말 한마디면\n대상이 다른 카드 여러 장 —",
    sub: "캡션과 해시태그까지 함께요.",
  },
  {
    icon: CalendarDays,
    main: "만든 카드는\n캘린더에 차곡차곡.",
    sub: "오늘은 ‘올릴 것 하나’만 보면 돼요.",
  },
];

export default function BrandPanel() {
  return (
    <section
      aria-label="차곡 소개"
      className="hidden w-1/2 shrink-0 items-center justify-center border-r
                 border-line bg-berry-tint p-16 desktop:flex"
    >
      <div className="w-full max-w-[480px]">
        <p className="text-title font-bold text-ink">차곡</p>

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
 * 소개 카드 자동 슬라이드 — 4초마다 한 장씩. 마우스를 올리거나
 * 키보드 포커스가 있으면 멈춘다. 점을 누르면 그 카드로 이동.
 * 전환은 200ms ease-out (DESIGN.md §16 — bounce 금지).
 */
function FeatureCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [paused]);

  return (
    <div
      className="mt-10"
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
          {SLIDES.map(({ icon: Icon, main, sub }) => (
            <article
              key={sub}
              className="w-full shrink-0 rounded-lg bg-berry-light p-6"
            >
              <span className="flex size-11 items-center justify-center rounded-md bg-surface">
                <Icon size={24} className="text-berry" aria-hidden />
              </span>
              <p className="mt-4 whitespace-pre-line text-title font-bold leading-[1.45] text-ink">
                {main}
              </p>
              {/* 연한 브랜드 면 위 보조 글자는 --berry-dark (DESIGN.md §15) */}
              <p className="mt-2 text-body text-berry-dark">{sub}</p>
            </article>
          ))}
        </div>
      </div>

      {/* 점 인디케이터 — 클릭 영역을 넉넉하게 (DESIGN.md §5 터치 타깃) */}
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
