"use client";

import { useRef } from "react";
import { Check, ImagePlus, X } from "lucide-react";
import type { StockPick } from "@/types";

/**
 * 기획안의 사진 섹션 — 추천 사진에서 고르거나 내 사진을 올린다.
 *
 * 이미지 폴백 사슬(DESIGN §12): 사용자 사진 > 스톡 > text-only.
 * 「사진을 골라주세요」가 아니라 「이렇게 골랐어요. 바꾸고 싶으면 바꾸세요.」 —
 * 첫 장이 미리 선택된 채로 시작한다 (DESIGN §1).
 *
 * **추천은 실제 스톡 사진이다 (09-01).** 예전에는 자리표시용 SVG 5장이 박혀
 * 있었는데, 고를 수는 있지만 어디에도 반영되지 않는 칩이었다. 지금은
 * `GET /api/plans/[planId]/stock`이 주제로 찾아온 사진이 오고,
 * 여기서 고른 한 장이 카드 첫 이미지 자리까지 그대로 간다.
 */

type Props = {
  /** true면 화면 폭과 무관하게 2열 그리드로 래핑 (모바일 「다른 사진 고르기」 펼침용) */
  wrap?: boolean;
  /** true면 «사진» 제목·안내 문구를 숨긴다 — 펼침 영역엔 타일만 */
  hideIntro?: boolean;
  /** 주제로 찾아온 추천 사진. 아직 못 받았으면 빈 배열 */
  stockOptions: StockPick[];
  /** 추천을 불러오는 중 — 빈 자리 대신 뼈대를 보여준다 */
  stockLoading: boolean;
  /** 고른 추천 사진의 주소. 안 골랐으면 null */
  selectedStockUrl: string | null;
  userPhotos: string[]; // Object URL 미리보기
  onSelectStock: (photo: StockPick) => void;
  onAddUserPhotos: (files: FileList) => void;
  onRemoveUserPhoto: (url: string) => void;
};

export default function PlanPhotoPicker({
  wrap,
  hideIntro,
  stockOptions,
  stockLoading,
  selectedStockUrl,
  userPhotos,
  onSelectStock,
  onAddUserPhotos,
  onRemoveUserPhoto,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasUserPhotos = userPhotos.length > 0;
  // wrap 모드(모바일 펼침)에서는 타일이 셀 폭을 채운다 — 기본은 기존 반응형 그대로
  // wrap: 타일 폭 = (박스 안쪽 폭 − 간격 2개) / 3 이 그리드에서 자동 계산 — 정사각 유지
  const tileSize = wrap ? "aspect-square w-full" : "h-20 w-16 lg:h-20 lg:w-full";
  const cellWidth = wrap ? "w-full" : "lg:w-full";

  /* 추천을 한 장도 못 받은 경우 — 키가 없거나 검색이 빈손이었다.
     화면을 비워두지 않고 「내 사진」만으로도 넘어갈 수 있다고 알린다 (DESIGN §12) */
  const noStock = !stockLoading && stockOptions.length === 0;

  return (
    <div>
      {!hideIntro && (
        <>
          <h3 className="text-label font-semibold text-sub">사진</h3>
          <p className="mt-0.5 text-caption text-sub">
            {hasUserPhotos
              ? "올려주신 사진을 먼저 쓸게요."
              : noStock
                ? "사진을 올리면 그걸 먼저 써요. 없어도 글자만으로 완성돼요."
                : "이렇게 골라뒀어요 — 바꾸거나 직접 올릴 수 있어요."}
          </p>
        </>
      )}

      {/* 2열 레이아웃(lg+)에서는 한 줄 2개 × 3줄 래핑 — 가로 스크롤·잘림 금지 (08-31).
          모바일은 기존 가로 스크롤 유지 */}
      <div
        className={
          wrap
            ? "mt-2 grid grid-cols-3 gap-2"
            : "mt-2 flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-2 lg:overflow-visible lg:pb-0"
        }
      >
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
          <div key={url} className={`relative shrink-0 ${cellWidth}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`올린 사진 ${i + 1}`}
              className={`${tileSize} rounded-sm border-2 border-berry object-cover`}
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

        {/* 불러오는 중 — 자리를 미리 잡아둔다. 칸이 갑자기 늘면 그리드가 튄다 */}
        {stockLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={`skeleton-${i}`} className={`shrink-0 ${cellWidth}`}>
              <div className={`${tileSize} animate-pulse rounded-sm bg-surface-muted`} />
            </div>
          ))}

        {/* 추천 사진 — 내 사진이 있으면 선택 표시를 걷는다 (폴백 사슬) */}
        {!stockLoading &&
          stockOptions.map((photo, i) => {
            const selected = !hasUserPhotos && photo.imageUrl === selectedStockUrl;
            return (
              <button
                key={photo.imageUrl}
                type="button"
                onClick={() => onSelectStock(photo)}
                aria-pressed={selected}
                aria-label={`추천 사진 ${i + 1} 고르기`}
                className={`flex shrink-0 flex-col text-center ${cellWidth}`}
              >
                <span
                  className={[
                    `relative block ${tileSize} overflow-hidden rounded-sm border-2`,
                    selected ? "border-berry" : "border-transparent",
                  ].join(" ")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.imageUrl} alt="" className="h-full w-full object-cover" />
                  {selected && (
                    <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-pill bg-berry text-white">
                      <Check size={12} aria-hidden />
                    </span>
                  )}
                </span>
                <span
                  className={[
                    "mt-1 block truncate text-caption",
                    selected ? "font-semibold text-berry-dark" : "text-sub",
                  ].join(" ")}
                >
                  {photo.photographer}
                </span>
              </button>
            );
          })}
      </div>

      {noStock && !hideIntro && (
        <p className="mt-1 text-caption text-sub">
          지금은 추천할 사진을 찾지 못했어요. 내 사진을 올리거나 그냥 넘어가도 괜찮아요.
        </p>
      )}
    </div>
  );
}
