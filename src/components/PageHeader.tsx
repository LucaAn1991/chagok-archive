"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * 공통 헤더 — [←] 화면 제목 (08-31 확정).
 * 홈·AI 기획이 같은 컴포넌트를 쓴다. 화면마다 따로 만들지 않는다.
 * 뒤로가기는 브라우저 히스토리 이동. 히스토리가 없으면(첫 진입) 화살표를 그리지 않는다.
 */
const subscribe = () => () => {};

export default function PageHeader({ title }: { title?: string }) {
  const router = useRouter();
  // SSR에서는 false → 첫 진입 하이드레이션과 일치. 클라이언트에서만 히스토리를 본다
  const canGoBack = useSyncExternalStore(
    subscribe,
    () => window.history.length > 1,
    () => false,
  );

  if (!canGoBack && !title) return null;

  return (
    <div className="-ml-2 flex h-10 items-center gap-1">
      {canGoBack && (
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="뒤로가기"
          className="flex h-10 w-10 items-center justify-center rounded-md text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
        >
          <ChevronLeft size={22} aria-hidden />
        </button>
      )}
      {title && <h1 className="text-title font-bold text-ink">{title}</h1>}
    </div>
  );
}
