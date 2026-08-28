"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CircleUserRound, House, Sparkles } from "lucide-react";

/**
 * 사이드바 — DESIGN.md §4.
 * Tablet(768~1199)은 아이콘만 72px · Desktop(>=1200)은 아이콘+글자 240px, 하단 프로필.
 * Mobile(<768)에서는 렌더링하지 않는다 — MobileBottomNav가 대신한다.
 *
 * GNB는 3개 고정 — 홈 · AI 기획 · 캘린더. 설정은 GNB에 넣지 않고 프로필 안에 둔다.
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

export default function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-[72px] shrink-0 flex-col border-r border-line bg-surface md:flex min-[1200px]:w-[240px]">
      {/* 로고 — 그라데이션 허용 4곳 중 「로고 심볼」 (DESIGN.md §2) */}
      <Link
        href="/"
        className="flex h-16 items-center justify-center gap-2.5 min-[1200px]:justify-start min-[1200px]:px-6"
      >
        {/* @TODO: 로고 최종 아트워크 미확정 (DESIGN.md §18) — 심볼 자리만 잡아둠 */}
        <span
          aria-hidden
          className="h-6 w-6 shrink-0 rounded-sm"
          style={{ background: "var(--grad)" }}
        />
        <span className="hidden text-title font-bold text-ink min-[1200px]:inline">
          차곡
        </span>
      </Link>

      <nav aria-label="주 메뉴" className="mt-4 flex flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={[
                "flex h-11 items-center justify-center gap-3 rounded-md transition-colors duration-200",
                "min-[1200px]:justify-start min-[1200px]:px-3",
                // 연한 브랜드 면 위 글자는 --berry-dark (DESIGN.md §15 — --berry는 AA 미달)
                active
                  ? "bg-berry-light font-semibold text-berry-dark"
                  : "text-sub hover:bg-surface-muted hover:text-ink",
              ].join(" ")}
            >
              <Icon size={20} aria-hidden />
              <span className="hidden text-body min-[1200px]:inline">{label}</span>
              {/* 태블릿 아이콘 레일에서도 이름은 읽혀야 한다 (스크린리더용) */}
              <span className="sr-only min-[1200px]:hidden">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 하단 프로필 (DESIGN.md §4) */}
      <div className="mt-auto px-3 pb-4">
        {/* @TODO: 프로필 메뉴(설정-계정 · 설정-콘텐츠 · 로그아웃) 팝업 — 지금은 설정으로 바로 이동 */}
        <Link
          href="/settings/content"
          className="flex h-11 items-center justify-center gap-3 rounded-md text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink min-[1200px]:justify-start min-[1200px]:px-3"
        >
          <CircleUserRound size={20} aria-hidden />
          <span className="hidden text-body min-[1200px]:inline">프로필</span>
          <span className="sr-only min-[1200px]:hidden">프로필</span>
        </Link>
      </div>
    </aside>
  );
}
