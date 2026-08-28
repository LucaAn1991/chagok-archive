"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

/**
 * 로그인 — PLAN.md §3-1.
 * 비로그인 사용 불가(PRD §5-4)이므로 여기가 첫 관문이다.
 * 자동 로그인은 Firebase Auth의 기본 세션 유지(local persistence)로 처리된다.
 *
 * 레이아웃 — Desktop(>=1200)에서만 좌우 분할이다. 왼쪽은 브랜드,
 * 오른쪽은 폼. 그보다 좁으면 왼쪽을 통째로 숨기고 폼만 남긴다.
 * 축소가 아니라 제거다 (DESIGN.md ✕22 «모바일을 데스크톱의 축소판으로 만들지 않는다»).
 *
 * 에러는 인라인로만 표시한다. 빨간색 경고 금지 — 글자는 --ink,
 * 입력 테두리만 --line보다 진하게 (DESIGN.md §2 하단).
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 앱 재진입 — 이미 로그인돼 있으면 로그인 화면을 보여주지 않는다 (PLAN §3-1)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) router.replace("/");
    });
    return unsubscribe;
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (!email.trim()) {
      setError("이메일을 입력해주세요.");
      return;
    }
    if (!password) {
      setError("비밀번호를 입력해주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);

      // onboardedAt이 null이면 온보딩으로, 아니면 홈으로 (PLAN §3-1)
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      const onboarded = snap.exists() && snap.data().onboardedAt != null;
      router.replace(onboarded ? "/" : "/onboarding");
    } catch (err) {
      setError(loginErrorMessage(err));
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
    <main className="flex flex-1">
      <BrandPanel />

      {/* 오른쪽 — 로그인 폼 */}
      <div className="flex flex-1 items-center justify-center p-4 desktop:w-1/2">
        <div className="w-full max-w-[400px]">
          {/*
            좌측 패널이 없는 폭에서는 여기가 유일한 브랜드 표시다.
            Desktop에서는 왼쪽이 「차곡」을 말하므로 화면 이름만 남긴다.
          */}
          <h1 className="text-center text-h2 font-bold text-ink desktop:text-left">
            <span className="desktop:hidden">차곡</span>
            <span className="hidden desktop:inline">로그인</span>
          </h1>
          <p className="mt-2 text-center text-body text-sub desktop:hidden">로그인</p>

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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>

            {error && (
              <p role="alert" className="text-body text-ink">
                {error}
              </p>
            )}

            {/* 이 화면의 primary는 이것 하나다 (DESIGN.md §6) */}
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 h-12 rounded-md bg-berry text-[15px] font-semibold text-white
                         hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
            >
              {submitting ? "···" : "로그인"}
            </button>
          </form>

          <p className="mt-4 text-center text-body">
            <Link href="/login/reset" className="text-sub hover:underline">
              비밀번호를 잊으셨나요?
            </Link>
          </p>

          {/* 가입 경로 — secondary 버튼 (DESIGN.md §6: 흰 배경 · 2px berry · 높이 44) */}
          <div className="mt-8 border-t border-line pt-6">
            <p className="text-center text-body text-sub">계정이 없으신가요?</p>
            <Link
              href="/signup"
              className="mt-3 flex h-11 items-center justify-center rounded-md border-2
                         border-berry bg-surface text-[15px] font-semibold text-berry
                         hover:bg-berry-light hover:text-berry-dark"
            >
              회원가입
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * 왼쪽 브랜드 패널 — Desktop(>=1200)에서만 보인다.
 *
 * 문구는 전부 PRD §5-1 «카피 구성 [확정 — 08.27]»에서 그대로 가져왔다.
 * 여기서 새 카피를 쓰지 않는다.
 *
 * 연한 브랜드 면(--berry-tint) 위에서는 --sub가 4.04:1로 AA에 미달한다.
 * 보조 글자는 전부 --berry-dark(5.17:1)를 쓴다 (DESIGN.md §15).
 *
 * 로고 심볼을 넣지 않은 이유 — DESIGN.md §18에서 «로고 최종 아트워크»가
 * 미확정이다. 임의로 만들지 않고 글자 「차곡」만 쓴다.
 */
function BrandPanel() {
  return (
    <section
      aria-label="차곡 소개"
      className="hidden w-1/2 shrink-0 items-center justify-center border-r
                 border-line bg-berry-tint p-16 desktop:flex"
    >
      <div className="w-full max-w-[480px]">
        <p className="text-title font-bold text-ink">차곡</p>

        {/* PRD §5-1 헤드라인 */}
        <p className="mt-6 text-h1 font-bold text-ink">
          생각을 정리하면,
          <br />
          콘텐츠가 차곡차곡
        </p>

        {/* PRD §5-1 서브 — 범주 선언 */}
        <p className="mt-4 text-body-l text-berry-dark">
          인스타그램 전용 콘텐츠 기획 어시스턴트
        </p>

        <CardNewsPreview />

        {/* PRD §5-1 섹션 3 — 동작 캡션 */}
        <p className="mt-6 text-body text-berry-dark">
          말 한마디 → 대상이 다른 카드 여러 장, 날짜까지
        </p>
      </div>
    </section>
  );
}

/**
 * 카드뉴스 맛보기 — 결과물이 어떻게 생겼는지 한눈에 보여준다.
 *
 * @TODO: DESIGN.md §18 «카드뉴스 레이아웃 6종의 실제 시안»이 확정되면 교체한다.
 *        지금 값(여백·글자 크기·이미지 비율)은 시안이 아니라 임시 표현이다.
 *
 * 카드 안 문구도 지어내지 않았다 — PRD §5-1 «섹션 1 범주 대비»를
 * 카드뉴스 형식으로 나눠 담은 것이다.
 * 그림자를 쓰지 않는다 (DESIGN.md §4).
 */
function CardNewsPreview() {
  return (
    <div className="mt-10" aria-hidden>
      <div className="flex gap-3">
        {/* 표지 — 그라데이션은 «AI가 만든 기획 카드 강조»로만 허용된다 (DESIGN.md §2) */}
        <article className="relative flex flex-1 flex-col justify-center overflow-hidden rounded-lg bg-berry-light p-4 aspect-[4/5]">
          <span
            className="absolute inset-x-0 top-0 h-[3px]"
            style={{ background: "var(--grad)" }}
          />
          <p className="text-body font-bold leading-[1.45] text-berry-dark">
            생각을 정리하면, 콘텐츠가 차곡차곡
          </p>
        </article>

        <article className="flex flex-1 flex-col justify-center rounded-lg border border-line bg-surface p-4 aspect-[4/5]">
          <p className="text-body leading-[1.45] text-ink">
            예약 발행 도구는 많습니다.
          </p>
        </article>

        <article className="flex flex-1 flex-col justify-center rounded-lg border border-line bg-surface p-4 aspect-[4/5]">
          <p className="text-body font-semibold leading-[1.45] text-ink">
            &lsquo;무엇을 올릴지&rsquo; 정해주는 도구는 없었습니다.
          </p>
        </article>
      </div>

      {/* 캐러셀 표시 — 「여러 장이 이어진다」를 형태로 알린다 */}
      <div className="mt-4 flex items-center gap-1.5">
        <span className="size-1.5 rounded-pill bg-berry" />
        <span className="size-1.5 rounded-pill bg-berry/30" />
        <span className="size-1.5 rounded-pill bg-berry/30" />
      </div>
    </div>
  );
}

/** Firebase 에러 코드 → 한국어 안내. 계정 존재 여부는 노출하지 않는다 */
function loginErrorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "이메일 또는 비밀번호가 맞지 않아요.";
      case "auth/invalid-email":
        return "이메일 형식을 확인해주세요.";
      case "auth/user-disabled":
        return "사용할 수 없는 계정이에요.";
      case "auth/too-many-requests":
        return "시도가 너무 많았어요. 잠시 후 다시 시도해주세요.";
      case "auth/network-request-failed":
        return "네트워크 연결을 확인해주세요.";
    }
  }
  return "로그인하지 못했어요. 잠시 후 다시 시도해주세요.";
}
