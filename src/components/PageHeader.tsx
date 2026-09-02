"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * 공통 헤더 — [←] 화면 제목 (08-31 확정).
 * 홈·AI 기획이 같은 컴포넌트를 쓴다. 화면마다 따로 만들지 않는다.
 * 뒤로가기는 브라우저 히스토리 이동. 히스토리가 없으면(첫 진입) 화살표를 그리지 않는다.
 *
 * 09-01 통합 — 뒤로가기 컴포넌트가 `BackLink`와 둘로 갈려 있어 이쪽으로 합쳤다.
 * `BackLink`가 갖고 있던 안전장치 두 가지를 **선택 옵션**으로 옮겨 담았고,
 * 아무것도 넘기지 않으면 위에 적힌 기본 동작 그대로다.
 */
const subscribe = () => () => {};

export default function PageHeader({
  title,
  action,
  backLabel,
  fallbackHref,
  exact,
  isRoot,
}: {
  title?: string;
  action?: React.ReactNode; // 오른쪽 끝 텍스트 버튼 자리 (예: AI 기획의 [새 기획])
  /** 화살표 옆에 보일 글자. 생략하면 아이콘만 */
  backLabel?: string;
  /**
   * 기록이 없을 때 갈 곳. 넘기면 화살표를 **항상** 그린다 —
   * 주소를 직접 치거나 새 탭으로 연 경우 `router.back()`이 아무 일도 하지 않아서,
   * 화살표가 사라지거나 눌러도 반응이 없는 화면이 된다.
   */
  fallbackHref?: string;
  /**
   * **늘 `fallbackHref`로 간다.**
   *
   * 돌아갈 곳이 하나로 정해진 화면에 쓴다. 슬라이드 편집처럼 한 화면 안에서
   * 이리저리 옮겨 다니면 기록이 쌓여서, 「뒤로」가 바로 직전에 보던
   * 같은 화면을 가리키게 된다 — 사용자는 나가려는데 제자리를 맴돈다.
   */
  exact?: boolean;
  /**
   * **최상위 화면 — 뒤로가기를 그리지 않는다** (09-02).
   *
   * 홈·AI 기획·캘린더는 GNB로 오가는 자리라 「돌아갈 곳」이 없다. 그런데 기본 동작이
   * `history.length > 1`이라, 로그인을 거쳐 들어오면 홈 좌상단에 화살표가 생겼다 —
   * 눌러봐야 로그인 화면으로 나가버린다.
   */
  isRoot?: boolean;
}) {
  const router = useRouter();
  // SSR에서는 false → 첫 진입 하이드레이션과 일치. 클라이언트에서만 히스토리를 본다
  const hasHistory = useSyncExternalStore(
    subscribe,
    () => window.history.length > 1,
    () => false,
  );
  // 돌아갈 곳을 받아뒀으면 기록이 없어도 보낼 데가 있다
  const canGoBack = isRoot ? false : fallbackHref ? true : hasHistory;

  function goBack() {
    if (!fallbackHref) {
      router.back();
      return;
    }
    if (exact) {
      router.push(fallbackHref);
      return;
    }
    /*
      이 앱 안에서 넘어온 것인지 본다. history.length는 새 탭에서 1이고,
      다른 사이트에서 넘어온 경우 referrer가 우리 도메인이 아니다.
      둘 중 하나라도 걸리면 뒤로 가봐야 앱 밖으로 나가거나 아무 일도 안 일어난다.
    */
    const cameFromApp =
      window.history.length > 1 &&
      (document.referrer === "" || document.referrer.startsWith(window.location.origin));

    if (cameFromApp) router.back();
    else router.push(fallbackHref);
  }

  if (!canGoBack && !title && !action) return null;

  return (
    <div className="-ml-2 flex h-10 items-center gap-1">
      {canGoBack && (
        <button
          type="button"
          onClick={goBack}
          aria-label="뒤로가기"
          className={[
            "flex h-10 items-center justify-center rounded-md text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink",
            backLabel ? "gap-0.5 pl-1 pr-2" : "w-10",
          ].join(" ")}
        >
          <ChevronLeft size={22} aria-hidden />
          {backLabel && <span className="text-body">{backLabel}</span>}
        </button>
      )}
      {title && <h1 className="text-title font-bold text-ink">{title}</h1>}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}
