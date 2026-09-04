"use client";

import { useEffect, useRef, useState } from "react";
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
 *
 * **모달로 띄운다** (09-04). 예전엔 카드 아래에 펼쳐지는 패널이었는데, 그 줄이
 * 좌우 스크롤(`overflow-x-auto`)이라 폭이 288px로 묶이고 옆 카드에 가려졌다.
 * 고칠 줄이 네댓이면 한 화면에 안 들어와 무엇을 고치는 중인지 놓치기 쉬웠다.
 * 「그림 고르기」(`SlideComparePanel`)와 같은 껍데기를 쓴다 — 이어지는 두 걸음이라
 * 생김새가 같아야 한다.
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

  /* Esc로 닫는다 — 만드는 중(busy)에는 막는다. 20초짜리 작업을 실수로 놓치지 않게 */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="remake-title"
      /* 바깥을 눌러도 닫힌다 — 만드는 중에는 안 닫는다 */
      onClick={() => { if (!busy) onClose(); }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-4 sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-[440px] flex-col gap-3 overflow-y-auto rounded-lg bg-surface p-5"
      >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="remake-title" className="text-body font-bold text-ink">이 장만 다시 만들기</h2>
          <p className="mt-0.5 text-caption text-sub">
            문구를 고쳐 다시 구워요. 고른 뒤에 바꿀지 정할 수 있어요.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="닫기"
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-sub
                     transition-colors duration-200 hover:bg-surface-muted hover:text-ink disabled:opacity-50"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <p className="text-caption font-semibold text-ink">이 장 문구</p>

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

        **사진틀이 있는 장에만 열던 것을 09-04에 없앴다.** 시안에 사진 자리가
        몇 개인지로 우리가 미리 판단하지 않는다 — 올린 사진을 그대로 넘기고
        어디에 어떻게 넣을지는 gpt-image-2가 정한다. 사용자 결정.
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
    </div>
  );
}
