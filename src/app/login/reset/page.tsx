"use client";

import { useState } from "react";
import Link from "next/link";
import { FirebaseError } from "firebase/app";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import BrandPanel from "@/components/BrandPanel";
import InlineAlert from "@/components/InlineAlert";

/**
 * 비밀번호 재설정 — PLAN.md §3-1 · §4.
 * 이메일·비밀번호 로그인뿐이라 이 화면이 없으면 계정이 영구 잠긴다.
 *
 * **계정 존재 여부를 노출하지 않는다** (PLAN.md 기능 목록 «비밀번호 재설정» 행).
 * 미가입 이메일이어도 «메일을 보냈어요»로 같은 응답을 낸다 — 그래서
 * auth/user-not-found를 에러가 아니라 성공으로 처리한다.
 * (Firebase 신규 프로젝트는 기본으로 이메일 열거 보호가 켜져 있어 서버도
 * 같은 방향으로 동작한다. 클라이언트도 같은 태도를 유지하는 것이다.)
 *
 * 에러는 인라인로만 표시한다. 빨간색 경고 금지 (DESIGN.md §2 하단).
 */
export default function PasswordResetPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null); // 발송 완료된 이메일

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const trimmed = email.trim();
    if (!trimmed) {
      setError("이메일을 입력해주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setSentTo(trimmed);
    } catch (err) {
      // 미가입 이메일 → 성공과 같은 화면 (계정 존재 여부 노출 방지)
      if (err instanceof FirebaseError && err.code === "auth/user-not-found") {
        setSentTo(trimmed);
      } else {
        setError(resetErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = [
    "h-11 w-full rounded-md border bg-surface px-4 text-body text-ink",
    "placeholder:text-sub/60",
    // 에러 시 테두리만 진하게 — 빨간색을 쓰지 않는다 (DESIGN.md §2)
    error ? "border-sub" : "border-line",
  ].join(" ");

  return (
    <main id="main" tabIndex={-1} className="flex flex-1">
      <BrandPanel />

      {/* 오른쪽 — 재설정 폼 또는 발송 완료 안내 */}
      <div className="flex flex-1 items-center justify-center p-4 desktop:w-2/5">
        <div className="w-full max-w-[400px]">
          {/*
            좌측 패널이 없는 폭에서는 여기가 유일한 브랜드 표시다.
            Desktop에서는 왼쪽이 「차곡」을 말하므로 화면 이름만 남긴다.
          */}
          <h1 className="text-center text-h2 font-bold text-ink desktop:text-left">
            <span className="desktop:hidden">차곡</span>
            <span className="hidden desktop:inline">비밀번호 재설정</span>
          </h1>
          <p className="mt-2 text-center text-body text-sub desktop:hidden">
            비밀번호 재설정
          </p>

          {sentTo ? (
            /* 발송 완료 — 미가입 이메일이어도 이 화면이다. 문구를 나누지 않는다 */
            <div className="mt-8">
              <div className="rounded-lg border border-line bg-surface p-6">
                <p className="text-body-l font-semibold text-ink">메일을 보냈어요</p>
                <p className="mt-2 text-body text-sub">
                  {sentTo} 으로 재설정 안내를 보냈어요.
                  <br />
                  메일이 안 보이면 스팸함도 확인해주세요.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSentTo(null);
                  setError(null);
                }}
                className="mt-4 h-11 w-full rounded-md border border-line bg-surface
                           text-body font-semibold text-ink hover:bg-surface-muted"
              >
                다른 이메일로 다시 보내기
              </button>
            </div>
          ) : (
            <>
              <p className="mt-6 text-body text-sub">
                가입할 때 쓴 이메일을 입력하면
                <br />
                비밀번호를 다시 만들 수 있는 링크를 보내드려요.
              </p>

              <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label htmlFor="email" className="text-body font-semibold text-ink">
                    이메일
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null); // 고치기 시작하면 제출 알럿은 지운다
                    }}
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                </div>

                {error && <InlineAlert>{error}</InlineAlert>}

                {/* 이 화면의 primary는 이것 하나다 (DESIGN.md §6) */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 h-12 rounded-md bg-action inset-ring inset-ring-action-border text-[15px] font-semibold text-on-action
                             hover:bg-action-hover disabled:bg-surface-muted disabled:text-sub"
                >
                  {submitting ? "···" : "재설정 메일 보내기"}
                </button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-body">
            <Link href="/login" className="text-berry-dark hover:underline">
              로그인으로 돌아가기
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

/** Firebase 에러 코드 → 한국어 안내. user-not-found는 여기 오기 전에 성공 처리된다 */
function resetErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/invalid-email":
        return "이메일 형식을 확인해주세요.";
      case "auth/too-many-requests":
        return "시도가 너무 많았어요. 잠시 후 다시 시도해주세요.";
      case "auth/network-request-failed":
        return "네트워크 연결을 확인해주세요.";
    }
  }
  return "메일을 보내지 못했어요. 잠시 후 다시 시도해주세요.";
}
