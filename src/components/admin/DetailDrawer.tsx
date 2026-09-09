"use client";

/**
 * 우측 상세 Drawer (admin-design.md Interaction — Detail: Drawer preferred).
 * 목록에서 행을 누르면 열리고, 큰 편집은 별도 페이지로 간다.
 */
export default function DetailDrawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="absolute right-0 top-0 flex h-full w-[480px] flex-col bg-white"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#E5E7EB] px-5">
          <h3 className="text-base font-semibold text-[#1F2937]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-lg text-[#6B7280] hover:text-[#1F2937]"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 text-sm text-[#1F2937]">{children}</div>
      </div>
    </div>
  );
}
