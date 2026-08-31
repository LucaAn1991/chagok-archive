"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged, type User as AuthUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import AppShell from "@/components/AppShell";
import BackLink from "@/components/BackLink";
import SlotToolbar from "@/components/SlotToolbar";
import SlideEditor from "@/components/SlideEditor";
import CardPhotoUploader from "@/components/CardPhotoUploader";
import { IMAGE_LAYOUTS, LAYOUT_LABELS, layoutOptionsFor } from "@/lib/slide-layout";
import { bakeToElements } from "@/lib/free-layout";
import { MAX_PHOTOS_PER_CARD } from "@/lib/storage/limits";
import type { Card, FontId, LayoutId, SlideElement, SlotStyle } from "@/types";

/**
 * 슬라이드 편집 (08-31 · DESIGN.md §12).
 *
 * **화면을 따로 뒀다.** 원래는 제작 결과 아래에 패널로 붙어 있었는데,
 * 고치는 동안 **정작 슬라이드가 화면 밖으로 밀려나** 결과를 못 보고 편집했다.
 * 여기서는 미리보기가 늘 위에 있고, 고치면 곧바로 다시 그려진다 (렌더링 5~10ms).
 *
 * 모달이 아니라 라우트인 이유는 모바일이다 (PRD 모바일 우선) —
 * 뒤로가기가 OS 제스처와 그대로 맞고, 모달이 흔히 겪는 스크롤 잠금·키보드
 * 문제가 없다.
 *
 * 한 화면에 다 펼치지 않고 **탭으로 나눈다.** 문구·사진·레이아웃을 동시에
 * 보여주면 무엇부터 만져야 할지 알 수 없다.
 */

const SLOT_LABELS: Record<string, string> = {
  title: "제목",
  subtitle: "부제",
  body: "본문",
  message: "메시지",
  cta: "마무리 문구",
  item1: "항목 1",
  item2: "항목 2",
  item3: "항목 3",
  item4: "항목 4",
};

type Tab = "text" | "photo" | "layout";
type Phase = "loading" | "ready" | "not-found";

export default function SlideEditPage() {
  const router = useRouter();
  const { cardId, order: orderParam } = useParams<{ cardId: string; order: string }>();
  const order = Number(orderParam);

  const [phase, setPhase] = useState<Phase>("loading");
  const [card, setCard] = useState<Card | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("text");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(false);

  const [textDraft, setTextDraft] = useState<Record<string, string>>({});
  const [styleDraft, setStyleDraft] = useState<Record<string, SlotStyle>>({});
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  /** 파일이 실제로 있는 폰트만 툴바에 띄운다 — 서버만 아는 값이라 물어본다 */
  const [fontIds, setFontIds] = useState<FontId[]>([]);

  const userRef = useRef<AuthUser | null>(null);
  /** 툴바 자동 저장 타이머 — 연달아 누르면 마지막 것만 보낸다 */
  const styleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (styleTimer.current) clearTimeout(styleTimer.current);
    };
  }, []);
  const urlRef = useRef<string | null>(null);
  useEffect(() => {
    urlRef.current = imageUrl;
  }, [imageUrl]);
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const slide = card?.slides.find((s) => s.order === order) ?? null;
  const freeMode = Boolean(slide?.elements?.length);

  /** 이 슬라이드 PNG를 받아 화면에 건다. `fresh`면 캐시를 지나친다 */
  const loadImage = useCallback(
    async (token: string, fresh = false) => {
      const res = await fetch(`/api/cards/${cardId}/slides/${order}/image`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: fresh ? "reload" : "default",
      });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      const stale = urlRef.current;
      setImageUrl(url);
      if (stale) URL.revokeObjectURL(stale);
    },
    [cardId, order],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      userRef.current = user;
      try {
        const snap = await getDoc(doc(db, "cards", cardId));
        const data = snap.data() as Card | undefined;
        const found = data?.slides.find((s) => s.order === order);
        if (!data || data.userId !== user.uid || !found) {
          setPhase("not-found");
          return;
        }
        setCard(data);
        setTextDraft({ ...found.texts });
        setStyleDraft({ ...(found.styleOverrides ?? {}) });
        setPhase("ready");
        fetch("/api/fonts")
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { fontIds?: FontId[] } | null) => setFontIds(d?.fontIds ?? []))
          .catch(() => setFontIds([]));
        await loadImage(await user.getIdToken());
      } catch {
        setPhase("not-found");
      }
    });
    return unsubscribe;
  }, [cardId, order, router, loadImage]);

  /** 저장 공통 — 저장하고 그 자리에서 다시 그린다 */
  async function save(patch: Record<string, unknown>): Promise<Card["slides"] | null> {
    const user = userRef.current;
    if (!user || saving) return null;
    setSaving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/cards/${cardId}/content`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? "저장하지 못했어요.");
      }
      const data = (await res.json()) as Pick<Card, "slides">;
      setCard((prev) => (prev ? { ...prev, slides: data.slides } : prev));
      await loadImage(token, true);
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 1500);
      return data.slides;
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  /** 자유 배치일 때는 요소의 글자도 같이 고친다 — 안 그러면 그림이 안 바뀐다 */
  function withElementText(styles = styleDraft): SlideElement[] | undefined {
    if (!freeMode || !slide?.elements) return undefined;
    return slide.elements.map((el) =>
      el.slot && textDraft[el.slot] !== undefined
        ? { ...el, text: textDraft[el.slot], style: styles[el.slot] }
        : el,
    );
  }

  /**
   * 툴바 조절은 **누르는 즉시 반영한다** (08-31 수정).
   *
   * 처음에는 로컬 상태만 바꾸고 「문구」 탭의 저장 버튼을 눌러야 그려졌는데,
   * 툴바를 만지는 사람은 그 버튼을 볼 이유가 없어서 «아무 일도 안 일어난다»가 됐다.
   *
   * 연달아 누를 때(크기를 세 칸 키우는 등) 매번 저장하면 요청이 겹치므로
   * 잠깐 모았다 보낸다. 렌더링이 5~10ms라 기다림은 거의 없다.
   */
  function applyStyle(next: Record<string, SlotStyle>) {
    setStyleDraft(next);
    if (styleTimer.current) clearTimeout(styleTimer.current);
    styleTimer.current = setTimeout(() => {
      const els = withElementText(next);
      void save({
        slides: [
          { order, texts: textDraft, styleOverrides: next, ...(els ? { elements: els } : {}) },
        ],
      });
    }, 250);
  }

  async function saveText() {
    const els = withElementText();
    await save({
      slides: [
        {
          order,
          texts: textDraft,
          styleOverrides: styleDraft,
          ...(els ? { elements: els } : {}),
        },
      ],
    });
  }

  async function selectLayout(next: LayoutId) {
    const slides = await save({
      slides: [{ order, texts: textDraft, styleOverrides: styleDraft, layoutId: next }],
    });
    const moved = slides?.find((s) => s.order === order);
    if (moved) {
      setTextDraft({ ...moved.texts });
      setStyleDraft({ ...(moved.styleOverrides ?? {}) });
      setSelectedSlot(null);
    }
  }

  /** 문구만 «저장 안 됨»으로 본다 — 툴바 조절은 알아서 반영되므로 (08-31) */
  const dirty = Boolean(slide && JSON.stringify(slide.texts) !== JSON.stringify(textDraft));

  if (phase === "not-found") {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <h1 className="text-title font-bold">슬라이드를 찾을 수 없어요</h1>
          <BackLink fallbackHref={`/card/${cardId}/result`}>제작 결과로</BackLink>
        </div>
      </AppShell>
    );
  }

  const total = card?.slides.length ?? 0;
  const inputClass =
    "w-full rounded-md border border-line bg-surface px-3 py-2 text-body text-ink";

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink fallbackHref={`/card/${cardId}/result`}>제작 결과</BackLink>
        <span className="text-caption text-sub">
          {saving ? "저장 중···" : savedAt ? "저장됐어요" : dirty ? "저장 안 됨" : ""}
        </span>
      </div>

      {/* 슬라이드 이동 — 목록으로 돌아가지 않고 옆 장으로 간다 */}
      <div className="mt-3 flex items-center justify-between">
        <NavButton
          disabled={order <= 0}
          onClick={() => router.push(`/card/${cardId}/edit/${order - 1}`)}
          label="이전 슬라이드"
        >
          <ChevronLeft size={20} aria-hidden />
        </NavButton>
        <span className="text-body font-semibold text-ink">
          {order + 1} / {total || "…"}
        </span>
        <NavButton
          disabled={order >= total - 1}
          onClick={() => router.push(`/card/${cardId}/edit/${order + 1}`)}
          label="다음 슬라이드"
        >
          <ChevronRight size={20} aria-hidden />
        </NavButton>
      </div>

      {/* 툴바는 위에 — 고른 줄 하나를 조절한다 */}
      <div className="mt-3">
        <SlotToolbar
          slotLabel={selectedSlot ? (SLOT_LABELS[selectedSlot] ?? selectedSlot) : null}
          value={selectedSlot ? styleDraft[selectedSlot] : undefined}
          availableFontIds={fontIds}
          disabled={saving}
          onChange={(next) => {
            if (!selectedSlot) return;
            const merged = { ...styleDraft };
            if (next) merged[selectedSlot] = next;
            else delete merged[selectedSlot];
            applyStyle(merged);
          }}
        />
      </div>

      {/* 미리보기 — 늘 보인다. 자유 배치면 여기서 바로 끈다 */}
      <div className="mt-4 flex justify-center">
        {freeMode && slide?.elements ? (
          <SlideEditor
            imageUrl={imageUrl}
            elements={slide.elements}
            selectedId={selectedElId}
            onSelect={setSelectedElId}
            disabled={saving}
            onCommit={(next) => save({ slides: [{ order, elements: next }] })}
          />
        ) : (
          <div className="aspect-square w-full max-w-[420px] overflow-hidden rounded-lg border border-line bg-surface-muted">
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- blob URL은 next/image 대상이 아니다
              <img src={imageUrl} alt={`슬라이드 ${order + 1}`} className="h-full w-full" />
            )}
          </div>
        )}
      </div>

      {slide && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {freeMode ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (window.confirm("옮겨둔 배치가 사라지고 원래 레이아웃으로 돌아가요.")) {
                  save({ slides: [{ order, elements: null }] });
                }
              }}
              className="text-caption text-sub underline underline-offset-4 hover:text-ink"
            >
              레이아웃으로 되돌리기
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => save({ slides: [{ order, elements: bakeToElements(slide) }] })}
              className="h-9 rounded-md border-2 border-berry bg-surface px-3 text-caption font-semibold text-berry"
            >
              자유롭게 옮기기
            </button>
          )}
          {freeMode && (
            <span className="text-caption text-sub">끌어서 옮기고 모서리 점으로 크기 조절</span>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-body text-ink">
          {error}
        </p>
      )}

      {/* 탭 — 한 번에 하나만 보여준다 */}
      <div role="tablist" aria-label="편집 항목" className="mt-6 flex gap-2 border-b border-line">
        {(
          [
            ["text", "문구"],
            ["photo", "사진"],
            ["layout", "레이아웃"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-3 py-2 text-body ${
              tab === id
                ? "border-berry font-semibold text-berry-dark"
                : "border-transparent text-sub hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 pb-8">
        {tab === "text" && slide && (
          <>
            {Object.entries(textDraft).map(([key, value]) => {
              const active = selectedSlot === key;
              return (
                <label key={key} className="flex flex-col gap-1">
                  <span
                    className={`text-label font-semibold ${active ? "text-berry-dark" : "text-sub"}`}
                  >
                    {SLOT_LABELS[key] ?? key}
                  </span>
                  <textarea
                    value={value}
                    rows={value.length > 40 ? 3 : 1}
                    onFocus={() => setSelectedSlot(key)}
                    onChange={(e) => setTextDraft({ ...textDraft, [key]: e.target.value })}
                    className={`${inputClass} ${active ? "border-berry" : ""}`}
                  />
                </label>
              );
            })}
            {dirty && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={saveText}
                  disabled={saving}
                  className="h-11 rounded-md bg-berry px-5 text-body font-semibold text-white
                             hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
                >
                  {saving ? "···" : "저장"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTextDraft({ ...slide.texts });
                    setStyleDraft({ ...(slide.styleOverrides ?? {}) });
                  }}
                  className="text-body text-sub"
                >
                  되돌리기
                </button>
              </div>
            )}
          </>
        )}

        {tab === "photo" && card && slide && (
          <>
            {IMAGE_LAYOUTS.includes(slide.layoutId) ? (
              <>
                {card.photoUrls.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {card.photoUrls.map((url) => (
                      <button
                        key={url}
                        type="button"
                        aria-pressed={slide.imageUrl === url}
                        aria-label="이 사진으로 바꾸기"
                        disabled={saving}
                        onClick={() => save({ slides: [{ order, imageUrl: url }] })}
                        className={`h-20 w-20 overflow-hidden rounded-md border-2 disabled:opacity-60 ${
                          slide.imageUrl === url ? "border-berry" : "border-line hover:border-berry"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- Storage 주소는 next/image 대상이 아니다 */}
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-caption text-sub">
                    아직 올린 사진이 없어요. 아래에서 올리면 여기서 고를 수 있어요.
                  </p>
                )}
                <CardPhotoUploader
                  cardId={cardId}
                  photoUrls={card.photoUrls}
                  maxPhotos={MAX_PHOTOS_PER_CARD}
                  getToken={async () => {
                    const user = userRef.current;
                    if (!user) throw new Error("로그인이 필요해요.");
                    return user.getIdToken();
                  }}
                  onChange={(urls) =>
                    setCard((prev) => (prev ? { ...prev, photoUrls: urls } : prev))
                  }
                />
              </>
            ) : (
              <p className="text-caption text-sub">
                이 레이아웃은 사진을 쓰지 않아요. 「레이아웃」에서 사진이 있는 것을 고르면 여기서
                사진을 넣을 수 있어요.
              </p>
            )}
          </>
        )}

        {tab === "layout" && slide && (
          <>
            {freeMode ? (
              <p className="text-caption text-sub">
                자유롭게 옮기는 중이라 레이아웃을 고를 수 없어요. 위에서 「레이아웃으로
                되돌리기」를 누르면 다시 고를 수 있어요.
              </p>
            ) : (
              <>
                <div role="radiogroup" aria-label="레이아웃" className="flex flex-wrap gap-2">
                  {layoutOptionsFor({ ...slide, texts: textDraft }).map((o) => {
                    const active = o.id === slide.layoutId;
                    const blocked = o.disabledReason !== null;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={blocked || saving}
                        title={o.disabledReason ?? undefined}
                        onClick={() => selectLayout(o.id)}
                        className={`rounded-pill border px-3 py-2 text-caption font-semibold ${
                          active
                            ? "border-berry bg-berry-light text-berry-dark"
                            : blocked
                              ? "cursor-not-allowed border-line bg-surface-muted text-sub opacity-60"
                              : "border-line bg-surface text-sub hover:text-ink"
                        }`}
                      >
                        {o.label}
                        {blocked && <span className="ml-1 font-normal">· {o.disabledReason}</span>}
                      </button>
                    );
                  })}
                </div>
                <p className="text-caption text-sub">
                  지금은 「{LAYOUT_LABELS[slide.layoutId]}」예요. 바꾸면 문구가 새 자리로 옮겨져요.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function NavButton({
  disabled,
  onClick,
  label,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-md text-sub hover:bg-surface-muted disabled:opacity-40"
    >
      {children}
    </button>
  );
}
