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
 * 글자 조절 툴바 (08-31 · DESIGN.md §12).
 *
 * **화면에 하나만 뜬다.** 처음에는 줄마다 붙였는데, 번호 목록처럼 줄이 다섯인
 * 레이아웃에서 툴바가 다섯 벌 펼쳐져 편집 패널이 칩으로 도배됐다 (08-31 수정).
 * 지금은 **고른 줄 하나**를 위쪽 한 곳에서 조절한다.
 *
 * 크기·자간은 칩 다섯 개 대신 **－/＋ 단계 버튼**이다. 고를 값이 순서가 있는
 * 것이라 나열할 이유가 없고, 자리도 3분의 1이면 된다.
 *
 * 값은 여전히 «정해진 단계 중 하나»다 — 자유값을 열면 §0의 금지에 걸린다.
 */

type Props = {
  /** 지금 조절 중인 줄의 이름. null이면 안내만 */
  slotLabel: string | null;
  value: SlotStyle | undefined;
  onChange: (next: SlotStyle | undefined) => void;
  disabled?: boolean;
};

export default function SlotToolbar({ slotLabel, value, onChange, disabled }: Props) {
  const v = value ?? {};

  if (!slotLabel) {
    return (
      <p className="rounded-md border border-line bg-surface-muted px-3 py-2 text-caption text-sub">
        아래에서 줄을 누르면 크기·색·정렬을 조절할 수 있어요.
      </p>
    );
  }

  /** 같은 값을 다시 누르면 해제 — «기본으로» 버튼을 항목마다 두지 않으려는 것 */
  function set<K extends keyof SlotStyle>(key: K, next: SlotStyle[K]) {
    const merged: SlotStyle = { ...v };
    if (merged[key] === next) delete merged[key];
    else merged[key] = next;
    onChange(Object.keys(merged).length > 0 ? merged : undefined);
  }

  /** 순서가 있는 값은 나열하지 않고 한 칸씩 옮긴다 */
  function step<T extends readonly string[]>(
    key: keyof SlotStyle,
    steps: T,
    current: string,
    dir: 1 | -1,
  ) {
    const i = steps.indexOf(current);
    const next = steps[Math.min(Math.max(i + dir, 0), steps.length - 1)];
    if (next !== current) onChange({ ...v, [key]: next });
  }

  const size = v.size ?? "m";
  const tracking = v.tracking ?? "normal";

  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-muted p-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rounded-pill bg-surface px-2 py-1 text-caption font-semibold text-ink">
          {slotLabel}
        </span>

        <Stepper
          label="크기"
          value={SIZE_LABELS[size]}
          disabled={disabled}
          onMinus={() => step("size", SIZE_STEPS, size, -1)}
          onPlus={() => step("size", SIZE_STEPS, size, 1)}
        />

        <Chip active={v.weight === "bold"} disabled={disabled} onClick={() => set("weight", "bold")}>
          <span className="font-bold">굵게</span>
        </Chip>

        <Group>
          {ALIGNS.map((a) => (
            <Chip key={a} active={v.align === a} disabled={disabled} onClick={() => set("align", a)}>
              {ALIGN_LABELS[a]}
            </Chip>
          ))}
        </Group>

        <Group>
          {COLORS.map((c) => (
            <Chip key={c} active={v.color === c} disabled={disabled} onClick={() => set("color", c)}>
              {COLOR_LABELS[c]}
            </Chip>
          ))}
        </Group>

        <Stepper
          label="자간"
          value={TRACKING_LABELS[tracking]}
          disabled={disabled}
          onMinus={() => step("tracking", TRACKINGS, tracking, -1)}
          onPlus={() => step("tracking", TRACKINGS, tracking, 1)}
        />

        {isAdjusted(value) && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(undefined)}
            className="text-caption text-sub underline underline-offset-4 hover:text-ink"
          >
            되돌리기
          </button>
        )}
      </div>
    </div>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <span className="flex items-center gap-1">{children}</span>;
}

function Stepper({
  label,
  value,
  disabled,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-caption text-sub">{label}</span>
      <button
        type="button"
        aria-label={`${label} 줄이기`}
        disabled={disabled}
        onClick={onMinus}
        className="h-7 w-7 rounded-pill border border-line bg-surface text-caption text-sub hover:text-ink disabled:opacity-60"
      >
        −
      </button>
      <span className="min-w-[3.5rem] text-center text-caption text-ink">{value}</span>
      <button
        type="button"
        aria-label={`${label} 키우기`}
        disabled={disabled}
        onClick={onPlus}
        className="h-7 w-7 rounded-pill border border-line bg-surface text-caption text-sub hover:text-ink disabled:opacity-60"
      >
        ＋
      </button>
    </span>
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
