"use client";

import { useState } from "react";

/**
 * 단순 확인 모달 (admin-design.md Interaction).
 * 위험 행위는 danger + reasonRequired — 사유 없이는 확인 버튼이 안 눌린다
 * (감사 로그 reason 필수 행위와 짝, 백오피스 기획 §2-⑥).
 */
export default function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "확인",
  danger = false,
  reasonRequired = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  reasonRequired?: boolean;
  busy?: boolean;
  onConfirm: (reason?: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="w-[400px] rounded-md bg-white p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3 className="text-base font-semibold text-[#1F2937]">{title}</h3>
        {description && <p className="mt-2 text-sm text-[#6B7280]">{description}</p>}
        {reasonRequired && (
          <label className="mt-3 block text-sm text-[#1F2937]">
            사유 <span className="text-xs text-[#6B7280]">(감사 로그에 남습니다)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#E5E7EB] px-3 py-1.5 text-sm"
            />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-[#E5E7EB] px-3 py-1.5 text-sm disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy || (reasonRequired && !reason.trim())}
            onClick={() => onConfirm(reasonRequired ? reason.trim() : undefined)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
              danger ? "bg-red-600" : "bg-[#1677FF]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
