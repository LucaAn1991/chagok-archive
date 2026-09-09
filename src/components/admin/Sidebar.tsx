"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 좌측 224px 내비게이션 (admin-design.md Layout). 항목은 백오피스 기획 §3 화면 지도 */
const NAV = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/inbox", label: "처리 대기" },
  { href: "/admin/members", label: "회원" },
  { href: "/admin/content", label: "콘텐츠" },
  { href: "/admin/notifications", label: "알림" },
  { href: "/admin/settings", label: "설정" },
  { href: "/admin/system", label: "보안" },
] as const;

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-[#E5E7EB] bg-white">
      <div className="flex h-14 items-center border-b border-[#E5E7EB] px-5">
        <span className="text-sm font-bold tracking-wide text-[#1F2937]">CHAGOK ADMIN</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map((item) => {
          const active =
            item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-5 py-2 text-sm ${
                active
                  ? "border-r-2 border-[#1677FF] bg-[#E6F4FF] font-medium text-[#1677FF]"
                  : "text-[#1F2937] hover:bg-[#F5F5F5]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
