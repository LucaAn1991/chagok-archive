"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

/**
 * 「이 장만 다시 만들기」 편집 패널 (09-03).
 *
 * **편집기를 대신한다.** 시안 그림은 우리 렌더러로 못 고치므로, 그림을 손대는 대신
 * **문구를 고쳐 다시 굽는다**. 두 가지를 받는다:
 *   ① 이 장에 들어간 문구 — 줄별로 수정. 글자 치환이라 **믿을 만하다**
 *   ② 「이렇게 바꿔줘」 자유 지시 — gpt-image-2가 어길 수 있어 **기대치를 낮춰** 둔다
 *
 * 자리 수는 시안이 정하므로 **줄을 늘리거나 지우지 못한다.** 각 줄의 내용만 고친다.
 */
export default function SlideRemakePanel({
  lines,
  busy,
  onApply,
  onUploadPhoto,
  onClose,
}: {
  lines: string[];
  busy: boolean;
  onApply: (lines: string[], request: string, photoUrl: string | null) => void;
  onUploadPhoto: (file: File) => Promise<string | null>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<string[]>(lines);
  const [request, setRequest] = useState("");
  /* 이 장에 새로 넣을 사진 (09-03). null이면 원래 사진 그대로 */
  const [photo, setPhoto] = useState<{ url: string; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex w-72 flex-col gap-3 rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center justify-between">
        <p className="text-caption font-semibold text-ink">이 장 문구</p>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="text-caption text-sub transition-colors duration-200 hover:text-ink disabled:opacity-50"
        >
          닫기
        </button>
      </div>

      {/* 줄별 입력 — 줄 수는 시안이 정하므로 고정. 내용만 고친다 */}
      <div className="flex flex-col gap-1.5">
        {draft.map((line, i) => (
          <textarea
            key={i}
            rows={line.includes("\n") ? 2 : 1}
            value={line}
            data-focus-ring="none"
            onChange={(e) =>
              setDraft((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
            }
            aria-label={`${i + 1}번째 문구`}
            className="min-h-[36px] w-full resize-none rounded-md border border-line bg-surface px-2 py-1.5
                       text-caption text-ink outline-none focus:border-berry"
          />
        ))}
      </div>

      {/*
        사진 교체 (09-03) — 이 장에 넣을 사진을 새로 올린다. 비우면 원래 사진 그대로.
        올린 사진은 다시 만들 때 이 장에만 쓰인다(전체 사진 목록엔 안 쌓인다).
      */}
      <div>
        <p className="text-caption font-semibold text-ink">사진 바꾸기</p>
        <p className="mt-0.5 text-label text-sub">안 올리면 지금 사진 그대로예요.</p>
        <div className="mt-1.5">
          {photo ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.preview} alt="새 사진" className="h-16 w-16 rounded-md border border-line object-cover" />
              <button
                type="button"
                onClick={() => setPhoto(null)}
                aria-label="사진 취소"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-pill border border-line bg-surface text-sub hover:text-ink"
              >
                <X size={11} aria-hidden />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || busy}
              className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink disabled:opacity-60"
            >
              {uploading ? (
                <span className="text-label">올리는 중</span>
              ) : (
                <>
                  <ImagePlus size={18} aria-hidden />
                  <span className="text-label">사진</span>
                </>
              )}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setUploading(true);
              const url = await onUploadPhoto(file);
              setUploading(false);
              if (url) setPhoto({ url, preview: URL.createObjectURL(file) });
            }}
          />
        </div>
      </div>

      {/* 자유 지시 — 기대치를 낮춰 명시한다. 안 먹혀도 «부탁이 안 통한 것»이다 */}
      <div>
        <label htmlFor="remake-req" className="text-caption font-semibold text-ink">
          이렇게 바꿔달라고 부탁하기
        </label>
        <p className="mt-0.5 text-label text-sub">
          «무릎 보호대를 더 크게» 처럼요. 반영이 안 될 수도 있어요.
        </p>
        <textarea
          id="remake-req"
          rows={2}
          value={request}
          data-focus-ring="none"
          onChange={(e) => setRequest(e.target.value)}
          placeholder="비워둬도 돼요"
          className="mt-1.5 w-full resize-none rounded-md border border-line bg-surface px-2 py-1.5
                     text-caption text-ink outline-none focus:border-berry placeholder:text-sub"
        />
      </div>

      <button
        type="button"
        onClick={() => onApply(draft, request.trim(), photo?.url ?? null)}
        disabled={busy}
        className="flex h-10 items-center justify-center rounded-md bg-berry text-caption font-semibold
                   text-white transition-colors duration-200 hover:bg-berry-dark disabled:opacity-60"
      >
        {busy ? "만드는 중··· (20초쯤 걸려요)" : "이 문구로 다시 만들기"}
      </button>
    </div>
  );
}
