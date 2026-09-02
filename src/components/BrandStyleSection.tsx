"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase/client";
import { isHexColor } from "@/lib/render/themes";
import type { Brand } from "@/types";

/**
 * 「내 스타일」 — 카드뉴스에 쓸 **강조색** (09-02 축소 · 원래는 08-31 DESIGN.md §12).
 *
 * **계정 단위다.** 여기서 정하면 이후 만드는 모든 카드에 적용된다 —
 * 인스타 계정에는 톤이 있고 카드뉴스가 그걸 따라야 피드가 흐트러지지 않는다.
 *
 * ---
 *
 * **09-02에 배경색·글꼴을 뺐다.** 카드뉴스를 시안 템플릿에서 만들게 되면서
 * 배경과 글꼴은 **템플릿이 정한다.** 설정에 남겨두면 사용자는 고르는데
 * 결과물엔 안 나타나는, 없느니만 못한 항목이 된다.
 *
 * 강조색만 남은 이유는 **이건 실제로 반영되기 때문**이다 — 템플릿 위의 배지·선·
 * 숫자·작은 라벨에 입혀진다(실측 확인).
 *
 * 옛 계정에 저장된 배경색·글꼴은 지우지 않는다. 이미지 생성이 실패해 폴백
 * 렌더러로 그릴 때 그 값이 쓰인다. 다만 **새로 만들지는 않는다.**
 *
 * @TODO: DESIGN.md §12 「편집 범위」와 PLAN.md의 「내 스타일」 서술이 아직 옛 상태다 (보고함)
 */

const DEFAULT_ACCENT = "#A85578";

/** 색을 고르기 어려운 사람을 위한 출발점 — 여기서 고르고 코드로 다듬으면 된다 */
const SUGGESTED: { label: string; accent: string }[] = [
  { label: "베리", accent: "#A85578" },
  { label: "네이비", accent: "#1B2A4A" },
  { label: "먹색", accent: "#2D292B" },
  { label: "테라코타", accent: "#B4472E" },
  { label: "딥그린", accent: "#2F5D4A" },
];

type Props = {
  /** 저장돼 있는 값. 아직 안 정했으면 null */
  initial: Brand | null;
  onSaved: (brand: Brand | null) => void;
};

export default function BrandStyleSection({ initial, onSaved }: Props) {
  const [accent, setAccent] = useState(initial?.accent ?? DEFAULT_ACCENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const accentValid = isHexColor(accent);
  // 미리보기는 유효한 값일 때만 — 입력 중간의 «#1B»로 칠하면 엉뚱한 색이 뜬다
  const shown = accentValid ? accent : DEFAULT_ACCENT;

  async function save(next: Brand | null) {
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
        body: JSON.stringify({ brand: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "저장하지 못했어요.");
      }
      onSaved(next);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    if (!accentValid) {
      setError("색상 코드를 #RRGGBB 형식으로 적어주세요. 예: #1B2A4A");
      return;
    }
    /*
      옛 계정에 남은 배경색·글꼴은 **그대로 실어 보낸다.** 여기서 빼버리면
      폴백 렌더러가 쓰던 값이 조용히 사라진다 — 사용자는 강조색만 바꿨는데
      다른 것까지 초기화된다.
    */
    save({
      accent: accent.toUpperCase(),
      ...(initial?.bg ? { bg: initial.bg } : {}),
      ...(initial?.fontId ? { fontId: initial.fontId } : {}),
      ...(initial?.customFontUrl ? { customFontUrl: initial.customFontUrl } : {}),
      ...(initial?.customFontName ? { customFontName: initial.customFontName } : {}),
    });
  }

  const inputClass =
    "w-full rounded-md border border-line bg-surface px-3 py-2 text-body text-ink";

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-6">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-body font-semibold text-ink">내 카드 스타일</h2>
        <p className="text-caption text-sub">
          여기서 정한 강조색이 카드뉴스의 배지·선·작은 글씨에 쓰여요. 배경과 글꼴은 고른
          템플릿을 따라가요.
        </p>
      </div>

      {/* 미리보기 — 강조색이 «작은 면에만» 쓰인다는 걸 그림으로 보여준다 */}
      <div
        aria-label="강조색 미리보기"
        className="flex aspect-square w-full max-w-[220px] flex-col justify-center gap-2 rounded-lg border border-line bg-surface-muted p-6"
      >
        <span
          aria-hidden
          className="w-fit rounded-pill px-3 py-1 text-caption font-semibold text-white"
          style={{ background: shown }}
        >
          OUTDOOR
        </span>
        <span className="text-title font-bold text-ink">아침 10분 홈트,</span>
        <span className="text-body text-sub">3년차 트레이너가 정리했어요</span>
        <span aria-hidden className="mt-1 h-1 w-10 rounded-pill" style={{ background: shown }} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-label font-semibold text-sub">이런 색은 어때요</span>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setAccent(s.accent)}
              className="flex items-center gap-2 rounded-pill border border-line px-3 py-2 text-caption text-sub hover:text-ink"
            >
              <span
                aria-hidden
                className="h-4 w-4 rounded-pill border border-line"
                style={{ background: s.accent }}
              />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex max-w-[240px] flex-col gap-1">
        <span className="text-label font-semibold text-sub">강조색</span>
        <input
          value={accent}
          onChange={(e) => setAccent(e.target.value.trim())}
          placeholder="#A85578"
          aria-invalid={!accentValid}
          className={inputClass}
        />
        <span className="text-caption text-sub">
          {accentValid ? "배지·선처럼 작은 부분에만 쓰여요" : "#RRGGBB 형식으로 적어주세요"}
        </span>
      </label>

      {error && (
        <p role="alert" className="text-body text-ink">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-11 rounded-md bg-berry px-5 text-body font-semibold text-white
                     hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
        >
          {saving ? "···" : "저장"}
        </button>
        {/* 되돌리기 — 강조색을 안 정한 상태로. 그러면 템플릿 색이 그대로 나온다 */}
        <button
          type="button"
          onClick={() => save(null)}
          disabled={saving}
          className="text-body text-sub underline underline-offset-4 hover:text-ink"
        >
          기본으로 되돌리기
        </button>
        {done && <span className="text-caption text-sub">저장됐어요.</span>}
      </div>
    </section>
  );
}
