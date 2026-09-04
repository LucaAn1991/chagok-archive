"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 설정 탭 — [콘텐츠] / [계정] (`PlanTabs`와 같은 구조).
 *
 * **원래는 이게 없으면 로그아웃에 갈 수가 없었다.** 프로필을 누르면 콘텐츠 설정으로
 * 바로 들어오는데 로그아웃은 계정 설정에 있어서, 08-31까지 주소를 직접 치는 것
 * 말고는 도달할 방법이 없었다.
 *
 * 09-04에 프로필 메뉴(`ProfileMenu`)가 생겨 설정·계정·로그아웃으로 바로 간다 —
 * DESIGN.md §4가 말하던 그 팝업이다. **이 탭은 그대로 둔다.** 설정 화면 안에서
 * 둘 사이를 오갈 때 상단 바까지 올라갔다 오게 하면 걸음이 늘어난다.
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
