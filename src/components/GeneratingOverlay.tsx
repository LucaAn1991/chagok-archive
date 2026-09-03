"use client";

/**
 * 제작 대기 오버레이 (09-03) — 뒤 화면을 흐리게 보내고 달리는 캐릭터로 진행을 알린다.
 *
 * gpt-image-2 제작은 장당 20초~1분이라, 정지된 스켈레톤만 두면 «멈춘 것»처럼 보인다.
 * 화면을 블러로 뒤에 두고, 앞에 통통 뛰는 캐릭터 + 흐르는 길로 «지금 나아가는 중»을 말한다.
 *
 * **몇 %인지는 말하지 않는다.** 알 수 없다 (DESIGN §10). 대신 정직한 두 가지만:
 * 몇 장 중 몇 장이 됐는지(`total`>0일 때)와 흐른 시간.
 */
export default function GeneratingOverlay({
  total,
  done,
  elapsed,
}: {
  total: number;
  done: number;
  elapsed: number;
}) {
  const headline =
    total === 0 ? "이야기를 정리하고 있어요" : `${total}장 중 ${done}장 완성`;
  const sub =
    total === 0
      ? "곧 몇 장이 될지 정해져요."
      : elapsed > 40
        ? "정성껏 그리는 중이에요. 조금만요."
        : "곧 완성돼요.";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={headline}
      /* 뒤 화면을 흐리게 — backdrop-blur가 바로 아래 콘텐츠를 뿌옇게 만든다 */
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-bg/70 backdrop-blur-sm"
    >
      {/* 달리는 캐릭터 + 발밑으로 흐르는 길 */}
      <div className="flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- 정적 로더 이미지 */}
        <img
          src="/loader-runner.png"
          alt=""
          width={72}
          height={72}
          className="loader-run h-[72px] w-[72px] [image-rendering:pixelated]"
        />
        <div className="loader-track mt-1 h-[3px] w-40 rounded-pill" aria-hidden />
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-h3 font-bold text-ink">{headline}</p>
        <p className="text-body text-sub">{sub}</p>
        {elapsed > 0 && (
          <p className="mt-1 text-caption text-sub">{elapsed}초째 만드는 중</p>
        )}
      </div>
    </div>
  );
}
