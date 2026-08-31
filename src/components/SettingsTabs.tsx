"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 설정 탭 — [콘텐츠] / [계정] (`PlanTabs`와 같은 구조).
 *
 * **이게 없으면 로그아웃에 갈 수가 없다.** 사이드바의 프로필은 콘텐츠 설정으로
 * 바로 들어오는데, 로그아웃은 계정 설정에 있어서 08-31까지 주소를 직접 치는 것
 * 말고는 도달할 방법이 없었다.
 *
 * @TODO: DESIGN.md §4가 말하는 «프로필 메뉴 팝업»으로 바꿀지 검토
 *   (설정-계정 · 설정-콘텐츠 · 로그아웃을 사이드바에서 바로 펼치는 형태).
 *   지금은 탭이 더 단순하고, 설정이 두 개뿐이라 이걸로 충분하다.
 */
const TABS = [
  { href: "/settings/content", label: "콘텐츠" },
  { href: "/settings/account", label: "계정" },
] as const;

export default function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="설정 탭" className="flex gap-1 border-b border-line">
      {TABS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
              "flex h-11 items-center border-b-2 px-4 text-body transition-colors duration-200",
              active
                ? "border-berry font-semibold text-berry-dark"
                : "border-transparent text-sub hover:text-ink",
            ].join(" ")}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
