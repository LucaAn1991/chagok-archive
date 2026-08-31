"use client";

import { useRef } from "react";
import { Check, ImagePlus, X } from "lucide-react";

/**
 * 기획안의 사진 섹션 — 추천 이미지에서 고르거나 내 사진을 올린다.
 *
 * 이미지 폴백 사슬(DESIGN §12): 사용자 사진 > 스톡 > text-only.
 * 「사진을 골라주세요」가 아니라 「이렇게 골랐어요. 바꾸고 싶으면 바꾸세요.」 —
 * 추천 1번이 미리 선택된 채로 시작한다 (DESIGN §1).
 *
 * @TODO: 무료 스톡 provider 미확정 (PLAN §12 미결 9) — 아래 추천 5장은 임시 이미지다.
 * @TODO: Firebase Storage 버킷 미생성 (PLAN §8) — 내 사진은 미리보기만 되고 저장은 안 된다.
 */

/** 임시 추천 이미지 — SVG 데이터 URI. 스톡 provider 확정 시 실제 이미지로 교체 */
function placeholderSvg(bg: string, accent: string, deco: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="250" viewBox="0 0 200 250">
    <rect width="200" height="250" fill="${bg}"/>
    ${deco.replaceAll("ACCENT", accent)}
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export type StockSuggestion = { id: string; label: string; src: string };

export const STOCK_SUGGESTIONS: StockSuggestion[] = [
  {
    id: "s1",
    label: "추천 1",
    src: placeholderSvg("#F2DCE5", "#A85578",
      '<circle cx="100" cy="105" r="52" fill="ACCENT" opacity="0.85"/><rect x="40" y="185" width="120" height="10" rx="5" fill="ACCENT" opacity="0.35"/>'),
  },
  {
    id: "s2",
    label: "추천 2",
    src: placeholderSvg("#EDE9F5", "#806FA6",
      '<rect x="35" y="55" width="130" height="90" rx="12" fill="ACCENT" opacity="0.8"/><rect x="35" y="160" width="90" height="10" rx="5" fill="ACCENT" opacity="0.4"/><rect x="35" y="180" width="120" height="10" rx="5" fill="ACCENT" opacity="0.25"/>'),
  },
  {
    id: "s3",
    label: "추천 3",
    src: placeholderSvg("#FCEFEA", "#F28A72",
      '<path d="M0 190 Q60 130 100 170 T200 150 V250 H0 Z" fill="ACCENT" opacity="0.7"/><circle cx="150" cy="70" r="26" fill="ACCENT" opacity="0.9"/>'),
  },
  {
    id: "s4",
    label: "추천 4",
    src: placeholderSvg("#F6F2F4", "#2D292B",
      '<rect x="45" y="90" width="110" height="12" rx="6" fill="ACCENT" opacity="0.85"/><rect x="45" y="118" width="80" height="12" rx="6" fill="ACCENT" opacity="0.55"/><rect x="45" y="146" width="95" height="12" rx="6" fill="ACCENT" opacity="0.3"/>'),
  },
  {
    id: "s5",
    label: "추천 5",
    src: placeholderSvg("#F0E6EA", "#914868",
      '<circle cx="55" cy="70" r="16" fill="ACCENT" opacity="0.8"/><circle cx="105" cy="70" r="16" fill="ACCENT" opacity="0.55"/><circle cx="155" cy="70" r="16" fill="ACCENT" opacity="0.3"/><rect x="39" y="120" width="122" height="80" rx="10" fill="ACCENT" opacity="0.2"/>'),
  },
];

type Props = {
  selectedStockId: string | null;
  userPhotos: string[]; // Object URL 미리보기
  onSelectStock: (id: string) => void;
  onAddUserPhotos: (files: FileList) => void;
  onRemoveUserPhoto: (url: string) => void;
};

export default function PlanPhotoPicker({
  selectedStockId,
  userPhotos,
  onSelectStock,
  onAddUserPhotos,
  onRemoveUserPhoto,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasUserPhotos = userPhotos.length > 0;

  return (
    <div>
      <h3 className="text-label font-semibold text-sub">사진</h3>
      <p className="mt-0.5 text-caption text-sub">
        {hasUserPhotos
          ? "올려주신 사진을 먼저 쓸게요."
          : "이렇게 골라뒀어요 — 바꾸거나 직접 올릴 수 있어요."}
      </p>

      {/* 2열 레이아웃(lg+)에서는 한 줄 2개 × 3줄 래핑 — 가로 스크롤·잘림 금지 (08-31).
          모바일은 기존 가로 스크롤 유지 */}
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-2 lg:overflow-visible lg:pb-0">
        {/* 내 사진 올리기 — 폴백 사슬 1순위 (DESIGN §12) */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-20 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-sm border border-dashed lg:h-20 lg:w-full border-line text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
        >
          <ImagePlus size={20} aria-hidden />
          <span className="text-caption">내 사진</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onAddUserPhotos(e.target.files);
            e.target.value = ""; // 같은 파일 재선택 허용
          }}
        />

        {/* 올린 사진 — 순서 = 배열 순서 (F13) */}
        {userPhotos.map((url, i) => (
          <div key={url} className="relative shrink-0 lg:w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`올린 사진 ${i + 1}`}
              className="h-20 w-16 rounded-sm border-2 border-berry object-cover lg:h-20 lg:w-full"
            />
            <button
              type="button"
              onClick={() => onRemoveUserPhoto(url)}
              aria-label={`올린 사진 ${i + 1} 삭제`}
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-pill border border-line bg-surface text-sub hover:text-ink"
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        ))}

        {/* 추천 이미지 5장 — 내 사진이 있으면 선택 표시를 걷는다 (폴백 사슬) */}
        {STOCK_SUGGESTIONS.map((s) => {
          const selected = !hasUserPhotos && s.id === selectedStockId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectStock(s.id)}
              aria-pressed={selected}
              className="flex shrink-0 flex-col text-center lg:w-full"
            >
              <span
                className={[
                  "relative block h-20 w-16 overflow-hidden rounded-sm border-2 lg:h-20 lg:w-full",
                  selected ? "border-berry" : "border-transparent",
                ].join(" ")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.src} alt="" className="h-full w-full object-cover" />
                {selected && (
                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-pill bg-berry text-white">
                    <Check size={12} aria-hidden />
                  </span>
                )}
              </span>
              <span
                className={[
                  "mt-1 block whitespace-normal break-keep text-caption",
                  selected ? "font-semibold text-berry-dark" : "text-sub",
                ].join(" ")}
              >
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* @TODO: 스톡 제공처 확정 후 실제 이미지로 교체 · 내 사진 저장은 Storage 연결 후 */}
      <p className="mt-1 text-caption text-sub">지금은 예시 이미지예요 — 곧 실제 추천으로 바뀌어요.</p>
    </div>
  );
}
