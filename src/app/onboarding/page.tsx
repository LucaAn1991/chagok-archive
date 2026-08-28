"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Check } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import InlineAlert from "@/components/InlineAlert";

/**
 * 온보딩 — 2문항 (F1 · 08-28 축소, PLAN 변경 이력).
 * ① 활동 분야(서술형) ② 업로드 빈도 = 주기(주 1회~매일) + 요일(주기 개수만큼).
 * 말투·피할 표현은 설정-콘텐츠에서.
 *
 * 「설정」이 아니라 「준비 과정」으로 느끼게 한다 (PRD §5-2) — 끝나면
 * 곧바로 «첫 콘텐츠를 같이 정해볼까요?»로 홈 상태 A에 간다.
 * 중간 이탈 시 저장하지 않는다 (PLAN §3 — 다음 진입에 처음부터).
 *
 * onboardedAt은 서버만 쓸 수 있어(보안 규칙) PATCH /api/users/me 를 거친다.
 */

const FREQUENCIES = [1, 2, 3, 4, 5, 6, 7] as const;
const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"]; // index = 저장값 (0=월 … 6=일)

const FIELD_PLACEHOLDER = [
  "예) 자기계발에 도움이 되는 글귀를 꾸준히 올리고 싶어요",
  "홈트레이닝 루틴과 실행기록을 공유하고 싶어요",
  "화장품, 뷰티 디바이스 사용 후기 등 뷰티 리뷰를 기록하고 싶어요",
  "취급하는 상품 상세 정보를 올리고 광고에 사용하고 싶어요",
].join("\n");

export default function OnboardingPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "form">("loading");
  const [field, setField] = useState("");
  const [frequency, setFrequency] = useState<number | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 가드 — 비로그인은 로그인으로, 이미 완료한 사람은 홈으로
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists() && snap.data().onboardedAt != null) {
          router.replace("/");
          return;
        }
      } catch {
        // 읽기 실패 — 문서가 없어도 서버가 만들어주므로 폼으로 진행
      }
      setPhase("form");
    });
    return unsubscribe;
  }, [router]);

  /** 주기 선택 — 매일(7)이면 요일 전체 자동 선택, 아니면 처음부터 다시 고른다 */
  function selectFrequency(n: number) {
    setFrequency(n);
    setDays(n === 7 ? [0, 1, 2, 3, 4, 5, 6] : []);
    setError(null);
  }

  /** 요일 토글 — 주기 개수까지만. 매일은 손대지 않는다 */
  function toggleDay(d: number) {
    if (frequency == null || frequency === 7) return;
    setError(null);
    setDays((prev) => {
      if (prev.includes(d)) return prev.filter((v) => v !== d);
      if (prev.length >= frequency) return prev; // 개수 초과 — 무시
      return [...prev, d].sort();
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const trimmed = field.trim();
    if (!trimmed) {
      setError("활동 분야를 입력해주세요.");
      return;
    }
    if (frequency == null) {
      setError("주기를 골라주세요.");
      return;
    }
    if (days.length !== frequency) {
      setError(`요일을 ${frequency}개 골라주세요.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) {
        router.replace("/login");
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ field: trimmed, uploadFrequency: frequency, uploadDays: days }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "저장하지 못했어요. 잠시 후 다시 시도해주세요.");
        setSubmitting(false);
        return;
      }
      router.replace("/"); // 홈 상태 A — 첫 아이디어 말하기 (PRD §5-2)
    } catch {
      setError("네트워크 연결을 확인해주세요.");
      setSubmitting(false);
    }
  }

  if (phase === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center p-4">
        <p className="text-body text-sub">불러오는 중…</p>
      </main>
    );
  }

  const daily = frequency === 7;

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-[560px]">
        <h1 className="text-h2 font-bold text-ink">거의 다 됐어요</h1>
        {/* 60초 — PRD §5-2 확정값 */}
        <p className="mt-2 text-body text-sub">
          콘텐츠 준비에 필요한 두 가지만 알려주세요. 60초면 충분해요.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="field" className="text-body font-semibold text-ink">
              어떤 분야의 콘텐츠를 만드시나요?
            </label>
            <textarea
              id="field"
              rows={5}
              value={field}
              onChange={(e) => {
                setField(e.target.value);
                setError(null);
              }}
              placeholder={FIELD_PLACEHOLDER}
              maxLength={200}
              className="w-full resize-none rounded-md border border-line bg-surface px-4 py-3
                         text-body leading-[1.6] text-ink placeholder:text-sub/60"
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-body font-semibold text-ink">
              일주일에 몇 번 올리는 걸 목표로 하시나요?
            </p>

            {/* 주기 — 한 줄 배치. 테두리 두께가 바뀌면 칸이 흔들려서 두 상태 모두 2px */}
            <p className="mt-1 text-caption text-sub">주기</p>
            <div className="flex gap-1.5">
              {FREQUENCIES.map((n) => {
                const selected = frequency === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => selectFrequency(n)}
                    aria-pressed={selected}
                    className={[
                      "h-10 flex-1 rounded-pill border-2 text-body font-semibold",
                      selected
                        ? "border-berry bg-berry-light text-berry-dark"
                        : "border-line bg-surface text-ink",
                    ].join(" ")}
                  >
                    {n === 7 ? "매일" : `주 ${n}회`}
                  </button>
                );
              })}
            </div>

            {/* 요일 — 주기를 고르면 나타난다 */}
            {frequency != null && (
              <>
                <p className="mt-3 text-caption text-sub">
                  {daily ? "요일 — 매일이라 전부 선택했어요" : `요일 — ${frequency}개를 골라주세요`}
                </p>
                <div className="flex gap-1.5">
                  {DAY_LABELS.map((label, d) => {
                    const selected = days.includes(d);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleDay(d)}
                        aria-pressed={selected}
                        disabled={daily}
                        className={[
                          "flex h-10 flex-1 items-center justify-center gap-1 rounded-pill",
                          "border-2 text-body font-semibold",
                          selected
                            ? "border-berry bg-berry-light text-berry-dark"
                            : "border-line bg-surface text-ink",
                          daily ? "cursor-default" : "",
                        ].join(" ")}
                      >
                        {selected && <Check size={14} aria-hidden />}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {error && <InlineAlert>{error}</InlineAlert>}

          {/* PRD §5-2 — 온보딩이 끝나는 자리의 확정 문구 */}
          <button
            type="submit"
            disabled={submitting}
            className="h-12 rounded-md bg-berry text-[15px] font-semibold text-white
                       hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
          >
            {submitting ? "···" : "첫 콘텐츠를 같이 정해볼까요?"}
          </button>

          <p className="text-center text-caption text-sub">
            말투와 피하고 싶은 표현은 나중에 설정에서 정할 수 있어요.
          </p>
        </form>
      </div>
    </main>
  );
}
