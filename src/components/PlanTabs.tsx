"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * AI 기획 탭 — [새 기획] / [지난 기획] · 기본값 새 기획 (IA 2).
 * GNB의 「AI 기획」이 /plan/new로 열리므로 기본 탭이 새 기획이 된다.
 */
const TABS = [
  { href: "/plan/new", label: "새 기획" },
  { href: "/plan/history", label: "지난 기획" },
] as const;

export default function PlanTabs({ action }: { action?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    /* 왼쪽 탭 그룹 + 오른쪽 끝 액션(예: 다시 시작 칩) — 구분선은 행 전체 폭 (08-31).
       활성 밑줄은 각 탭 요소에만 그려져 칩 아래로 이어지지 않는다 */
    <nav
      aria-label="AI 기획 탭"
      className="flex items-center justify-between gap-2 border-b border-line"
    >
      <div className="flex min-w-0 gap-1">
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
      </div>
      {action && <div className="shrink-0 whitespace-nowrap pb-1">{action}</div>}
    </nav>
  );
}
