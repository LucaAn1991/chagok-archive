"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * 뒤로 가기 — 화면 왼쪽 위.
 *
 * **왔던 곳으로 돌아간다.** 카드 상세는 홈에서도 캘린더에서도 지난 기획에서도
 * 들어올 수 있어서, 링크를 한 곳으로 고정하면 어디서 왔든 엉뚱한 데로 보내게 된다.
 *
 * 다만 브라우저 기록이 없을 때(주소를 직접 치거나 새 탭으로 연 경우)는
 * `router.back()`이 아무 일도 하지 않는다. 그래서 `fallbackHref`를 반드시 받는다 —
 * 눌렀는데 아무 반응이 없는 버튼이 제일 나쁘다.
 *
 * `label`은 눈에 보이는 글자가 아니라 **읽어주는 이름**이다. 목적지가 상황에 따라
 * 달라지므로 「캘린더」처럼 특정 화면 이름을 쓰지 않는다.
 */
type Props = {
  /** 기록이 없을 때 갈 곳 */
  fallbackHref: string;
  /**
   * **늘 `fallbackHref`로 간다** (08-31).
   *
   * 돌아갈 곳이 하나로 정해진 화면에 쓴다. 슬라이드 편집처럼 한 화면 안에서
   * 이리저리 옮겨 다니면 기록이 쌓여서, «왔던 곳으로»가 바로 직전에 보던
   * 같은 화면을 가리키게 된다 — 사용자는 나가려는데 제자리를 맴돈다.
   */
  exact?: boolean;
  /** 화면에 보일 글자. 생략하면 아이콘만 */
  children?: React.ReactNode;
  label?: string;
};

export default function BackLink({
  fallbackHref,
  children,
  label = "뒤로 가기",
  exact,
}: Props) {
  const router = useRouter();

  function goBack() {
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

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={label}
      className="inline-flex h-11 items-center gap-1 text-body text-sub hover:text-ink"
    >
      <ArrowLeft size={16} aria-hidden />
      {children}
    </button>
  );
}
