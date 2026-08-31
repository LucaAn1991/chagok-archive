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
import {
  IMAGE_LAYOUTS,
  LAYOUT_FONT_SIZE,
  LAYOUT_LABELS,
  layoutOptionsFor,
} from "@/lib/slide-layout";
import { DEFAULT_SLOT_STYLE, SIZE_SCALE } from "@/lib/slot-style";
import { bakeToElements, newTextBox } from "@/lib/free-layout";
import { Plus, Trash2 } from "lucide-react";
import { MAX_PHOTOS_PER_CARD } from "@/lib/storage/limits";
import { applyBrand, resolveTheme } from "@/lib/render/themes";
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
  const [brand, setBrand] = useState<import("@/types").Brand | null>(null);
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
  /** 미리보기에서 고른 줄의 입력칸으로 바로 커서를 옮기려고 들고 있는다 */
  const fieldRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
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

  /*
    미리보기 위에 얹을 «집을 수 있는 상자»들.

    자유 배치면 저장된 좌표를 쓰고, 레이아웃 모드면 전환용 좌표표를 그대로 쓴다
    (`bakeToElements`). 위치가 100% 정확하진 않지만 **글자를 눌러 그 줄을 고르는 데는
    충분하다** — 아래 입력칸을 찾아 누르지 않아도 된다 (08-31).
  */
  const hitBoxes = slide ? (freeMode ? (slide.elements ?? []) : bakeToElements(slide)) : [];

  /** 캔버스 색 — 렌더러와 같은 함수를 쓴다. 어긋나면 덮은 자리가 눈에 띈다 */
  const canvas = applyBrand(resolveTheme(card?.themeId), brand, card?.bgOverride);

  /**
   * 이 요소가 실제로 그려지는 글자 크기 (1080 기준 px) — 렌더러와 같은 식.
   *
   * 자유 배치는 상자 높이에서, 레이아웃 모드는 **레이아웃이 정한 기준 크기**에
   * 테마 배율을 곱해 나온다. px로 직접 넣었으면 그 값이 그대로다.
   */
  function fontSizeFor(el: (typeof hitBoxes)[number]): number {
    const o = { ...DEFAULT_SLOT_STYLE, ...(el.style ?? {}) };
    if (o.sizePx) return o.sizePx;
    if (freeMode) return Math.round(1080 * el.h * 0.42 * SIZE_SCALE[o.size]);
    const base = slide ? (LAYOUT_FONT_SIZE[slide.layoutId]?.[el.slot ?? ""] ?? 40) : 40;
    return Math.round(base * canvas.type.scale * SIZE_SCALE[o.size]);
  }

  /**
   * 미리보기에서 상자를 골랐을 때 (08-31).
   *
   * 툴바의 대상을 바꾸고, **그 줄의 입력칸으로 커서를 옮긴다.**
   * 고르기만 하고 커서가 안 가면 결국 아래로 스크롤해 다시 눌러야 한다.
   */
  function pickBox(id: string | null) {
    setSelectedElId(id);
    const slot = hitBoxes.find((b) => b.id === id)?.slot ?? null;
    setSelectedSlot(slot);
    if (!id) return;
    setTab("text");
    // 탭이 그려진 뒤에 커서를 옮긴다. 자유 배치는 상자 id, 레이아웃 모드는 슬롯 이름
    const key = freeMode ? id : slot;
    if (key) setTimeout(() => fieldRefs.current[key]?.focus(), 0);
  }

  /** 툴바에 보여줄 «무엇을 고쳤나» — 자유 배치는 이름이 없어 내용 앞부분을 쓴다 */
  const toolbarLabel = freeMode
    ? selectedElId
      ? (slide?.elements?.find((e) => e.id === selectedElId)?.text?.trim().slice(0, 10) ||
        "빈 상자")
      : null
    : selectedSlot
      ? (SLOT_LABELS[selectedSlot] ?? selectedSlot)
      : null;

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
        // 그 자리 편집이 옛 글자를 덮으려면 캔버스 색을 화면도 알아야 한다
        getDoc(doc(db, "users", user.uid))
          .then((u) => setBrand((u.data() as { brand?: import("@/types").Brand })?.brand ?? null))
          .catch(() => setBrand(null));
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
      const fresh = data.slides.find((s) => s.order === order);
      if (fresh?.elements) {
      }
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

  /** 상자 목록을 저장하고 다시 그린다 */
  function saveBoxes(next: SlideElement[]) {
    void save({ slides: [{ order, elements: next }] });
  }

  function addBox() {
    if (!slide?.elements) return;
    const box = newTextBox(slide.elements);
    setSelectedElId(box.id);
    saveBoxes([...slide.elements, box]);
  }

  function removeBox(id: string) {
    if (!slide?.elements) return;
    const next = slide.elements.filter((e) => e.id !== id);

    /*
      마지막 상자까지 지우면 서버가 `elements`를 떼어내 **레이아웃으로 돌아간다**
      (빈 슬라이드를 남기지 않는다). 모르고 지우면 배치가 통째로 사라진 것처럼
      보이므로 미리 알린다.
    */
    if (next.length === 0 && !window.confirm("마지막 상자예요. 지우면 원래 레이아웃으로 돌아가요.")) {
      return;
    }
    if (selectedElId === id) setSelectedElId(null);
    saveBoxes(next);
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

  /*
    «저장 안 됨» 상태가 없다 (08-31). 글자는 그 자리에서 고치는 즉시,
    조절은 250ms 뒤에 저장된다. 사용자가 눌러야 하는 저장 버튼이 없다.
  */

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
  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink fallbackHref={`/card/${cardId}/result`}>제작 결과</BackLink>
        <span className="text-caption text-sub">
          {saving ? "저장 중···" : savedAt ? "저장됐어요" : ""}
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
          slotLabel={toolbarLabel}
          value={
            freeMode
              ? slide?.elements?.find((e) => e.id === selectedElId)?.style
              : selectedSlot
                ? styleDraft[selectedSlot]
                : undefined
          }
          availableFontIds={fontIds}
          currentSizePx={(() => {
            const box = hitBoxes.find((b) =>
              freeMode ? b.id === selectedElId : b.slot === selectedSlot,
            );
            return box ? fontSizeFor(box) : undefined;
          })()}
          disabled={saving}
          onChange={(next) => {
            /*
              자유 배치에서는 «고른 상자»에, 레이아웃 모드에서는 «고른 줄»에 건다.
              자유 배치엔 슬롯이 없다 — 상자가 곧 대상이다.
            */
            if (freeMode) {
              if (!selectedElId || !slide?.elements) return;
              saveBoxes(
                slide.elements.map((e) => (e.id === selectedElId ? { ...e, style: next } : e)),
              );
              return;
            }
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
        <SlideEditor
          imageUrl={imageUrl}
          elements={hitBoxes}
          selectedId={selectedElId}
          onSelect={pickBox}
          disabled={saving}
          mode={freeMode ? "edit" : "select"}
          bg={canvas.color.bg}
          ink={canvas.color.ink}
          tracking={canvas.type.tracking}
          family={brand?.fontId ?? "pretendard"}
          fontSizeFor={fontSizeFor}
          onEditText={(id, text) => {
            /*
              그 자리에서 고친 글을 저장한다 (08-31).
              자유 배치면 그 상자의 글이고, 레이아웃 모드면 그 상자가 가리키는 슬롯의 글이다.
            */
            if (freeMode) {
              if (!slide?.elements) return;
              saveBoxes(slide.elements.map((e) => (e.id === id ? { ...e, text } : e)));
              return;
            }
            const slot = hitBoxes.find((b) => b.id === id)?.slot;
            if (!slot) return;
            const nextTexts = { ...textDraft, [slot]: text };
            setTextDraft(nextTexts);
            void save({ slides: [{ order, texts: nextTexts, styleOverrides: styleDraft }] });
          }}
          onCommit={(next) => save({ slides: [{ order, elements: next }] })}
        />
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
          <span className="text-caption text-sub">
            글자를 두 번 누르면 그 자리에서 고쳐요
            {freeMode ? " · 끌어서 옮기고 모서리 점으로 크기 조절" : ""}
          </span>
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
        {/*
          자유 배치에서는 «제목·부제»가 아니라 **텍스트 상자 목록**이다 (08-31).
          좌표를 가진 상자를 슬롯 이름으로 부르는 게 안 맞고, 상자를 더하거나
          지울 수 있어야 자유 배치라는 말이 성립한다.
        */}
        {/*
          글자는 **미리보기에서 두 번 눌러 그 자리에서** 고친다 (08-31).
          아래에 입력칸을 또 두면 같은 글이 두 곳에 있어 어느 쪽이 진짜인지 헷갈린다.
          여기는 «상자를 더하고 지우는» 곳이다.
        */}
        {tab === "text" && slide && freeMode && (
          <>
            <button
              type="button"
              onClick={addBox}
              disabled={saving}
              className="flex h-11 items-center gap-1 self-start rounded-md border-2 border-berry bg-surface px-4 text-body font-semibold text-berry disabled:opacity-60"
            >
              <Plus size={16} aria-hidden />
              텍스트 상자 추가
            </button>

            {(slide.elements ?? [])
              .filter((e) => e.kind === "text")
              .map((e, i) => {
                const active = selectedElId === e.id;
                return (
                  <div
                    key={e.id}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
                      active ? "border-berry bg-berry-light" : "border-line bg-surface"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedElId(e.id)}
                      className="flex-1 truncate text-left text-body text-ink"
                    >
                      <span className="mr-2 text-caption text-sub">{i + 1}</span>
                      {e.text?.trim() || "(빈 상자)"}
                    </button>
                    <button
                      type="button"
                      aria-label={`텍스트 상자 ${i + 1} 지우기`}
                      disabled={saving}
                      onClick={() => removeBox(e.id)}
                      className="flex size-9 items-center justify-center rounded-md text-sub hover:bg-surface-muted disabled:opacity-60"
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                );
              })}

            <p className="text-caption text-sub">
              글자는 위 미리보기에서 두 번 눌러 고쳐요. 여기서는 상자를 더하거나 지워요.
            </p>
          </>
        )}

        {tab === "text" && slide && !freeMode && (
          <>
            <p className="text-caption text-sub">
              위 미리보기에서 글자를 두 번 누르면 그 자리에서 고칠 수 있어요.
            </p>
            <div className="flex flex-col gap-2">
              {Object.entries(textDraft).map(([key, value]) => {
                const active = selectedSlot === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedSlot(key);
                      setSelectedElId(hitBoxes.find((b) => b.slot === key)?.id ?? null);
                    }}
                    className={`truncate rounded-md border px-3 py-2 text-left text-body ${
                      active ? "border-berry bg-berry-light text-berry-dark" : "border-line bg-surface text-ink"
                    }`}
                  >
                    <span className="mr-2 text-caption text-sub">{SLOT_LABELS[key] ?? key}</span>
                    {value.trim() || "(비어 있음)"}
                  </button>
                );
              })}
            </div>
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
