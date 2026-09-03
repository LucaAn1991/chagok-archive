"use client";

import { useState } from "react";
import type { Promo, Targeting } from "@/types";

/**
 * 세부 대상·홍보 대상 질문지 (09-03) — **기획 단계 ②에서 받는다.**
 *
 * 예전엔 다듬기(⑤)에 있었는데, 그러면 기획안이 이미 만들어진 뒤라 생성에는 안 쓰였다.
 * ②로 옮겨서 기획안을 만들 때 먹인다. 전부 선택 — 비워도 그대로 흐른다.
 *
 * 여기서 «UI만» 담당한다. 저장은 부모가 한다 (기획 문서에 한 번).
 */

const AGE_OPTIONS = ["10대", "20대", "30대", "40대", "50대", "60대+"];
const GENDER_OPTIONS = ["여성", "남성"];
const TONE_OPTIONS = ["가볍게", "친근하게", "진지하게", "전문가처럼"];
const TIME_OPTIONS = ["아침", "점심", "저녁", "심야"];

/** 네 줄의 칩(연령·성별·말투·시간대)을 한 덩어리로 */
export function TargetingChips({
  targeting,
  disabled,
  onPick,
}: {
  targeting?: Targeting;
  disabled: boolean;
  onPick: (patch: Targeting) => void;
}) {
  return (
    <div>
      <TargetRow
        label="연령"
        options={AGE_OPTIONS}
        value={targeting?.ageRange}
        disabled={disabled}
        onPick={(v) => onPick({ ageRange: v })}
      />
      <TargetRow
        label="성별"
        options={GENDER_OPTIONS}
        value={targeting?.gender}
        disabled={disabled}
        onPick={(v) => onPick({ gender: v })}
      />
      <TargetRow
        label="말투"
        options={TONE_OPTIONS}
        value={targeting?.tone}
        disabled={disabled}
        onPick={(v) => onPick({ tone: v })}
      />
      <TargetRow
        label="시간대"
        options={TIME_OPTIONS}
        value={targeting?.timeOfDay}
        disabled={disabled}
        onPick={(v) => onPick({ timeOfDay: v })}
      />
    </div>
  );
}

function TargetRow({
  label,
  options,
  value,
  disabled,
  onPick,
}: {
  label: string;
  options: string[];
  value?: string;
  disabled: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="w-10 shrink-0 text-label text-sub">{label}</span>
      {options.map((o) => {
        const on = value === o;
        return (
          <button
            key={o}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            /* 켜진 걸 다시 누르면 끈다 — 빈 문자열이 «지움»으로 읽힌다 */
            onClick={() => onPick(on ? "" : o)}
            className={[
              "h-8 rounded-pill px-3 text-label font-semibold transition-colors duration-200 disabled:opacity-60",
              on ? "bg-berry text-white" : "border border-line bg-surface text-ink hover:bg-surface-muted",
            ].join(" ")}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 홍보 대상 입력 (09-03) — 상품·브랜드명 / 인스타 계정명.
 * 칸을 벗어날 때(blur) 저장한다 — 글자마다 저장하면 요청이 쏟아진다.
 */
export function PromoFields({
  promo,
  disabled,
  onSave,
}: {
  promo?: Promo;
  disabled: boolean;
  onSave: (patch: Promo) => void;
}) {
  const [brandName, setBrandName] = useState(promo?.brandName ?? "");
  const [handle, setHandle] = useState(promo?.handle ?? "");

  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="text-label font-semibold text-sub">카드에 넣을 이름</p>
      <div className="mt-2 flex flex-col gap-2">
        <label className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-label text-sub">브랜드·상품</span>
          <input
            value={brandName}
            disabled={disabled}
            onChange={(e) => setBrandName(e.target.value)}
            onBlur={() => brandName !== (promo?.brandName ?? "") && onSave({ brandName })}
            placeholder="홍보하려면 입력"
            className="h-9 flex-1 rounded-md border border-line bg-surface px-2.5 text-caption text-ink outline-none focus:border-berry placeholder:text-sub disabled:opacity-60"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-label text-sub">인스타</span>
          <span className="flex h-9 flex-1 items-center rounded-md border border-line bg-surface pl-2.5 focus-within:border-berry">
            <span className="text-caption text-sub">@</span>
            <input
              value={handle}
              disabled={disabled}
              onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
              onBlur={() => handle !== (promo?.handle ?? "") && onSave({ handle })}
              placeholder="계정명"
              className="h-full flex-1 bg-transparent px-1 text-caption text-ink outline-none placeholder:text-sub disabled:opacity-60"
            />
          </span>
        </label>
      </div>
      <p className="mt-1.5 text-label text-sub">
        비워두면 계정 닉네임이 들어가요.
      </p>
    </div>
  );
}
