"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import BrandPanel from "@/components/BrandPanel";
import PasswordInput from "@/components/PasswordInput";

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
 * 레이아웃 — Desktop(>=1200)에서만 좌우 분할이다. 왼쪽은 브랜드 패널,
 * 오른쪽은 폼. 로그인 화면과 같은 구조를 쓴다.
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
    // 비밀번호 규칙 — 8자 이상 · 20자 이하, 조합 자유 (08-28 확정 · PLAN.md 변경 이력)
    if (!isPasswordValid(password)) {
      setError("8자 이상 20자 이내로 입력해주세요.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
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

  // 입력 중 실시간 안내 — 규칙에 맞으면 자동으로 사라진다
  const passwordNotice =
    password.length > 0 && !isPasswordValid(password)
      ? "8자 이상 20자 이내로 입력해주세요."
      : null;

  // 확인칸 실시간 안내 — 일치해지면 자동으로 사라진다
  const confirmNotice =
    passwordConfirm.length > 0 && password !== passwordConfirm
      ? "비밀번호가 일치하지 않습니다."
      : null;

  // 에러 시 테두리만 진하게 — 빨간색을 쓰지 않는다 (DESIGN.md §2)
  const inputClass = [
    "h-11 w-full rounded-md border bg-surface px-4 text-body text-ink",
    "placeholder:text-sub/60",
    error ? "border-sub" : "border-line",
  ].join(" ");

  return (
    <main className="flex flex-1">
      <BrandPanel />

      {/* 오른쪽 — 회원가입 폼 */}
      <div className="flex flex-1 items-center justify-center p-4 desktop:w-1/2">
        <div className="w-full max-w-[400px]">
          {/*
            좌측 패널이 없는 폭에서는 여기가 유일한 브랜드 표시다.
            Desktop에서는 왼쪽이 「차곡」을 말하므로 화면 이름만 남긴다.
          */}
          <h1 className="text-center text-h2 font-bold text-ink desktop:text-left">
            <span className="desktop:hidden">차곡</span>
            <span className="hidden desktop:inline">회원가입</span>
          </h1>
          <p className="mt-2 text-center text-body text-sub desktop:hidden">회원가입</p>

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

            <PasswordInput
              id="password"
              label="비밀번호"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              placeholder="비밀번호를 입력해주세요"
              hasError={error != null}
              notice={passwordNotice}
            />

            <PasswordInput
              id="password-confirm"
              label="비밀번호 확인"
              value={passwordConfirm}
              onChange={setPasswordConfirm}
              autoComplete="new-password"
              placeholder="비밀번호를 입력해주세요"
              hasError={error != null}
              notice={confirmNotice}
            />

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

          {/* 로그인 경로 — secondary 버튼 (DESIGN.md §6: 흰 배경 · 2px berry · 높이 44) */}
          <div className="mt-8 border-t border-line pt-6">
            <p className="text-center text-body text-sub">이미 계정이 있으신가요?</p>
            <Link
              href="/login"
              className="mt-3 flex h-11 items-center justify-center rounded-md border-2
                         border-berry bg-surface text-[15px] font-semibold text-berry
                         hover:bg-berry-light hover:text-berry-dark"
            >
              로그인
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

/** 비밀번호 규칙 — 8자 이상 20자 이하, 조합 자유 (PLAN.md §2 · 08-28 확정) */
function isPasswordValid(password: string): boolean {
  return password.length >= 8 && password.length <= 20;
}

/** Firebase 에러 코드 → 한국어 안내 */
function signupErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/email-already-in-use":
        return "이미 가입된 이메일이에요. 아래에서 바로 로그인할 수 있어요.";
      case "auth/invalid-email":
        return "이메일 형식을 확인해주세요.";
      case "auth/weak-password":
        return "8자 이상 20자 이내로 입력해주세요.";
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
