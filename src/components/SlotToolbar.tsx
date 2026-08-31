"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Droplet,
  Minus,
  MoveHorizontal,
  MoveVertical,
  Plus,
  RotateCcw,
  Strikethrough,
  Underline,
} from "lucide-react";
import {
  ALIGNS,
  ALIGN_LABELS,
  COLORS,
  COLOR_LABELS,
  LINE_HEIGHTS,
  LINE_HEIGHT_LABELS,
  OPACITIES,
  MAX_SIZE_PX,
  MIN_SIZE_PX,
  SIZE_PX_STEP,
  TRACKINGS,
  TRACKING_LABELS,
  isAdjusted,
} from "@/lib/slot-style";
import { BUILT_IN_FONTS } from "@/lib/render/font-registry";
import type { FontId, SlotStyle } from "@/types";

/**
 * 글자 조절 툴바 (08-31 · DESIGN.md §12).
 *
 * **가로 아이콘 바 한 줄.** 처음에는 줄마다 5행짜리 칩 묶음을 붙였는데
 * 번호 목록(줄 5개)에서 툴바만 25줄이 됐다. 지금은 **고른 줄 하나**를
 * 위쪽 한 곳에서 조절하고, 이름표 대신 아이콘을 쓴다.
 *
 * 좁은 화면에서는 가로로 스크롤한다 — 줄바꿈으로 쌓으면 미리보기가 밀린다.
 *
 * **색은 두 갈래다.** 역할(기본·여리게·강조)은 브랜드 색이 바뀌면 따라오고,
 * 색을 직접 찍으면 그게 이긴다 — 대신 브랜드를 바꿔도 안 따라온다.
 */

type Props = {
  slotLabel: string | null;
  value: SlotStyle | undefined;
  onChange: (next: SlotStyle | undefined) => void;
  /** 파일이 실제로 있는 폰트만 — 없는 폰트를 고르면 기본으로 그려진다 */
  availableFontIds?: FontId[];
  /**
   * 지금 «실제로 그려지는» 글자 크기(px). px를 직접 안 넣었을 때 칸에 보여준다 —
   * 빈 칸을 보여주면 «지금 몇인지» 모른 채로 고쳐야 한다.
   */
  currentSizePx?: number;
  disabled?: boolean;
};

export default function SlotToolbar({
  slotLabel,
  value,
  onChange,
  availableFontIds = [],
  currentSizePx,
  disabled,
}: Props) {
  const v = value ?? {};

  if (!slotLabel) {
    return (
      <p className="rounded-md border border-line bg-surface-muted px-3 py-2 text-caption text-sub">
        아래에서 줄을 누르면 크기·색·정렬을 조절할 수 있어요.
      </p>
    );
  }

  function set<K extends keyof SlotStyle>(key: K, next: SlotStyle[K]) {
    const merged: SlotStyle = { ...v };
    if (merged[key] === next || next === undefined) delete merged[key];
    else merged[key] = next;
    onChange(Object.keys(merged).length > 0 ? merged : undefined);
  }

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

  const tracking = v.tracking ?? "normal";
  const shownPx = v.sizePx ?? currentSizePx ?? 40;

  /** px는 자유값이되 범위는 막는다 — 8px 제목은 안 읽힌다 */
  function setPx(next: number) {
    const clamped = Math.round(Math.min(Math.max(next, MIN_SIZE_PX), MAX_SIZE_PX));
    onChange({ ...v, sizePx: clamped });
  }
  const lineHeight = v.lineHeight ?? "normal";
  const opacity = v.opacity ?? "100";
  const fonts = BUILT_IN_FONTS.filter((f) => availableFontIds.includes(f.id));

  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-md border border-line bg-surface-muted p-2">
      <span className="shrink-0 rounded-pill bg-surface px-2 py-1 text-caption font-semibold text-ink">
        {slotLabel}
      </span>

      {fonts.length > 1 && (
        <>
          <Sep />
          <select
            aria-label="폰트"
            disabled={disabled}
            value={v.fontId ?? ""}
            onChange={(e) => set("fontId", (e.target.value || undefined) as FontId | undefined)}
            className="h-8 shrink-0 rounded-md border border-line bg-surface px-2 text-caption text-ink"
          >
            <option value="">기본 폰트</option>
            {fonts.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </>
      )}

      <Sep />
      {/* 크기는 px로 직접 (08-31). 캔버스 1080 기준이라 «그려지는 그 크기»다 */}
      <span className="flex shrink-0 items-center gap-1" title="글자 크기(px)">
        <button
          type="button"
          aria-label="글자 작게"
          disabled={disabled}
          onClick={() => setPx(shownPx - SIZE_PX_STEP)}
          className="flex h-8 w-7 items-center justify-center rounded-md border border-line bg-surface text-sub hover:text-ink disabled:opacity-60"
        >
          <Minus size={14} aria-hidden />
        </button>
        <input
          type="number"
          aria-label="글자 크기(px)"
          min={MIN_SIZE_PX}
          max={MAX_SIZE_PX}
          value={shownPx}
          disabled={disabled}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) setPx(n);
          }}
          className={`h-8 w-14 rounded-md border bg-surface px-1 text-center text-caption text-ink ${
            v.sizePx ? "border-berry" : "border-line"
          }`}
        />
        <button
          type="button"
          aria-label="글자 크게"
          disabled={disabled}
          onClick={() => setPx(shownPx + SIZE_PX_STEP)}
          className="flex h-8 w-7 items-center justify-center rounded-md border border-line bg-surface text-sub hover:text-ink disabled:opacity-60"
        >
          <Plus size={14} aria-hidden />
        </button>
      </span>

      <Sep />
      {/* 색 — 역할 3종 + 직접 찍기 */}
      {COLORS.map((c) => (
        <IconBtn
          key={c}
          label={COLOR_LABELS[c]}
          active={!v.colorHex && v.color === c}
          disabled={disabled}
          onClick={() => onChange({ ...v, color: c, colorHex: undefined })}
        >
          <span className="text-caption">{COLOR_LABELS[c]}</span>
        </IconBtn>
      ))}
      <label
        className={`flex h-8 shrink-0 items-center gap-1 rounded-md border px-2 ${
          v.colorHex ? "border-berry bg-berry-light" : "border-line bg-surface"
        }`}
        title="색 직접 고르기"
      >
        <Droplet size={14} aria-hidden className={v.colorHex ? "text-berry-dark" : "text-sub"} />
        <input
          type="color"
          aria-label="색 직접 고르기"
          disabled={disabled}
          value={v.colorHex ?? "#000000"}
          onChange={(e) => onChange({ ...v, colorHex: e.target.value.toUpperCase() })}
          className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
        />
      </label>

      <Sep />
      <IconBtn
        label="굵게"
        active={v.weight === "bold"}
        disabled={disabled}
        onClick={() => set("weight", "bold")}
      >
        <Bold size={16} aria-hidden />
      </IconBtn>
      <IconBtn
        label="밑줄"
        active={v.underline === true}
        disabled={disabled}
        onClick={() => set("underline", true)}
      >
        <Underline size={16} aria-hidden />
      </IconBtn>
      <IconBtn
        label="취소선"
        active={v.strike === true}
        disabled={disabled}
        onClick={() => set("strike", true)}
      >
        <Strikethrough size={16} aria-hidden />
      </IconBtn>

      <Sep />
      {ALIGNS.map((a) => {
        const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
        return (
          <IconBtn
            key={a}
            label={`${ALIGN_LABELS[a]} 정렬`}
            active={v.align === a}
            disabled={disabled}
            onClick={() => set("align", a)}
          >
            <Icon size={16} aria-hidden />
          </IconBtn>
        );
      })}

      <Sep />
      <IconStepper
        icon={<MoveHorizontal size={14} aria-hidden />}
        label="자간"
        value={TRACKING_LABELS[tracking]}
        disabled={disabled}
        onMinus={() => step("tracking", TRACKINGS, tracking, -1)}
        onPlus={() => step("tracking", TRACKINGS, tracking, 1)}
      />
      <IconStepper
        icon={<MoveVertical size={14} aria-hidden />}
        label="줄 간격"
        value={LINE_HEIGHT_LABELS[lineHeight]}
        disabled={disabled}
        onMinus={() => step("lineHeight", LINE_HEIGHTS, lineHeight, -1)}
        onPlus={() => step("lineHeight", LINE_HEIGHTS, lineHeight, 1)}
      />
      <IconStepper
        icon={<Baseline size={14} aria-hidden />}
        label="흐리게"
        value={`${opacity}%`}
        disabled={disabled}
        // 목록이 100 → 25 순서라 «흐리게»가 +쪽이다
        onMinus={() => step("opacity", OPACITIES, opacity, -1)}
        onPlus={() => step("opacity", OPACITIES, opacity, 1)}
      />

      {isAdjusted(value) && (
        <>
          <Sep />
          <IconBtn label="이 줄 조절 되돌리기" active={false} disabled={disabled} onClick={() => onChange(undefined)}>
            <RotateCcw size={16} aria-hidden />
          </IconBtn>
        </>
      )}
    </div>
  );
}

function Sep() {
  return <span aria-hidden className="h-5 w-px shrink-0 bg-line" />;
}

function IconBtn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 shrink-0 items-center justify-center rounded-md border px-2 disabled:opacity-60 ${
        active
          ? "border-berry bg-berry-light text-berry-dark"
          : "border-line bg-surface text-sub hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function IconStepper(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  disabled?: boolean;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return <Stepper {...props} />;
}

function Stepper({
  icon,
  label,
  value,
  disabled,
  onMinus,
  onPlus,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  disabled?: boolean;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1" title={label}>
      {icon ?? <span className="text-caption text-sub">{label}</span>}
      <button
        type="button"
        aria-label={`${label} 줄이기`}
        disabled={disabled}
        onClick={onMinus}
        className="flex h-8 w-7 items-center justify-center rounded-md border border-line bg-surface text-sub hover:text-ink disabled:opacity-60"
      >
        <Minus size={14} aria-hidden />
      </button>
      <span className="min-w-[3rem] text-center text-caption text-ink">{value}</span>
      <button
        type="button"
        aria-label={`${label} 키우기`}
        disabled={disabled}
        onClick={onPlus}
        className="flex h-8 w-7 items-center justify-center rounded-md border border-line bg-surface text-sub hover:text-ink disabled:opacity-60"
      >
        <Plus size={14} aria-hidden />
      </button>
    </span>
  );
}
