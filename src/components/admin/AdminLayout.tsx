"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import Sidebar from "./Sidebar";
import AccountMenu from "./AccountMenu";

/**
 * 백오피스 셸 (admin-design.md Layout) — 인증 + Sidebar(224px) + 전역 경고 배너 +
 * content(#F5F5F5, padding 24px). 상단 헤더 띠는 없앴다(09-09 — 공간 낭비) —
 * 본문이 사이드바 로고와 같은 높이에서 시작하고, 계정 이메일만 본문 우상단에 뜬다.
 * 데스크톱 전용 · 최소 폭 1280px.
 *
 * 인증·권한 확인은 여기서 한 번만 — 페이지는 useAdmin()으로 user·flags를 받아
 * 쓰기만 한다. 권한의 진실은 서버(admin API의 클레임 검증·403)다.
 */

export type AdminFlags = {
  planningEnabled: boolean;
  imageGenEnabled: boolean;
  disabledMessage: string;
};

type AdminCtx = {
  user: User;
  flags: AdminFlags | null;
  /** 스위치를 바꾼 페이지가 호출 — 전역 배너를 갱신한다 */
  refreshFlags: () => Promise<void>;
};

const Ctx = createContext<AdminCtx | null>(null);

export function useAdmin(): AdminCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdmin은 AdminLayout 안에서만 쓸 수 있어요.");
  return ctx;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [denied, setDenied] = useState(false);
  const [flags, setFlags] = useState<AdminFlags | null>(null);
  const [loadError, setLoadError] = useState(false);

  const refreshFlags = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return;
    try {
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/flags", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        setDenied(true);
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { flags: AdminFlags };
      setFlags(data.flags);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setDenied(false);
        if (u) void refreshFlags();
      }),
    [refreshFlags],
  );

  if (user === undefined) {
    // 인증 확인 동안 빈 화면 대신 셸 뼈대(스켈레톤)를 보여준다 —
    // 진짜 셸과 같은 자리라 로딩이 «깜빡임»이 아니라 «채워짐»으로 보인다
    return (
      <div className="flex min-h-dvh min-w-[1280px]">
        <div className="w-56 shrink-0 border-r border-[#E5E7EB] bg-white">
          <div className="mx-5 mt-5 h-4 w-28 animate-pulse rounded bg-[#E5E7EB]" />
          <div className="mt-8 flex flex-col gap-4 px-5">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-3.5 w-20 animate-pulse rounded bg-[#F0F0F0]" />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col p-6">
          <div className="h-6 w-40 animate-pulse rounded bg-[#E5E7EB]" />
          <div className="mt-6 h-40 animate-pulse rounded-md border border-[#E5E7EB] bg-white" />
        </div>
      </div>
    );
  }
  if (user === null) {
    return (
      <div className="p-8 text-sm text-[#1F2937]">
        <p>로그인이 필요해요.</p>
        <Link href="/login" className="mt-2 inline-block text-[#1677FF] hover:underline">
          로그인하러 가기
        </Link>
      </div>
    );
  }
  if (denied) {
    return <p className="p-8 text-sm text-[#1F2937]">관리자 권한이 필요합니다.</p>;
  }

  const offline: string[] = [];
  if (flags && !flags.planningEnabled) offline.push("기획");
  if (flags && !flags.imageGenEnabled) offline.push("이미지 생성");

  return (
    <Ctx.Provider value={{ user, flags, refreshFlags }}>
      <div className="flex h-dvh min-w-[1280px] overflow-hidden bg-[#F5F5F5] text-[#1F2937]">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {offline.length > 0 && (
            <Link
              href="/admin/settings"
              className="block bg-red-600 px-6 py-2 text-sm font-medium text-white"
            >
              ⚠️ {offline.join("·")} 기능이 꺼져 있어요 — 설정에서 확인
            </Link>
          )}
          {loadError && (
            <p className="bg-orange-100 px-6 py-2 text-sm text-[#1F2937]">
              운영 상태를 불러오지 못했어요. 새로고침 해주세요.
            </p>
          )}
          <main className="relative flex-1 overflow-y-auto p-6">
            <AccountMenu email={user.email ?? ""} />
            {children}
          </main>
        </div>
      </div>
    </Ctx.Provider>
  );
}
