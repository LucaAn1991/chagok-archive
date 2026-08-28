"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, House, Sparkles } from "lucide-react";

/**
 * 모바일 하단 탭 — DESIGN.md §4. Mobile(<768) 전용, 3개 고정.
 * 프로필은 여기 넣지 않는다 — 화면 상단 우측에 있다 (§4 표).
 */
const NAV_ITEMS = [
  { href: "/", label: "홈", icon: House },
  { href: "/plan/new", label: "AI 기획", icon: Sparkles },
  { href: "/calendar", label: "캘린더", icon: CalendarDays },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/plan/new") return pathname.startsWith("/plan");
  return pathname.startsWith(href);
}

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="주 메뉴"
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
              // 터치 타깃 최소 44px (DESIGN.md §15)
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5",
              active ? "text-berry" : "text-sub",
            ].join(" ")}
          >
            <Icon size={20} aria-hidden />
            <span className="text-label font-semibold">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
