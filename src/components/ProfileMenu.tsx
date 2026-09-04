"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { CircleUserRound } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";

/**
 * 프로필 메뉴 (09-04) — 설정 · 계정 · 로그아웃.
 *
 * **DESIGN.md §4가 원래 요구하던 것이다** — 「설정은 IA에 존재하되 GNB에서는 뺀다,
 * 프로필 메뉴 안」. 지금까지는 `@TODO`로 남아 프로필을 누르면 설정으로 곧장 갔다.
 * GNB 3개(홈·AI 기획·캘린더)를 늘리지 않으면서 설정에 닿는 유일한 길이다.
 *
 * 이름은 `users/{uid}.nickname`을 읽어 보여주고, 없으면 이메일의 «@» 앞부분을 쓴다 —
 * 빈자리를 만들지 않는다 (DESIGN §1).
 */
const ITEMS = [
  { href: "/settings/content", label: "설정" },
  { href: "/settings/account", label: "계정" },
] as const;

export default function ProfileMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setEmail(user?.email ?? null);
      if (!user) {
        setNickname(null);
        return;
      }
      /*
        닉네임을 못 읽어도 메뉴는 열려야 한다 — 이름 자리는 이메일로 채운다.
        여기서 막히면 로그아웃할 방법이 사라진다.
      */
      void getDoc(doc(db, "users", user.uid))
        .then((snap) => setNickname((snap.data()?.nickname as string | undefined) ?? null))
        .catch(() => setNickname(null));
    });
  }, []);

  /* 바깥 누르기·Esc로 닫는다 — 캘린더의 겹친 창과 같은 규칙 (09-04) */
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function logout() {
    setOpen(false);
    try {
      await signOut(auth);
      router.replace("/"); // 랜딩으로 (PLAN §3-1 «로그아웃» 행)
    } catch {
      // 실패하면 계정 화면에서 다시 시도할 수 있다 — 여기서 붙잡아두지 않는다
      router.push("/settings/account");
    }
  }

  const displayName = nickname?.trim() || email?.split("@")[0] || "내 계정";

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-11 items-center gap-2 rounded-md px-2 text-sub transition-colors
                   duration-200 hover:bg-surface-muted hover:text-ink"
      >
        <CircleUserRound size={22} aria-hidden />
        {/* 좁은 화면에서는 아이콘만 — 이름은 메뉴를 열면 맨 위에 있다 */}
        <span className="hidden max-w-[120px] truncate text-body md:inline">{displayName}</span>
        <span className="sr-only md:hidden">프로필 메뉴</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="프로필 메뉴"
          className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-lg border
                     border-line bg-surface shadow-lg"
        >
          {/* 누구로 로그인해 있는지 — 계정을 여럿 쓰는 사람에게 이게 가장 중요하다 */}
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-body font-semibold text-ink">{displayName}</p>
            <p className="truncate text-caption text-sub">{email ?? "—"}</p>
          </div>

          <div className="py-1">
            {ITEMS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex h-11 items-center px-4 text-body text-ink
                           transition-colors duration-200 hover:bg-surface-muted"
              >
                {label}
              </Link>
            ))}
          </div>

          {/*
            로그아웃은 선을 그어 떼어놓는다 — 위의 둘과 성격이 다르다.
            빨간 글씨는 쓰지 않는다 (DESIGN §0·§2). 되돌릴 수 있는 동작이다.
          */}
          <div className="border-t border-line py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => void logout()}
              className="flex h-11 w-full items-center px-4 text-left text-body text-sub
                         transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
            >
              로그아웃
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
