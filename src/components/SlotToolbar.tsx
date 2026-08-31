"use client";

import {
  ALIGNS,
  ALIGN_LABELS,
  COLORS,
  COLOR_LABELS,
  SIZE_LABELS,
  SIZE_STEPS,
  TRACKINGS,
  TRACKING_LABELS,
  isAdjusted,
} from "@/lib/slot-style";
import type { SlotStyle } from "@/types";

/**
 * 슬롯 하나의 글자 조절 툴바 (08-31 · DESIGN.md §12).
 *
 * **자유값이 아니라 정해진 단계 중에서 고른다.** 숫자를 직접 넣게 하면
 * §0의 «요소마다 자유값으로 바꾸게 한다» 금지에 걸리고, 제목 12px 같은
 * 조합이 실제로 나온다.
 *
 * **요소를 클릭해서 잡을 필요가 없다.** 슬롯이 이미 이름으로 나뉘어 있어서
 * (제목·본문·항목1…) 그 입력칸 아래 툴바를 두면 «무엇을 조절하는지»가 분명하다.
 * 캔버스 위 히트 테스트·드래그 없이도 대부분의 조절이 된다.
 *
 * 색은 `#RRGGBB`가 아니라 역할 3종이다 — 브랜드 색을 바꾸면 이미 만든 카드도
 * 따라 바뀌어야 하는데, 색을 박아두면 그 카드만 옛 색으로 남는다.
 */

type Props = {
  value: SlotStyle | undefined;
  onChange: (next: SlotStyle | undefined) => void;
  disabled?: boolean;
};

export default function SlotToolbar({ value, onChange, disabled }: Props) {
  const v = value ?? {};

  /** 같은 값을 다시 누르면 해제 — «기본으로» 버튼을 항목마다 두지 않으려는 것 */
  function set<K extends keyof SlotStyle>(key: K, next: SlotStyle[K]) {
    const merged: SlotStyle = { ...v };
    if (merged[key] === next) delete merged[key];
    else merged[key] = next;
    onChange(Object.keys(merged).length > 0 ? merged : undefined);
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-muted p-2">
      <Row label="크기">
        {SIZE_STEPS.map((s) => (
          <Chip key={s} active={v.size === s} disabled={disabled} onClick={() => set("size", s)}>
            {SIZE_LABELS[s]}
          </Chip>
        ))}
      </Row>

      <Row label="굵기">
        <Chip
          active={v.weight === "bold"}
          disabled={disabled}
          onClick={() => set("weight", "bold")}
        >
          <span className="font-bold">굵게</span>
        </Chip>
      </Row>

      <Row label="정렬">
        {ALIGNS.map((a) => (
          <Chip key={a} active={v.align === a} disabled={disabled} onClick={() => set("align", a)}>
            {ALIGN_LABELS[a]}
          </Chip>
        ))}
      </Row>

      <Row label="색">
        {COLORS.map((c) => (
          <Chip key={c} active={v.color === c} disabled={disabled} onClick={() => set("color", c)}>
            {COLOR_LABELS[c]}
          </Chip>
        ))}
      </Row>

      <Row label="자간">
        {TRACKINGS.map((t) => (
          <Chip
            key={t}
            active={v.tracking === t}
            disabled={disabled}
            onClick={() => set("tracking", t)}
          >
            {TRACKING_LABELS[t]}
          </Chip>
        ))}
      </Row>

      {isAdjusted(value) && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(undefined)}
          className="self-start text-caption text-sub underline underline-offset-4 hover:text-ink"
        >
          이 줄 조절 되돌리기
        </button>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-8 shrink-0 text-caption text-sub">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-pill border px-2.5 py-1 text-caption disabled:opacity-60 ${
        active
          ? "border-berry bg-berry-light font-semibold text-berry-dark"
          : "border-line bg-surface text-sub hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
