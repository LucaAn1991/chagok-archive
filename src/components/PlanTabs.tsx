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

export default function PlanTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="AI 기획 탭" className="flex gap-1 border-b border-line">
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
