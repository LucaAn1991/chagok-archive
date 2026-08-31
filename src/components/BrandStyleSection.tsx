"use client";

import { useRef, useState } from "react";
import { auth } from "@/lib/firebase/client";
import { BUILT_IN_FONTS } from "@/lib/render/font-registry";
import { inkFor, isHexColor } from "@/lib/render/themes";
import type { Brand, FontId } from "@/types";

/**
 * 「내 스타일」 — 카드뉴스에 쓸 배경색·강조색·폰트 (08-31 · DESIGN.md §12).
 *
 * **계정 단위다.** 여기서 정하면 이후 만드는 모든 카드에 적용되고,
 * 이미 만든 카드도 다음에 열 때 새 색으로 다시 그려진다.
 *
 * **글자색은 고르게 하지 않는다.** 배경색의 명도로 계산해서 미리 보여준다 —
 * 둘 다 열면 §15의 대비 기준을 못 넘기는 조합이 나온다.
 *
 * 저장은 다른 설정과 같은 `PATCH /api/users/me`로 간다. 폰트 파일만
 * 먼저 `POST /api/users/me/font`로 올리고 그 주소를 함께 보낸다.
 */

const DEFAULT_BG = "#FBF7F2";
const DEFAULT_ACCENT = "#A85578";

/** 색을 고르기 어려운 사람을 위한 출발점 — 여기서 고르고 코드로 다듬으면 된다 */
const SUGGESTED: { label: string; bg: string; accent: string }[] = [
  { label: "따뜻한 베이지", bg: "#FBF7F2", accent: "#A85578" },
  { label: "깨끗한 흰색", bg: "#FFFFFF", accent: "#2D292B" },
  { label: "차분한 회색", bg: "#F2F0EB", accent: "#746F72" },
  { label: "짙은 먹", bg: "#1C1B19", accent: "#F28A72" },
];

type Props = {
  /** 저장돼 있는 값. 아직 안 정했으면 null */
  initial: Brand | null;
  /** 파일이 실제로 있는 내장 폰트만 온다 — 없는 폰트를 고르게 하지 않는다 */
  availableFontIds: FontId[];
  onSaved: (brand: Brand | null) => void;
};

export default function BrandStyleSection({ initial, availableFontIds, onSaved }: Props) {
  const [bg, setBg] = useState(initial?.bg ?? DEFAULT_BG);
  const [accent, setAccent] = useState(initial?.accent ?? DEFAULT_ACCENT);
  const [fontId, setFontId] = useState<FontId>(initial?.fontId ?? "pretendard");
  const [customUrl, setCustomUrl] = useState(initial?.customFontUrl ?? null);
  const [customName, setCustomName] = useState(initial?.customFontName ?? null);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const bgValid = isHexColor(bg);
  const accentValid = isHexColor(accent);
  // 미리보기는 유효한 값일 때만 — 입력 중간의 «#FB»로 계산하면 엉뚱한 색이 뜬다
  const previewBg = bgValid ? bg : DEFAULT_BG;
  const previewInk = inkFor(previewBg);

  const fonts = BUILT_IN_FONTS.filter((f) => availableFontIds.includes(f.id));

  async function uploadFont(file: File) {
    setUploading(true);
    setError(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("로그인이 필요해요.");

      const form = new FormData();
      form.append("font", file);
      const res = await fetch("/api/users/me/font", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        body: form,
      });
      const data = (await res.json().catch(() => null)) as
        | { url?: string; name?: string; error?: string }
        | null;
      if (!res.ok || !data?.url) throw new Error(data?.error ?? "폰트를 올리지 못했어요.");

      setCustomUrl(data.url);
      setCustomName(data.name ?? file.name);
      setFontId("custom"); // 올렸으면 바로 그걸 쓰겠다는 뜻이다
      setDone(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "폰트를 올리지 못했어요.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

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
    if (!bgValid || !accentValid) {
      setError("색상 코드를 #RRGGBB 형식으로 적어주세요. 예: #FBF7F2");
      return;
    }
    if (fontId === "custom" && !customUrl) {
      setError("올린 폰트가 없어요. 폰트 파일을 먼저 올려주세요.");
      return;
    }
    save({
      bg: bg.toUpperCase(),
      accent: accent.toUpperCase(),
      fontId,
      ...(fontId === "custom" ? { customFontUrl: customUrl, customFontName: customName } : {}),
    });
  }

  const inputClass =
    "w-full rounded-md border border-line bg-surface px-3 py-2 text-body text-ink";

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-6">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-body font-semibold text-ink">내 카드 스타일</h2>
        <p className="text-caption text-sub">
          여기서 정한 색과 폰트로 카드뉴스가 만들어져요. 이미 만든 카드도 함께 바뀌어요.
        </p>
      </div>

      {/* 미리보기 — 고른 값이 실제로 어떻게 보이는지 */}
      <div
        aria-label="카드 미리보기"
        className="flex aspect-square w-full max-w-[220px] flex-col justify-center gap-2 rounded-lg border border-line p-6"
        style={{ background: previewBg, color: previewInk }}
      >
        <span className="text-title font-bold">아침 10분 홈트,</span>
        <span className="text-body" style={{ opacity: 0.72 }}>
          3년차 트레이너가 정리했어요
        </span>
        <span
          aria-hidden
          className="mt-1 h-1 w-10 rounded-pill"
          style={{ background: accentValid ? accent : DEFAULT_ACCENT }}
        />
      </div>

      {/* 추천 조합 — 색 고르기가 어려운 사람의 출발점 */}
      <div className="flex flex-col gap-2">
        <span className="text-label font-semibold text-sub">이런 조합은 어때요</span>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                setBg(s.bg);
                setAccent(s.accent);
              }}
              className="flex items-center gap-2 rounded-pill border border-line px-3 py-2 text-caption text-sub hover:text-ink"
            >
              <span
                aria-hidden
                className="h-4 w-4 rounded-pill border border-line"
                style={{ background: s.bg }}
              />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 색상 코드 */}
      <div className="flex flex-wrap gap-4">
        <label className="flex min-w-[160px] flex-1 flex-col gap-1">
          <span className="text-label font-semibold text-sub">배경색</span>
          <input
            value={bg}
            onChange={(e) => setBg(e.target.value.trim())}
            placeholder="#FBF7F2"
            aria-invalid={!bgValid}
            className={inputClass}
          />
          <span className="text-caption text-sub">
            {bgValid ? `글자는 ${previewInk === "#FFFFFF" ? "흰색" : "먹색"}으로 자동 맞춰져요` : "#RRGGBB 형식으로 적어주세요"}
          </span>
        </label>

        <label className="flex min-w-[160px] flex-1 flex-col gap-1">
          <span className="text-label font-semibold text-sub">강조색</span>
          <input
            value={accent}
            onChange={(e) => setAccent(e.target.value.trim())}
            placeholder="#A85578"
            aria-invalid={!accentValid}
            className={inputClass}
          />
          <span className="text-caption text-sub">밑줄·점처럼 작은 부분에만 쓰여요</span>
        </label>
      </div>

      {/* 폰트 */}
      <div className="flex flex-col gap-2">
        <span className="text-label font-semibold text-sub">폰트</span>
        <div role="radiogroup" aria-label="폰트" className="flex flex-wrap gap-2">
          {fonts.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={fontId === f.id}
              onClick={() => setFontId(f.id)}
              className={`flex flex-col items-start rounded-md border px-3 py-2 text-left ${
                fontId === f.id ? "border-berry bg-berry-light" : "border-line hover:border-berry"
              }`}
            >
              <span
                className={`text-caption font-semibold ${
                  fontId === f.id ? "text-berry-dark" : "text-ink"
                }`}
              >
                {f.label}
              </span>
              <span className="text-caption text-sub">{f.hint}</span>
            </button>
          ))}

          {customUrl && (
            <button
              type="button"
              role="radio"
              aria-checked={fontId === "custom"}
              onClick={() => setFontId("custom")}
              className={`flex flex-col items-start rounded-md border px-3 py-2 text-left ${
                fontId === "custom" ? "border-berry bg-berry-light" : "border-line hover:border-berry"
              }`}
            >
              <span
                className={`text-caption font-semibold ${
                  fontId === "custom" ? "text-berry-dark" : "text-ink"
                }`}
              >
                내가 올린 폰트
              </span>
              <span className="max-w-[180px] truncate text-caption text-sub">{customName}</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".ttf,.otf,font/ttf,font/otf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFont(f);
            }}
            className="hidden"
            id="font-upload"
          />
          <label
            htmlFor="font-upload"
            className="h-11 cursor-pointer rounded-md border-2 border-berry bg-surface px-5 text-body font-semibold leading-[2.5rem] text-berry"
          >
            {uploading ? "올리는 중···" : "폰트 올리기"}
          </label>
          <p className="text-caption text-sub">
            <strong>TTF · OTF</strong>만 올릴 수 있어요 (woff2는 안 돼요). 한글이 있는 폰트여야
            해요.
          </p>
        </div>
        <p className="text-caption text-sub">
          올린 폰트를 쓸 권리가 있는지는 직접 확인해주세요. 상업적 이용이 허용된 폰트만
          올려주세요.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-body text-ink">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || uploading}
          className="h-11 rounded-md bg-berry px-5 text-body font-semibold text-white
                     hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
        >
          {saving ? "···" : "저장"}
        </button>
        {initial && (
          <button
            type="button"
            onClick={() => save(null)}
            disabled={saving || uploading}
            className="text-body text-sub"
          >
            기본으로 되돌리기
          </button>
        )}
        {done && <span className="text-caption text-sub">저장됐어요.</span>}
      </div>
    </section>
  );
}
