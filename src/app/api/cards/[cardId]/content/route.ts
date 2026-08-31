import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import type { Card, Caption, Slide, ThemeId } from "@/types";
import { THEMES } from "@/lib/render/themes";
import { IMAGE_LAYOUTS, LAYOUT_SLOTS, remapTexts } from "@/lib/slide-layout";
import type { LayoutId } from "@/types";

/**
 * PATCH /api/cards/[cardId]/content — 제작 결과 수정 (캡션 · 슬라이드 문구).
 *
 * caption·slides는 AI 생성 필드라 보안 규칙이 클라이언트 쓰기를 막는다.
 * «부분 수정이 기본»(PRD §5-7)을 이 라우트가 담당한다.
 *
 * 편집 범위(DESIGN.md §12)를 서버에서 강제한다 —
 * 슬라이드는 **texts(글자 내용)와 layoutId**만 바꿀 수 있고,
 * imageUrl·order는 요청에 무엇이 오든 기존 값을 유지한다.
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
    const merged = mergeSlideTexts(card.slides, body.slides);
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

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "수정할 내용이 없어요." }, { status: 400 });
  }

  updates.updatedAt = FieldValue.serverTimestamp();
  await cardSnap.ref.update(updates);

  return NextResponse.json({
    caption: (updates.caption as Caption | undefined) ?? card.caption,
    slides: (updates.slides as Slide[] | undefined) ?? card.slides,
    themeId: (updates.themeId as ThemeId | undefined) ?? card.themeId,
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

type SlideEdit = { texts?: Record<string, string>; layoutId?: LayoutId };

/**
 * 요청의 {order, texts?, layoutId?}를 기존 슬라이드에 합친다.
 * 없는 order를 지목하거나 규칙에 어긋나면 null — 전체 요청을 거부한다.
 *
 * **문구를 먼저 반영하고 그 다음 레이아웃을 옮긴다.** 순서가 중요하다 —
 * 사용자가 문구를 고치는 도중에 레이아웃을 바꾸면, 고치던 문구가 옮겨져야지
 * 저장돼 있던 옛 문구가 옮겨지면 안 된다.
 */
function mergeSlideTexts(current: Slide[], raw: unknown): Slide[] | null {
  if (!Array.isArray(raw)) return null;

  const edits = new Map<number, SlideEdit>();
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const { order, texts, layoutId } = item as Record<string, unknown>;
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

    if (edit.texts === undefined && edit.layoutId === undefined) return null;
    edits.set(order, edit);
  }

  const merged: Slide[] = [];
  for (const slide of current) {
    const edit = edits.get(slide.order);
    if (!edit) {
      merged.push(slide);
      continue;
    }

    // imageUrl·order는 건드리지 않는다 (DESIGN.md §12)
    const texts = edit.texts ?? slide.texts;

    if (edit.layoutId === undefined || edit.layoutId === slide.layoutId) {
      merged.push({ ...slide, texts });
      continue;
    }

    // 사진이 없는데 사진 레이아웃 — 회색 빈 면이 된다 (DESIGN §12 폴백 사슬)
    if (IMAGE_LAYOUTS.includes(edit.layoutId) && !slide.imageUrl) return null;

    // 문구가 갈 곳이 없으면 거부한다. 조용히 지우지 않는다
    const moved = remapTexts(slide.layoutId, edit.layoutId, texts);
    if (!moved) return null;

    merged.push({ ...slide, layoutId: edit.layoutId, texts: moved });
  }

  return merged;
}
