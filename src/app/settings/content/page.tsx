"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Check } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import InlineAlert from "@/components/InlineAlert";
import type { ToneKey, User } from "@/types";

/**
 * 설정 — 콘텐츠 (PLAN.md §4 · 「콘텐츠 설정 수정」).
 *
 * 온보딩에서 받은 값(활동 분야 · 업로드 빈도)과, 온보딩에서 설정으로 옮긴 값
 * (말투 · 피할 표현)을 여기서 고친다 — 08-28 온보딩 2문항 축소의 반대편이다.
 *
 * 저장은 `PATCH /api/users/me` 한 곳으로 모은다. 보안 규칙이 클라이언트 쓰기를
 * 열어둔 필드도 있지만, 검증(빈도↔요일 개수, 표현 20개·30자)이 서버에 이미 있어
 * 두 벌로 나누면 규칙이 갈라진다.
 *
 * 저장 실패는 인라인 표시 (PLAN.md §3-1). 화면을 떠나게 만들지 않는다.
 */

const FREQUENCIES = [1, 2, 3, 4, 5, 6, 7] as const;
const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"]; // index = 저장값 (0=월 … 6=일)

/**
 * 말투 4종 — 사용자는 «키»가 아니라 «문장»을 보고 고른다.
 *
 * @TODO: 아래 예시 문장은 확정 카피가 아니다 (PLAN.md §12 「값이 비어 있는 것」 5번 —
 *   «말투 4종의 키·예시 문장» 미확정). 키 4개는 User 타입에 확정돼 있고 문장만 임시다.
 *   실제 카피가 정해지면 이 배열만 교체하면 된다.
 */
const TONES: { key: ToneKey; label: string; sample: string }[] = [
  {
    key: "friendly",
    label: "친근한",
    sample: "오늘도 들러주셔서 고마워요. 같이 해봐요!",
  },
  {
    key: "calm",
    label: "차분한",
    sample: "오늘은 이런 이야기를 준비했습니다.",
  },
  {
    key: "energetic",
    label: "활기찬",
    sample: "자, 오늘도 시작해볼까요? 진짜 좋아요!",
  },
  {
    key: "professional",
    label: "전문적인",
    sample: "핵심만 정리했습니다. 세 가지만 확인하세요.",
  },
];

const MAX_AVOID = 20;
const MAX_AVOID_LEN = 30;

type Phase = "loading" | "ready" | "error";

export default function ContentSettingsPage() {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [saved, setSaved] = useState<User | null>(null);

  const [field, setField] = useState("");
  const [frequency, setFrequency] = useState<number | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [tone, setTone] = useState<ToneKey | null>(null);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [avoidDraft, setAvoidDraft] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.data() as User | undefined;
        if (!data) {
          setPhase("error");
          return;
        }
        setSaved(data);
        setField(data.field ?? "");
        setFrequency(data.uploadFrequency ?? null);
        setDays(data.uploadDays ?? []);
        setTone(data.tone ?? null);
        setAvoid(data.avoidExpressions ?? []);
        setPhase("ready");
      } catch {
        setPhase("error");
      }
    });
    return unsubscribe;
  }, [router]);

  const daily = frequency === 7;

  /** 주기 선택 — 매일(7)이면 요일은 전체라 고를 것이 없다 (온보딩과 같은 규칙) */
  function selectFrequency(n: number) {
    setFrequency(n);
    setDays(n === 7 ? [0, 1, 2, 3, 4, 5, 6] : []);
    setError(null);
    setDone(false);
  }

  /** 요일 토글 — 주기 개수까지만 고를 수 있다 */
  function toggleDay(d: number) {
    setDone(false);
    setDays((prev) => {
      if (prev.includes(d)) return prev.filter((x) => x !== d);
      if (frequency != null && prev.length >= frequency) return prev;
      return [...prev, d].sort((a, b) => a - b);
    });
  }

  function addAvoid() {
    const value = avoidDraft.trim();
    if (!value) return;
    if (value.length > MAX_AVOID_LEN) {
      setError(`피할 표현은 ${MAX_AVOID_LEN}자까지예요.`);
      return;
    }
    if (avoid.length >= MAX_AVOID) {
      setError(`피할 표현은 ${MAX_AVOID}개까지 넣을 수 있어요.`);
      return;
    }
    if (avoid.includes(value)) {
      setAvoidDraft("");
      return; // 이미 있는 표현은 조용히 넘긴다 — 오류라고 할 일이 아니다
    }
    setAvoid([...avoid, value]);
    setAvoidDraft("");
    setError(null);
    setDone(false);
  }

  const dirty =
    saved !== null &&
    (field.trim() !== (saved.field ?? "") ||
      frequency !== (saved.uploadFrequency ?? null) ||
      JSON.stringify(days) !== JSON.stringify(saved.uploadDays ?? []) ||
      tone !== (saved.tone ?? null) ||
      JSON.stringify(avoid) !== JSON.stringify(saved.avoidExpressions ?? []));

  async function save() {
    if (!field.trim()) {
      setError("활동 분야를 입력해주세요.");
      return;
    }
    if (frequency == null) {
      setError("업로드 빈도를 골라주세요.");
      return;
    }
    if (days.length !== frequency) {
      setError(`요일을 ${frequency}개 골라주세요.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("로그인이 필요해요.");

      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          field: field.trim(),
          uploadFrequency: frequency,
          uploadDays: days,
          tone,
          avoidExpressions: avoid,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "저장하지 못했어요.");
      }

      // 저장 성공 → 비교 기준을 새 값으로 옮긴다. 안 하면 계속 «저장 안 됨» 상태로 남는다
      setSaved({
        ...(saved as User),
        field: field.trim(),
        uploadFrequency: frequency,
        uploadDays: days,
        tone,
        avoidExpressions: avoid,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  if (phase === "loading") {
    return (
      <div className="flex flex-1">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-[720px] flex-1 p-4 pb-24 md:p-6 md:pb-8 min-[1200px]:p-8">
            <div aria-hidden className="flex animate-pulse flex-col gap-4">
              <div className="h-8 w-40 rounded-md bg-surface-muted" />
              <div className="h-32 rounded-lg bg-surface-muted" />
              <div className="h-32 rounded-lg bg-surface-muted" />
            </div>
          </main>
        </div>
        <MobileBottomNav />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex flex-1">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col items-center justify-center gap-3 p-4">
            <h1 className="text-h3 font-bold text-ink">설정을 불러오지 못했어요</h1>
            <button
              type="button"
              onClick={() => location.reload()}
              className="h-11 rounded-md border border-line px-4 text-body font-semibold text-ink"
            >
              다시 시도
            </button>
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
          <header className="flex flex-col gap-1">
            <h1 className="text-h3 font-bold text-ink">콘텐츠 설정</h1>
            <p className="text-body text-sub">
              바꾼 내용은 앞으로 만드는 콘텐츠부터 반영돼요.
            </p>
          </header>

          <div className="mt-6 flex flex-col gap-4">
            {/* 활동 분야 */}
            <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-6">
              <label htmlFor="field" className="text-body font-semibold text-ink">
                어떤 콘텐츠를 만드시나요?
              </label>
              <textarea
                id="field"
                rows={3}
                value={field}
                maxLength={200}
                onChange={(e) => {
                  setField(e.target.value);
                  setError(null);
                  setDone(false);
                }}
                className="w-full resize-none rounded-md border border-line bg-surface px-4 py-3
                           text-body leading-[1.6] text-ink placeholder:text-sub/60"
              />
            </section>

            {/* 업로드 빈도 + 요일 */}
            <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-6">
              <p className="text-body font-semibold text-ink">
                일주일에 몇 번 올리는 걸 목표로 하시나요?
              </p>
              <div className="mt-1 flex gap-1.5">
                {FREQUENCIES.map((n) => {
                  const isSelected = frequency === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => selectFrequency(n)}
                      aria-pressed={isSelected}
                      className={[
                        "h-10 flex-1 rounded-pill border-2 text-body font-semibold",
                        isSelected
                          ? "border-berry bg-berry-light text-berry-dark"
                          : "border-line bg-surface text-ink",
                      ].join(" ")}
                    >
                      {n === 7 ? "매일" : `주 ${n}회`}
                    </button>
                  );
                })}
              </div>

              {daily && (
                <p className="mt-4 flex items-center gap-1.5 text-body text-ink">
                  <Check size={16} className="shrink-0 text-berry" aria-hidden />
                  매일 업로드하도록 설정했어요.
                </p>
              )}

              {frequency != null && !daily && (
                <>
                  <p className="mt-4 text-body font-semibold text-ink">
                    어떤 요일이 편하세요? {frequency}개를 골라주세요.
                  </p>
                  <div className="flex gap-1.5">
                    {DAY_LABELS.map((label, d) => {
                      const isSelected = days.includes(d);
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => toggleDay(d)}
                          aria-pressed={isSelected}
                          className={[
                            "flex h-10 flex-1 items-center justify-center gap-1 rounded-pill",
                            "border-2 text-body font-semibold",
                            isSelected
                              ? "border-berry bg-berry-light text-berry-dark"
                              : "border-line bg-surface text-ink",
                          ].join(" ")}
                        >
                          {isSelected && <Check size={14} aria-hidden />}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            {/* 말투 — 키가 아니라 예시 문장을 보고 고른다 */}
            <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6">
              <div className="flex flex-col gap-0.5">
                <p className="text-body font-semibold text-ink">어떤 말투가 편하세요?</p>
                <p className="text-caption text-sub">
                  캡션을 쓸 때 이 말투로 맞춰드려요. 안 골라도 괜찮아요.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {TONES.map((t) => {
                  const isSelected = tone === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => {
                        setTone(isSelected ? null : t.key); // 다시 누르면 «안 정함»
                        setDone(false);
                      }}
                      aria-pressed={isSelected}
                      className={[
                        "flex flex-col gap-1 rounded-md border-2 p-4 text-left",
                        isSelected
                          ? "border-berry bg-berry-light"
                          : "border-line bg-surface hover:bg-surface-muted",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "flex items-center gap-1 text-body font-semibold",
                          isSelected ? "text-berry-dark" : "text-ink",
                        ].join(" ")}
                      >
                        {isSelected && <Check size={14} aria-hidden />}
                        {t.label}
                      </span>
                      <span className="text-caption leading-[1.5] text-sub">
                        “{t.sample}”
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 피할 표현 */}
            <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6">
              <div className="flex flex-col gap-0.5">
                <label htmlFor="avoid" className="text-body font-semibold text-ink">
                  쓰지 않았으면 하는 표현이 있나요?
                </label>
                <p className="text-caption text-sub">
                  캡션을 만들 때 이 표현들은 빼드려요. 예: 대박, 필수템
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  id="avoid"
                  value={avoidDraft}
                  maxLength={MAX_AVOID_LEN}
                  onChange={(e) => setAvoidDraft(e.target.value)}
                  onKeyDown={(e) => {
                    // 한글 조합 중 엔터는 «글자 확정»이라 항목 추가로 보면 안 된다
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      addAvoid();
                    }
                  }}
                  placeholder="표현을 입력하고 추가를 누르세요"
                  className="h-11 min-w-0 flex-1 rounded-md border border-line bg-surface px-3
                             text-body text-ink placeholder:text-sub/60"
                />
                <button
                  type="button"
                  onClick={addAvoid}
                  disabled={!avoidDraft.trim()}
                  className="h-11 shrink-0 rounded-md border border-line px-4 text-body font-semibold
                             text-ink disabled:text-sub/50"
                >
                  추가
                </button>
              </div>

              {avoid.length === 0 ? (
                <p className="text-caption text-sub">아직 등록한 표현이 없어요.</p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {avoid.map((v) => (
                    <li key={v}>
                      <button
                        type="button"
                        onClick={() => {
                          setAvoid(avoid.filter((x) => x !== v));
                          setDone(false);
                        }}
                        aria-label={`${v} 빼기`}
                        className="flex h-9 items-center gap-1.5 rounded-pill border border-line
                                   bg-surface-muted px-3 text-body text-ink hover:text-berry-dark"
                      >
                        {v}
                        <span aria-hidden className="text-sub">
                          ×
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {error && <InlineAlert>{error}</InlineAlert>}
            {done && !dirty && (
              <p className="flex items-center gap-1.5 text-body text-ink">
                <Check size={16} className="shrink-0 text-berry" aria-hidden />
                저장했어요.
              </p>
            )}

            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="h-12 rounded-md bg-berry text-[15px] font-semibold text-white
                         hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
            >
              {saving ? "저장하는 중…" : "저장"}
            </button>
          </div>
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
