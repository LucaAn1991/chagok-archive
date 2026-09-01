"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

/**
 * Google 로그인 버튼 — 로그인·회원가입 화면 공용 (09-01).
 *
 * 가입과 로그인을 구분하지 않는다: 처음이면 users 문서를 만들어 온보딩으로,
 * 이미 있으면 onboardedAt에 따라 홈/온보딩으로 — 이메일 로그인과 같은 규칙 (PLAN §3-1).
 * Firebase 콘솔에서 Google 제공업체가 켜져 있어야 동작한다.
 */
export default function GoogleAuthButton({ onError }: { onError: (message: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());

      // 첫 Google 로그인 — 이메일 가입과 같은 형태로 users 문서를 만든다
      const ref = doc(db, "users", cred.user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        try {
          await setDoc(ref, {
            uid: cred.user.uid,
            email: cred.user.email ?? "",
            onboardedAt: null, // 온보딩 완료 표시는 서버가 한다 (signup과 동일)
            createdAt: serverTimestamp(),
          });
        } catch {
          // 문서 생성 실패 — 온보딩 화면이 문서 없음도 처리한다 (signup과 동일 태도)
        }
        router.replace("/onboarding");
        return;
      }
      router.replace(snap.data().onboardedAt != null ? "/" : "/onboarding");
    } catch (err) {
      setBusy(false);
      const message = googleErrorMessage(err);
      if (message) onError(message); // 사용자가 팝업을 닫은 경우는 조용히 넘어간다
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-md border
                 border-line bg-surface text-body font-semibold text-ink
                 hover:bg-surface-muted disabled:text-sub"
    >
      {/* Google G 로고 — 공식 4색, 외부 요청 없이 인라인 SVG */}
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
      {busy ? "Google로 이동 중…" : "Google로 계속하기"}
    </button>
  );
}

/** Firebase 에러 코드 → 한국어 안내. 빈 문자열이면 표시하지 않는다 */
function googleErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return ""; // 사용자가 직접 닫음 — 에러가 아니다
      case "auth/popup-blocked":
        return "팝업이 차단됐어요. 브라우저에서 팝업을 허용한 뒤 다시 시도해주세요.";
      case "auth/account-exists-with-different-credential":
        return "이미 이메일·비밀번호로 가입된 이메일이에요. 이메일 로그인으로 들어와주세요.";
      case "auth/operation-not-allowed":
        return "지금은 Google 로그인을 사용할 수 없어요.";
      case "auth/network-request-failed":
        return "네트워크 연결을 확인해주세요.";
    }
  }
  return "Google 로그인에 실패했어요. 잠시 후 다시 시도해주세요.";
}
