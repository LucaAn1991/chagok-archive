"use client";

import { useRef } from "react";
import { ImagePlus, X } from "lucide-react";

/**
 * 기획안의 사진 섹션 — 내 사진을 올린다.
 *
 * 올린 사진은 기획에 저장되고, 카드를 만들 때 **주소만 물려준다** (08-31).
 *
 * **스톡 추천 칩은 없앴다 (08-31).** 자리표시용 SVG 5장이 놓여 있었는데,
 * 스톡은 **제작 단계에서** 슬라이드 내용을 보고 고르는 쪽이 훨씬 잘 맞는다
 * (`lib/ai/slides.ts` — AI가 장면에 맞는 영어 검색어를 내고 Pexels에서 찾는다).
 * 기획 시점에는 카드 내용이 아직 없어 주제 하나로만 검색하게 되고,
 * 무엇보다 «고를 수 있는 것처럼 보이는데 아무 데도 반영되지 않는» 칩이었다.
 *
 * 이미지 폴백 사슬(DESIGN §12)은 그대로다 — 사용자 사진 > 스톡 > text-only.
 * 여기서 안 올려도 제작 단계에서 스톡이 채워지고, 그것도 없으면 글자로 완성된다.
 */

type Props = {
  /** 올린 사진 주소. 업로드 중인 것은 blob: 미리보기 */
  userPhotos: string[];
  onAddUserPhotos: (files: FileList) => void;
  onRemoveUserPhoto: (url: string) => void;
};

export default function PlanPhotoPicker({
  userPhotos,
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
          : "없어도 괜찮아요. 없으면 어울리는 사진을 찾아 넣어드려요."}
      </p>

      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {/* 내 사진 올리기 — 폴백 사슬 1순위 (DESIGN §12) */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-20 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-line text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
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
          <div key={url} className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`올린 사진 ${i + 1}`}
              className="h-20 w-16 rounded-sm border-2 border-berry object-cover"
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
      </div>
    </div>
  );
}
