"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, RotateCcw, X } from "lucide-react";
import {
  MAX_PHOTO_BYTES,
  PHOTO_CONTENT_TYPES,
  isAllowedContentType,
} from "@/lib/storage/limits";

/**
 * 재료 추가의 사진 섹션 (F13).
 *
 * 서버가 발급한 서명 URL로 브라우저 → Storage에 **직접** 올린다
 * (`POST /api/cards/[cardId]/photos`). 파일은 앱 서버를 지나가지 않는다.
 *
 * 실패 처리 원칙 (PLAN.md §3-1 F13): **개별 사진 실패는 그 사진만 인라인으로 표시**하고
 * 나머지는 그대로 둔다. 한 장이 실패했다고 전체를 되돌리지 않는다.
 *
 * 버킷이 아직 없으면(PLAN.md §8) API가 503 + `storage_not_configured`로 답한다.
 * 그때는 오류가 아니라 「준비 중」으로 조용히 내려앉는다 — 사진은 없어도
 * 카드뉴스가 완성되는 «있으면 쓰는» 재료다 (DESIGN.md §12).
 */

type Pending = {
  id: string;
  previewUrl: string; // Object URL — 업로드 성공·제거 시 해제한다
  file: File;
  error: string | null; // null이면 업로드 중
};

type Props = {
  cardId: string;
  photoUrls: string[];
  onChange: (urls: string[]) => void;
  getToken: () => Promise<string>;
  maxPhotos: number;
};

export default function CardPhotoUploader({
  cardId,
  photoUrls,
  onChange,
  getToken,
  maxPhotos,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [storageReady, setStorageReady] = useState(true);

  /*
    Object URL은 명시적으로 해제하지 않으면 탭이 닫힐 때까지 메모리에 남는다.
    개별 해제는 업로드 성공·제거 시점에 하고, 여기서는 «떠날 때 남아 있던 것»을 치운다.
    정리 함수는 언마운트 때 한 번만 돌아야 하므로(의존성 []) 최신 목록을 ref로 따로 들고 있는다.
  */
  const pendingRef = useRef<Pending[]>([]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    return () => {
      for (const p of pendingRef.current) URL.revokeObjectURL(p.previewUrl);
    };
  }, []);

  const total = photoUrls.length + pending.length;
  const remaining = Math.max(0, maxPhotos - total);

  function addFiles(files: FileList) {
    const accepted: Pending[] = [];
    for (const file of Array.from(files).slice(0, remaining)) {
      const error = validate(file);
      accepted.push({
        id: newPendingId(),
        previewUrl: URL.createObjectURL(file),
        file,
        error,
      });
    }
    if (accepted.length === 0) return;

    setPending((prev) => [...prev, ...accepted]);
    for (const item of accepted) {
      if (item.error === null) void upload(item);
    }
  }

  async function upload(item: Pending) {
    try {
      const token = await getToken();

      const ticketRes = await fetch(`/api/cards/${cardId}/photos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ contentType: item.file.type }),
      });

      if (!ticketRes.ok) {
        const data = (await ticketRes.json().catch(() => null)) as
          | { error?: string; reason?: string }
          | null;

        // 버킷 미생성은 «실패»가 아니라 «아직 안 열림» — 섹션 전체를 준비 중으로 바꾼다
        if (ticketRes.status === 503) {
          setStorageReady(false);
          removePending(item.id);
          return;
        }
        throw new Error(data?.error ?? "업로드하지 못했어요.");
      }

      const ticket = (await ticketRes.json()) as {
        uploadUrl: string;
        headers: Record<string, string>;
        readUrl: string;
      };

      // 파일 본체는 Storage로 직접 간다. 헤더는 서명에 포함돼 있어 그대로 실어야 한다
      const putRes = await fetch(ticket.uploadUrl, {
        method: "PUT",
        headers: ticket.headers,
        body: item.file,
      });
      if (!putRes.ok) throw new Error("업로드하지 못했어요.");

      // 성공한 것만 목록에 올린다. 저장은 부모의 «저장하고 제작하기»가 한다
      onChange([...photoUrls, ticket.readUrl]);
      removePending(item.id);
    } catch (e) {
      const message =
        e instanceof Error && e.message ? e.message : "업로드하지 못했어요.";
      setPending((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, error: message } : p)),
      );
    }
  }

  function removePending(id: string) {
    setPending((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function retry(id: string) {
    const target = pending.find((p) => p.id === id);
    if (!target) return;
    setPending((prev) =>
      prev.map((p) => (p.id === id ? { ...p, error: null } : p)),
    );
    void upload({ ...target, error: null });
  }

  if (!storageReady) {
    return (
      <section
        aria-label="사진"
        className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-6"
      >
        <span className="text-label font-semibold text-sub">사진</span>
        <div className="flex h-28 items-center justify-center rounded-md bg-surface-muted">
          <p className="text-body text-sub">사진 업로드는 준비 중이에요</p>
        </div>
        <p className="text-caption text-sub">
          사진이 없어도 카드뉴스는 완성돼요 — 지금은 텍스트 중심으로 만들어져요.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="사진"
      className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-6"
    >
      <span className="text-label font-semibold text-sub">사진</span>
      <p className="text-caption text-sub">
        {photoUrls.length > 0
          ? "올려주신 사진을 먼저 쓸게요."
          : "없어도 괜찮아요. 있으면 카드뉴스에 먼저 써요."}
      </p>

      <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
        {/* 올리기 — 상한에 닿으면 감춘다 */}
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-20 w-16 shrink-0 flex-col items-center justify-center gap-1
                       rounded-sm border border-dashed border-line text-sub
                       transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
          >
            <ImagePlus size={20} aria-hidden />
            <span className="text-caption">사진 추가</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={PHOTO_CONTENT_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = ""; // 같은 파일 재선택 허용
          }}
        />

        {/* 올라간 사진 — 순서 = 배열 순서 (F13) */}
        {photoUrls.map((url, i) => (
          <div key={url} className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`올린 사진 ${i + 1}`}
              className="h-20 w-16 rounded-sm border-2 border-berry object-cover"
            />
            <button
              type="button"
              onClick={() => onChange(photoUrls.filter((u) => u !== url))}
              aria-label={`올린 사진 ${i + 1} 빼기`}
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center
                         rounded-pill border border-line bg-surface text-sub hover:text-ink"
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        ))}

        {/* 올리는 중 · 실패 — 실패한 장만 그 자리에 표시한다 */}
        {pending.map((p) => (
          <div key={p.id} className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.previewUrl}
              alt=""
              className={[
                "h-20 w-16 rounded-sm border-2 object-cover",
                p.error ? "border-line opacity-40" : "border-line opacity-60",
              ].join(" ")}
            />
            {p.error === null && (
              <span className="absolute inset-0 flex items-center justify-center text-caption text-white drop-shadow">
                올리는 중
              </span>
            )}
            {p.error !== null && (
              <button
                type="button"
                onClick={() => retry(p.id)}
                aria-label="다시 시도"
                className="absolute inset-0 flex flex-col items-center justify-center gap-0.5
                           rounded-sm bg-surface/70 text-caption text-ink"
              >
                <RotateCcw size={14} aria-hidden />
                다시
              </button>
            )}
            <button
              type="button"
              onClick={() => removePending(p.id)}
              aria-label="이 사진 빼기"
              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center
                         rounded-pill border border-line bg-surface text-sub hover:text-ink"
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        ))}
      </div>

      {/* 실패 사유는 썸네일 아래 한 줄씩 — 어떤 사진이 왜 안 됐는지 보이게 */}
      {pending.some((p) => p.error) && (
        <ul className="flex flex-col gap-0.5">
          {pending
            .filter((p) => p.error)
            .map((p) => (
              <li key={p.id} role="alert" className="text-caption text-sub">
                {p.file.name} — {p.error}
              </li>
            ))}
        </ul>
      )}

      <p className="text-caption text-sub">
        JPG · PNG · WEBP · 장당 {Math.floor(MAX_PHOTO_BYTES / 1024 / 1024)}MB까지 ·
        최대 {maxPhotos}장{remaining === 0 && " (다 채웠어요)"}
      </p>
    </section>
  );
}

/**
 * 올리는 중인 항목을 구분할 임시 키. 파일 이름은 겹칠 수 있어 쓰지 않는다.
 *
 * 컴포넌트 밖에 두는 이유: 렌더 중 호출되면 값이 매번 달라져 React가 같은 항목을
 * 다른 것으로 보게 된다. 모듈 함수로 빼두면 이벤트 핸들러에서만 부르게 된다.
 */
function newPendingId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 올리기 전에 거른다 — 서버까지 갔다 오지 않고 그 자리에서 알려주는 쪽이 빠르다 */
function validate(file: File): string | null {
  if (!isAllowedContentType(file.type)) {
    return "JPG · PNG · WEBP만 올릴 수 있어요.";
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `${Math.floor(MAX_PHOTO_BYTES / 1024 / 1024)}MB보다 작은 사진만 올릴 수 있어요.`;
  }
  return null;
}
