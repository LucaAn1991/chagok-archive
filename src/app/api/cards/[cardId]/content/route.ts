import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import type { Card, Caption, Slide, ThemeId } from "@/types";
import { THEMES } from "@/lib/render/themes";
import {
  IMAGE_LAYOUTS,
  LAYOUT_SLOTS,
  remapOverrides,
  remapTexts,
} from "@/lib/slide-layout";
import { parseSlotStyle } from "@/lib/slot-style";
import { clampElement } from "@/lib/free-layout";
import { isHexColor } from "@/lib/render/themes";
import type { LayoutId, SlideElement, SlotStyle } from "@/types";

/**
 * PATCH /api/cards/[cardId]/content — 제작 결과 수정 (캡션 · 슬라이드 문구).
 *
 * caption·slides는 AI 생성 필드라 보안 규칙이 클라이언트 쓰기를 막는다.
 * «부분 수정이 기본»(PRD §5-7)을 이 라우트가 담당한다.
 *
 * 편집 범위(DESIGN.md §12)를 서버에서 강제한다 —
 * 슬라이드는 **texts · layoutId · styleOverrides · imageUrl**을 바꿀 수 있고,
 * order는 요청에 무엇이 오든 기존 값을 유지한다.
 *
 * **imageUrl은 «이 카드가 가진 사진» 중에서만 받는다** (08-31). 아무 주소나
 * 허용하면 남의 Storage나 외부 이미지를 슬라이드에 심을 수 있다.
 *
 * 슬롯 조절(`styleOverrides`)도 마찬가지다 — **정해진 단계 값만** 받는다.
 * 자유값(픽셀·색상 코드)을 실어 보내는 요청은 형식 자체가 없다 (DESIGN.md §0).
 *
 * layoutId는 «6종 중 선택»이라 **화면과 같은 규칙으로 여기서 다시 판정한다**
 * (`lib/slide-layout.ts`). 화면이 막아둔 것을 믿지 않는다 —
 * 사진 없는 슬라이드에 사진 레이아웃을 넣거나, 문구가 사라지는 이동을 거부한다.
 *
 * 테마(08-31)도 같은 원칙이다 — **정해진 3종 중 하나**만 받는다.
 * 색을 직접 실어 보내는 요청은 형식 자체가 없다.
 */

type PatchBody = {
  caption?: unknown;
  slides?: unknown;
  themeId?: unknown;
  /** null이면 «계정 스타일 따르기»로 되돌린다 */
  bgOverride?: unknown;
};

const MAX_TEXT = 2000; // 필드당 글자 상한 — 문서 크기 방어
const MAX_HASHTAGS = 30;

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/cards/[cardId]/content">,
) {
  const uid = await getUidFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const { cardId } = await ctx.params;
  const cardSnap = await adminDb.collection("cards").doc(cardId).get();
  const card = cardSnap.data() as Card | undefined;
  if (!card || card.userId !== uid) {
    return NextResponse.json({ error: "카드를 찾을 수 없어요." }, { status: 404 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.caption !== undefined) {
    const caption = parseCaption(body.caption);
    if (!caption) {
      return NextResponse.json({ error: "캡션 형식이 올바르지 않아요." }, { status: 400 });
    }
    updates.caption = caption;
  }

  if (body.slides !== undefined) {
    // 이미 슬라이드에 붙어 있던 사진도 허용한다 — 그대로 두는 요청이 막히면 안 된다
    const allowedPhotos = new Set<string>([
      ...(card.photoUrls ?? []),
      ...card.slides.map((s) => s.imageUrl).filter((u): u is string => Boolean(u)),
    ]);
    const merged = mergeSlideTexts(card.slides, body.slides, allowedPhotos);
    if (!merged) {
      return NextResponse.json({ error: "슬라이드 형식이 올바르지 않아요." }, { status: 400 });
    }
    updates.slides = merged;
  }

  if (body.themeId !== undefined) {
    if (typeof body.themeId !== "string" || !(body.themeId in THEMES)) {
      return NextResponse.json({ error: "없는 테마예요." }, { status: 400 });
    }
    updates.themeId = body.themeId as ThemeId;
  }

  if (body.bgOverride !== undefined) {
    if (body.bgOverride === null) {
      updates.bgOverride = null; // 계정 스타일로 되돌리기
    } else if (isHexColor(body.bgOverride)) {
      updates.bgOverride = body.bgOverride.toUpperCase();
    } else {
      return NextResponse.json({ error: "색상 코드를 확인해주세요." }, { status: 400 });
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "수정할 내용이 없어요." }, { status: 400 });
  }

  updates.updatedAt = FieldValue.serverTimestamp();
  await cardSnap.ref.update(updates);

  return NextResponse.json({
    caption: (updates.caption as Caption | undefined) ?? card.caption,
    slides: (updates.slides as Slide[] | undefined) ?? card.slides,
    themeId: (updates.themeId as ThemeId | undefined) ?? card.themeId,
    bgOverride:
      updates.bgOverride !== undefined ? (updates.bgOverride as string | null) : card.bgOverride,
  });
}

/* ── 검증 ─────────────────────────────────────────────────── */

function isShortText(v: unknown): v is string {
  return typeof v === "string" && v.length <= MAX_TEXT;
}

function parseCaption(raw: unknown): Caption | null {
  if (typeof raw !== "object" || raw === null) return null;
  const c = raw as Record<string, unknown>;
  if (!isShortText(c.hook) || !isShortText(c.body) || !isShortText(c.cta)) return null;
  if (
    !Array.isArray(c.hashtags) ||
    c.hashtags.length > MAX_HASHTAGS ||
    !c.hashtags.every((t) => typeof t === "string" && t.length <= 100)
  ) {
    return null;
  }
  return { hook: c.hook, body: c.body, cta: c.cta, hashtags: c.hashtags };
}

type SlideEdit = {
  texts?: Record<string, string>;
  /** null이면 사진 빼기 */
  imageUrl?: string | null;
  layoutId?: LayoutId;
  styleOverrides?: Record<string, SlotStyle>;
  /** null이면 «자유 배치 끄기» — 레이아웃으로 돌아간다 */
  elements?: SlideElement[] | null;
};

/** 한 슬라이드가 가질 수 있는 요소 수 상한 — 문서 크기 방어 */
const MAX_ELEMENTS = 30;

/**
 * 자유 배치 요소 검증 (08-31 · 편집기).
 *
 * 좌표는 **0~1을 벗어나면 바로잡는다**(`clampElement`) — 화면 밖으로 나간 요소는
 * 사용자가 다시 잡을 수 없어서, 거절하기보다 끌어들이는 편이 낫다.
 * 반면 형식이 틀린 요소는 거절한다 — 그리다가 깨지는 것보다 낫다.
 */
function parseElements(raw: unknown): SlideElement[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ELEMENTS) return null;

  const out: SlideElement[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const e = item as Record<string, unknown>;

    if (typeof e.id !== "string" || !e.id || e.id.length > 40 || seen.has(e.id)) return null;
    seen.add(e.id);
    if (e.kind !== "text" && e.kind !== "image") return null;
    const nums = [e.x, e.y, e.w, e.h, e.z];
    if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;

    const base: SlideElement = clampElement({
      id: e.id,
      kind: e.kind,
      x: e.x as number,
      y: e.y as number,
      w: e.w as number,
      h: e.h as number,
      z: Math.round(e.z as number),
    });

    if (e.kind === "text") {
      if (!isShortText(e.text)) return null;
      base.text = e.text;
      if (typeof e.slot === "string" && e.slot.length <= 20) base.slot = e.slot;
      const st = parseSlotStyle(e.style);
      if (st) base.style = st;
    } else {
      base.imageUrl = typeof e.imageUrl === "string" ? e.imageUrl : null;
    }

    out.push(base);
  }
  return out;
}

/** 빈 객체는 저장하지 않는다 — Firestore에 «조절 없음»을 굳이 적을 이유가 없다 */
function withOverrides(ov: Record<string, SlotStyle> | undefined) {
  return ov && Object.keys(ov).length > 0 ? { styleOverrides: ov } : {};
}

/**
 * 요청의 {order, texts?, layoutId?}를 기존 슬라이드에 합친다.
 * 없는 order를 지목하거나 규칙에 어긋나면 null — 전체 요청을 거부한다.
 *
 * **문구를 먼저 반영하고 그 다음 레이아웃을 옮긴다.** 순서가 중요하다 —
 * 사용자가 문구를 고치는 도중에 레이아웃을 바꾸면, 고치던 문구가 옮겨져야지
 * 저장돼 있던 옛 문구가 옮겨지면 안 된다.
 */
function mergeSlideTexts(
  current: Slide[],
  raw: unknown,
  /** 이 카드가 가진 사진 주소 — 여기 없는 주소는 받지 않는다 */
  allowedPhotos: Set<string>,
): Slide[] | null {
  if (!Array.isArray(raw)) return null;

  const edits = new Map<number, SlideEdit>();
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const { order, texts, layoutId, styleOverrides, elements, imageUrl } = item as Record<
      string,
      unknown
    >;
    if (typeof order !== "number" || !current.some((s) => s.order === order)) return null;

    const edit: SlideEdit = {};

    if (texts !== undefined) {
      if (typeof texts !== "object" || texts === null) return null;
      const entries = Object.entries(texts as Record<string, unknown>);
      if (!entries.every(([, v]) => isShortText(v))) return null;
      edit.texts = Object.fromEntries(entries) as Record<string, string>;
    }

    if (layoutId !== undefined) {
      if (typeof layoutId !== "string" || !(layoutId in LAYOUT_SLOTS)) return null;
      edit.layoutId = layoutId as LayoutId;
    }

    if (styleOverrides !== undefined) {
      if (typeof styleOverrides !== "object" || styleOverrides === null) return null;
      const parsed: Record<string, SlotStyle> = {};
      for (const [slot, v] of Object.entries(styleOverrides as Record<string, unknown>)) {
        if (slot.length > 20) return null;
        const st = parseSlotStyle(v);
        // 값을 하나도 못 건진 슬롯은 «조절 해제»라 그냥 빠진다
        if (st) parsed[slot] = st;
      }
      edit.styleOverrides = parsed;
    }

    if (imageUrl !== undefined) {
      if (imageUrl === null) {
        edit.imageUrl = null;
      } else if (typeof imageUrl === "string" && allowedPhotos.has(imageUrl)) {
        edit.imageUrl = imageUrl;
      } else {
        // 이 카드에 없는 사진은 거절한다 — 남의 파일을 심는 길을 막는다
        return null;
      }
    }

    if (elements !== undefined) {
      if (elements === null) {
        edit.elements = null; // 자유 배치 끄기
      } else {
        const parsed = parseElements(elements);
        if (!parsed) return null;
        edit.elements = parsed;
      }
    }

    if (
      edit.texts === undefined &&
      edit.layoutId === undefined &&
      edit.styleOverrides === undefined &&
      edit.elements === undefined &&
      edit.imageUrl === undefined
    ) {
      return null;
    }
    edits.set(order, edit);
  }

  const merged: Slide[] = [];
  for (const slide of current) {
    const edit = edits.get(slide.order);
    if (!edit) {
      merged.push(slide);
      continue;
    }

    // order는 건드리지 않는다 (DESIGN.md §12)
    const texts = edit.texts ?? slide.texts;
    const nextImage = edit.imageUrl !== undefined ? edit.imageUrl : slide.imageUrl;
    const overrides = edit.styleOverrides ?? slide.styleOverrides;

    if (edit.layoutId === undefined || edit.layoutId === slide.layoutId) {
      // 옛 조절값·요소를 떨어내고 새 것만 붙인다 — 안 그러면 지운 것이 남는다
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { styleOverrides: _drop, elements: _drop2, ...rest } = slide;
      const nextEls = edit.elements === undefined ? slide.elements : edit.elements;
      merged.push({
        ...rest,
        texts,
        imageUrl: nextImage,
        // 사진을 뺐으면 스톡 크레딧도 함께 뗀다 — 없는 사진의 출처가 남으면 안 된다
        ...(nextImage === slide.imageUrl ? {} : { imageCredit: null }),
        ...withOverrides(overrides),
        ...(nextEls && nextEls.length > 0 ? { elements: nextEls } : {}),
      });
      continue;
    }

    /*
      레이아웃을 바꾸면 자유 배치는 버린다 (08-31).
      좌표는 «그 레이아웃 위에서» 정한 것이라 다른 레이아웃으로 옮길 근거가 없다.
      바꾼다는 건 배치를 새로 잡겠다는 뜻이기도 하다.
    */

    // 사진이 없는데 사진 레이아웃 — 회색 빈 면이 된다 (DESIGN §12 폴백 사슬)
    if (IMAGE_LAYOUTS.includes(edit.layoutId) && !nextImage) return null;

    // 문구가 갈 곳이 없으면 거부한다. 조용히 지우지 않는다
    const moved = remapTexts(slide.layoutId, edit.layoutId, texts);
    if (!moved) return null;

    // 레이아웃이 바뀌면 조절값도 새 슬롯으로 따라간다 — 안 그러면 조절이 사라진다
    const movedOv = remapOverrides(slide.layoutId, edit.layoutId, texts, overrides);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { styleOverrides: _drop, elements: _drop2, ...rest } = slide;
    merged.push({
      ...rest,
      layoutId: edit.layoutId,
      texts: moved,
      imageUrl: nextImage,
      ...(nextImage === slide.imageUrl ? {} : { imageCredit: null }),
      ...withOverrides(movedOv),
    });
  }

  return merged;
}
