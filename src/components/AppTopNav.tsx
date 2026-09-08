"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, House, Sparkles } from "lucide-react";
import { LogoSymbol } from "@/components/Logo";
import ProfileMenu from "@/components/ProfileMenu";

/**
 * 상단 메뉴바 (09-04) — 사이드바(`AppSidebar`)를 대신한다.
 * DESIGN.md §4 Breakpoints 표가 09-08에 이 구조로 갱신됐다 (그전까지 표에는
 * 태블릿 72px 레일 · 데스크톱 240px 사이드바가 남아 있었다).
 *
 * **GNB 3개 고정은 그대로다** — 홈 · AI 기획 · 캘린더. 설정은 프로필 메뉴 안이다.
 *
 * **모바일에서는 메뉴를 그리지 않는다.** 좁은 폭에 로고·메뉴 3개·프로필을 다 넣으면
 * 전부 눌리기 어려워진다. 아래 `MobileBottomNav`가 메뉴를 맡고, 여기는 로고와
 * 프로필만 남는다 — DESIGN.md §4의 「프로필 상단 우측」과도 맞는다.
 */
const NAV_ITEMS = [
  { href: "/", label: "홈", icon: House },
  { href: "/plan/new", label: "AI 기획", icon: Sparkles },
  { href: "/calendar", label: "캘린더", icon: CalendarDays },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // AI 기획 탭은 /plan 하위 전체(새 기획·지난 기획)를 덮는다
  if (href === "/plan/new") return pathname.startsWith("/plan");
  return pathname.startsWith(href);
}

export default function AppTopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface">
      {/* 안쪽 폭은 본문의 최대 폭(1200)까지만 — 넓은 화면에서 메뉴가 양끝으로 흩어지지 않게 */}
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-2 px-4 md:px-6">
        <Link
          href="/"
          aria-label="차곡 홈"
          className="flex h-11 shrink-0 items-center gap-2.5 pr-2"
        >
          <LogoSymbol size={24} />
          <span className="text-title font-bold text-ink">차곡</span>
        </Link>

        <nav aria-label="주 메뉴" className="hidden flex-1 items-center gap-1 md:flex">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex h-11 items-center gap-2 rounded-md px-3 transition-colors duration-200",
                  // 연한 브랜드 면 위 글자는 --berry-dark (DESIGN.md §15 — --berry는 AA 미달)
                  active
                    ? "bg-berry-light font-semibold text-berry-dark"
                    : "text-sub hover:bg-surface-muted hover:text-ink",
                ].join(" ")}
              >
                <Icon size={18} aria-hidden />
                <span className="text-body">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* 모바일에선 메뉴가 없으므로 프로필을 오른쪽 끝으로 민다 */}
        <div className="ml-auto md:ml-0">
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
