"use client";

/** 전역 에러 — 알 수 없는 오류의 마지막 안전망 (PLAN.md §4) */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
      <h1 className="text-xl font-bold">문제가 생겼어요</h1>
      <p className="text-sm">
        잠시 후 다시 시도해 주세요.
        {/* @TODO: DESIGN.md 에러 표현 방식 확정 대기 — 빨간색 금지 (PRD §9 미결 7) */}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg border px-4 py-2 text-sm"
      >
        다시 시도
      </button>
    </main>
  );
}
