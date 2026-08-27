"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

/**
 * 회원가입 — PLAN.md §3-1 · IA 0.2.
 *
 * 가입이 끝나면 곧바로 온보딩으로 보낸다. 「설정」이 아니라 「준비 과정」으로
 * 느끼게 하려는 것이다 (PRD §5-2).
 *
 * users 문서는 **onboardedAt: null 로 만들어야 한다.** firestore.rules 의
 * users create 규칙이 그 조건을 검사한다 — 값을 넣으면 쓰기가 거부된다.
 * 온보딩 4문항 필드는 여기서 채우지 않는다. 사용자가 아직 고르지 않은 값을
 * 빈 값으로 미리 넣으면 «고르지 않음»과 «빈 값을 골랐음»을 구분할 수 없다.
 *
 * 에러는 인라인로만 표시한다 — 빨간색 경고 금지 (DESIGN.md §0 · §2 하단).
 */
export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const trimmed = email.trim();
    if (!trimmed) {
      setError("이메일을 입력해주세요.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상으로 만들어주세요.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 서로 달라요.");
      return;
    }
    if (!agreed) {
      setError("약관에 동의해주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, trimmed, password);

      /*
        계정은 만들어졌고 users 문서만 실패할 수 있다. 그 경우 다시 가입할 수는
        없으므로(이메일 중복) 온보딩 화면이 문서가 없을 때 만들어 주도록 한다.
        여기서는 실패해도 온보딩으로 보낸다 — 되돌아갈 곳이 없다.
      */
      try {
        await setDoc(doc(db, "users", cred.user.uid), {
          uid: cred.user.uid,
          email: cred.user.email ?? trimmed,
          onboardedAt: null, // 규칙이 검사한다. 온보딩 완료 표시는 서버가 한다
          createdAt: serverTimestamp(),
        });
      } catch {
        // @TODO: 문서 생성 실패를 관찰 세션에서 집계할지 결정 (PRD 위험 4와 별개)
      }

      router.replace("/onboarding");
    } catch (err) {
      setError(signupErrorMessage(err));
      setSubmitting(false);
    }
  }

  // 에러 시 테두리만 진하게 — 빨간색을 쓰지 않는다 (DESIGN.md §2)
  const inputClass = [
    "h-11 w-full rounded-md border bg-surface px-4 text-body text-ink",
    "placeholder:text-sub/60",
    error ? "border-sub" : "border-line",
  ].join(" ");

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <h1 className="text-center text-h2 font-bold text-ink">차곡</h1>
        <p className="mt-2 text-center text-body text-sub">회원가입</p>

        <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-label font-semibold text-ink">
              이메일
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-label font-semibold text-ink">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password-confirm" className="text-label font-semibold text-ink">
              비밀번호 확인
            </label>
            <input
              id="password-confirm"
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* 약관 동의 — IA 0.2. 동의 대상 문서로 이동할 수 있어야 한다 */}
          <label className="mt-1 flex items-start gap-3 text-body text-ink">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-[3px] size-[18px] shrink-0 accent-[var(--berry)]"
            />
            <span>
              <Link href="/terms" className="text-berry-dark underline">
                이용약관
              </Link>
              과{" "}
              <Link href="/privacy" className="text-berry-dark underline">
                개인정보처리방침
              </Link>
              에 동의합니다.
            </span>
          </label>

          {error && (
            <p role="alert" className="text-body text-ink">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 h-12 rounded-md bg-berry text-[15px] font-semibold text-white
                       hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
          >
            {submitting ? "···" : "가입하기"}
          </button>
        </form>

        <p className="mt-6 text-center text-body text-sub">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="text-berry-dark hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </main>
  );
}

/** Firebase 에러 코드 → 한국어 안내 */
function signupErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/email-already-in-use":
        return "이미 가입된 이메일이에요. 로그인해주세요.";
      case "auth/invalid-email":
        return "이메일 형식을 확인해주세요.";
      case "auth/weak-password":
        return "비밀번호는 6자 이상으로 만들어주세요.";
      case "auth/operation-not-allowed":
        return "지금은 가입할 수 없어요. 잠시 후 다시 시도해주세요.";
      case "auth/too-many-requests":
        return "시도가 너무 많았어요. 잠시 후 다시 시도해주세요.";
      case "auth/network-request-failed":
        return "네트워크 연결을 확인해주세요.";
    }
  }
  return "가입하지 못했어요. 잠시 후 다시 시도해주세요.";
}
