"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

/**
 * 홈 상단 공지 배너 (09-08 · 백오피스 기획 §2-①).
 * published된 banner 공지 중 최근 1건만 — 누르면 공지 목록으로.
 * 공지가 없으면 아무것도 그리지 않는다.
 */
export default function NoticeBanner() {
  const [banner, setBanner] = useState<{ id: string; title: string } | null>(null);

  useEffect(
    () =>
      // 공개 데이터지만 코드베이스의 로드 관례(인증 구독 콜백에서 fetch)를 따른다
      onAuthStateChanged(auth, () => {
        void fetch("/api/content")
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { banner: { id: string; title: string } | null } | null) => {
            if (data?.banner) setBanner(data.banner);
          })
          .catch(() => {});
      }),
    [],
  );

  if (!banner) return null;

  return (
    <Link
      href="/notices"
      className="block bg-berry-light px-4 py-2 text-center text-body text-berry-dark"
    >
      📢 {banner.title}
    </Link>
  );
}
