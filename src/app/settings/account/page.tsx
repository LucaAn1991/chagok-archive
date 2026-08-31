"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
  type User as AuthUser,
} from "firebase/auth";
import { Check, LogOut } from "lucide-react";
import { auth } from "@/lib/firebase/client";
import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import InlineAlert from "@/components/InlineAlert";
import BackLink from "@/components/BackLink";
import SettingsTabs from "@/components/SettingsTabs";
import PasswordInput from "@/components/PasswordInput";

/**
 * 설정 — 계정 (PLAN.md §4 · §3-1 「로그아웃」).
 *
 * **로그아웃이 이 화면의 존재 이유다.** 08-28까지 앱 어디에도 로그아웃 경로가 없어
 * 한번 로그인하면 나올 수 없었다 (PLAN §3-1 «로그아웃» 행).
 *
 * 비밀번호 변경은 Firebase가 «최근 로그인»을 요구한다. 오래 켜둔 세션에서 바로
 * updatePassword를 부르면 requires-recent-login으로 막히므로, 현재 비밀번호를 받아
 * 재인증한 뒤 바꾼다. 사용자에게는 「현재 비밀번호 확인」으로만 보인다.
 *
 * @TODO: 회원 탈퇴 — 삭제 범위·보관 기간이 미확정이라(PLAN.md §12 12번) 아직 넣지 않았다.
 *   결정되면 `DELETE /api/users/me`(PLAN §6에 이미 정의됨)를 붙인다.
 */

/** 회원가입과 같은 규칙을 쓴다 — 여기만 느슨하면 우회로가 된다 */
const MIN_PASSWORD = 8;

export default function AccountSettingsPage() {
  const router = useRouter();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, [router]);

  async function changePassword() {
    if (!user?.email) return;

    if (next.length < MIN_PASSWORD) {
      setError(`새 비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요.`);
      return;
    }
    if (next === current) {
      setError("지금 쓰고 있는 비밀번호와 같아요.");
      return;
    }

    setChanging(true);
    setError(null);
    try {
      // 재인증 — 오래된 세션에서도 비밀번호를 바꿀 수 있게 한다
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, current),
      );
      await updatePassword(user, next);

      setCurrent("");
      setNext("");
      setDone(true);
    } catch (e) {
      setError(passwordErrorMessage(e));
    } finally {
      setChanging(false);
    }
  }

  async function logout() {
    setSigningOut(true);
    try {
      await signOut(auth);
      router.replace("/"); // 랜딩으로 (PLAN §3-1 «로그아웃» 행)
    } catch {
      setError("로그아웃하지 못했어요. 다시 시도해주세요.");
      setSigningOut(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-[720px] flex-1 p-4 pb-24 md:p-6 md:pb-8 min-[1200px]:p-8">
            <div aria-hidden className="flex animate-pulse flex-col gap-4">
              <div className="h-8 w-32 rounded-md bg-surface-muted" />
              <div className="h-24 rounded-lg bg-surface-muted" />
              <div className="h-48 rounded-lg bg-surface-muted" />
            </div>
          </main>
        </div>
        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div className="flex flex-1">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[720px] flex-1 p-4 pb-24 md:p-6 md:pb-8 min-[1200px]:p-8">
          <BackLink fallbackHref="/">돌아가기</BackLink>

          <div className="mt-2">
            <SettingsTabs />
          </div>

          <header className="mt-6 flex flex-col gap-1">
            <h1 className="text-h3 font-bold text-ink">계정 설정</h1>
          </header>

          <div className="mt-6 flex flex-col gap-4">
            {/* 이메일 — 로그인 수단이라 바꾸지 않는다 */}
            <section className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-6">
              <span className="text-label font-semibold text-sub">이메일</span>
              <p className="text-body text-ink">{user?.email ?? "—"}</p>
            </section>

            {/* 비밀번호 변경 */}
            <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-body font-semibold text-ink">비밀번호 변경</h2>
                <p className="text-caption text-sub">
                  본인 확인을 위해 지금 쓰는 비밀번호를 먼저 입력해주세요.
                </p>
              </div>

              <PasswordInput
                id="current-password"
                label="현재 비밀번호"
                value={current}
                onChange={(v) => {
                  setCurrent(v);
                  setError(null);
                  setDone(false);
                }}
                autoComplete="current-password"
              />

              <PasswordInput
                id="new-password"
                label="새 비밀번호"
                value={next}
                onChange={(v) => {
                  setNext(v);
                  setError(null);
                  setDone(false);
                }}
                autoComplete="new-password"
                notice={
                  next.length > 0 && next.length < MIN_PASSWORD
                    ? `${MIN_PASSWORD}자 이상이어야 해요.`
                    : null
                }
              />

              {error && <InlineAlert>{error}</InlineAlert>}
              {done && (
                <p className="flex items-center gap-1.5 text-body text-ink">
                  <Check size={16} className="shrink-0 text-berry" aria-hidden />
                  비밀번호를 바꿨어요.
                </p>
              )}

              <button
                type="button"
                onClick={changePassword}
                disabled={changing || !current || !next}
                className="h-12 rounded-md bg-berry text-[15px] font-semibold text-white
                           hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
              >
                {changing ? "바꾸는 중…" : "비밀번호 바꾸기"}
              </button>
            </section>

            {/* 로그아웃 */}
            <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6">
              <button
                type="button"
                onClick={logout}
                disabled={signingOut}
                className="flex h-12 items-center justify-center gap-2 rounded-md border border-line
                           text-[15px] font-semibold text-ink hover:bg-surface-muted
                           disabled:text-sub"
              >
                <LogOut size={16} aria-hidden />
                {signingOut ? "나가는 중…" : "로그아웃"}
              </button>
            </section>

            {/*
              회원 탈퇴 자리 — 삭제 범위·보관 기간이 미확정이라 비워둔다.
              «준비 중» 버튼을 두면 눌러보고 아무 일도 안 일어나는 쪽이 더 나쁘다.
            */}
            <p className="text-caption text-sub">
              계정 삭제를 원하시면 문의해주세요. [TODO: 실제 문의 경로 필요]
            </p>
          </div>
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}

/** Firebase 오류 코드를 사용자가 읽을 문장으로. 코드가 그대로 노출되면 안 된다 */
function passwordErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "현재 비밀번호가 맞지 않아요.";
    case "auth/weak-password":
      return `새 비밀번호는 ${MIN_PASSWORD}자 이상이어야 해요.`;
    case "auth/too-many-requests":
      return "시도가 너무 많았어요. 잠시 후 다시 해주세요.";
    case "auth/requires-recent-login":
      return "다시 로그인한 뒤 시도해주세요.";
    default:
      return "비밀번호를 바꾸지 못했어요. 다시 시도해주세요.";
  }
}
