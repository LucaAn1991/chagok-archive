"use client";

import { useState } from "react";

/**
 * 다시 만든 그림 고르기 (09-03) — 옛것·새것을 나란히 놓고 사용자가 정한다.
 *
 * **우리가 판단해서 덮지 않는다.** 「이 장만 다시 만들기」는 새 그림을 미리보기로만
 * 만들어 두고, 여기서 둘을 비교해 고른 것만 확정한다. AI 결과는 나아질 수도 나빠질
 * 수도 있어서, 그 판단을 사람에게 넘긴다.
 *
 * 모달로 화면을 덮는다 — 둘을 크게 나란히 봐야 차이가 보인다. 작은 썸네일 둘로는
 * 「글자가 제대로 들어갔나」를 못 읽는다.
 */
export default function SlideComparePanel({
  oldUrl,
  newUrl,
  busy,
  onKeep,
}: {
  oldUrl: string | null;
  newUrl: string;
  busy: boolean;
  onKeep: (keep: "new" | "old") => void;
}) {
  const [choice, setChoice] = useState<"new" | "old">("new");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="다시 만든 그림 고르기"
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
    >
      <div className="modal-in flex max-h-full w-full max-w-[720px] flex-col overflow-y-auto rounded-lg bg-surface p-4 shadow-modal">
        <p className="text-body font-bold text-ink">어느 쪽으로 할까요?</p>
        <p className="mt-0.5 text-caption text-sub">둘을 비교해서 골라주세요. 고르기 전엔 아무것도 안 바뀌어요.</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {/* 지금 것 */}
          <button
            type="button"
            onClick={() => setChoice("old")}
            aria-pressed={choice === "old"}
            className={[
              "flex flex-col gap-2 rounded-lg border-2 p-2 text-left transition-colors duration-200",
              choice === "old" ? "border-berry bg-berry-tint" : "border-line hover:border-berry",
            ].join(" ")}
          >
            <span className="text-caption font-semibold text-sub">지금 것</span>
            {oldUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={oldUrl} alt="지금 그림" className="aspect-square w-full rounded-md border border-line object-cover" />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-md bg-surface-muted text-caption text-sub">
                지금 그림
              </div>
            )}
          </button>

          {/* 새로 만든 것 */}
          <button
            type="button"
            onClick={() => setChoice("new")}
            aria-pressed={choice === "new"}
            className={[
              "flex flex-col gap-2 rounded-lg border-2 p-2 text-left transition-colors duration-200",
              choice === "new" ? "border-berry bg-berry-tint" : "border-line hover:border-berry",
            ].join(" ")}
          >
            <span className="text-caption font-semibold text-berry-dark">새로 만든 것</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={newUrl} alt="새로 만든 그림" className="aspect-square w-full rounded-md border border-line object-cover" />
          </button>
        </div>

        {/* 카드로 고르고 버튼 하나로 확정 — 버튼이 둘이면 카드 선택과 뜻이 겹친다 */}
        <button
          type="button"
          onClick={() => onKeep(choice)}
          disabled={busy}
          className="mt-4 flex h-11 w-full items-center justify-center rounded-md bg-berry text-body font-semibold text-white transition-colors duration-200 hover:bg-berry-dark disabled:opacity-60"
        >
          {busy ? "바꾸는 중···" : choice === "new" ? "새 그림으로 바꾸기" : "지금 것 그대로 두기"}
        </button>
      </div>
    </div>
  );
}
