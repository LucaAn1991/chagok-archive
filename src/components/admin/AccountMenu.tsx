"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

/**
 * 우상단 계정 메뉴 (09-09) — 평소엔 이메일 표시, 클릭하면 드롭다운(로그아웃).
 * 로그아웃 버튼을 상시 노출하지 않는 일반 어드민 관례를 따른다.
 */
export default function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="absolute right-6 top-6 z-20 text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 text-[#6B7280] hover:text-[#1F2937]"
      >
        {email}
        <span aria-hidden className="text-[10px]">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1.5 w-32 rounded-md border border-[#E5E7EB] bg-white py-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut(auth)} // user가 null이 되며 셸이 로그인 안내로 바뀐다
            className="block w-full px-3 py-1.5 text-left text-sm text-[#1F2937] hover:bg-[#F5F5F5]"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
