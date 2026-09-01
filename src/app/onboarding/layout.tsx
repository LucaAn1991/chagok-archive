"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { isConsentCurrent } from "@/lib/legal/consent-client";

/**
 * 온보딩 진입 가드 (09-01) — 약관 동의 없이는 온보딩에 들어올 수 없다.
 *
 * 가입 흐름: 회원가입 완료 → **[약관 동의]** → 온보딩 4문항 → 홈.
 * 가영 님의 온보딩 page.tsx를 고치지 않으려고 layout으로 감쌌다 —
 * 주소를 직접 쳐도, Google 첫 로그인으로 와도 여기서 걸린다.
 * 판정은 users.latestConsent 요약(저장 시 서버가 얹는다)으로 한다.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      void (async () => {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (cancelled) return;
          if (!isConsentCurrent(snap.data()?.latestConsent)) {
            router.replace("/consent");
            return;
          }
          setAllowed(true);
        } catch {
          // 판정 실패 시에도 동의 화면으로 — 동의 없이 지나가는 쪽보다 안전하다
          if (!cancelled) router.replace("/consent");
        }
      })();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [router]);

  if (!allowed) {
    return (
      <main className="flex flex-1 items-center justify-center p-4">
        <p className="text-body text-sub">불러오는 중...</p>
      </main>
    );
  }
  return <>{children}</>;
}
