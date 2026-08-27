import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import type { Card, Caption, Slide } from "@/types";

/**
 * PATCH /api/cards/[cardId]/content — 제작 결과 수정 (캡션 · 슬라이드 문구).
 *
 * caption·slides는 AI 생성 필드라 보안 규칙이 클라이언트 쓰기를 막는다.
 * «부분 수정이 기본»(PRD §5-7)을 이 라우트가 담당한다.
 *
 * 편집 범위(DESIGN.md §12)를 서버에서 강제한다 —
 * 슬라이드는 **texts(글자 내용)만** 바꿀 수 있고, layoutId·imageUrl·order는
 * 요청에 무엇이 오든 기존 값을 유지한다.
 */

type PatchBody = {
  caption?: unknown;
  slides?: unknown;
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

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "수정할 내용이 없어요." }, { status: 400 });
  }

  updates.updatedAt = FieldValue.serverTimestamp();
  await cardSnap.ref.update(updates);

  return NextResponse.json({
    caption: (updates.caption as Caption | undefined) ?? card.caption,
    slides: (updates.slides as Slide[] | undefined) ?? card.slides,
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

/**
 * 요청의 {order, texts}를 기존 슬라이드에 «texts만» 합친다.
 * 없는 order를 지목하거나 형식이 틀리면 null — 전체 요청을 거부한다.
 */
function mergeSlideTexts(current: Slide[], raw: unknown): Slide[] | null {
  if (!Array.isArray(raw)) return null;

  const edits = new Map<number, Record<string, string>>();
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const { order, texts } = item as Record<string, unknown>;
    if (typeof order !== "number" || !current.some((s) => s.order === order)) return null;
    if (typeof texts !== "object" || texts === null) return null;
    const entries = Object.entries(texts as Record<string, unknown>);
    if (!entries.every(([, v]) => isShortText(v))) return null;
    edits.set(order, Object.fromEntries(entries) as Record<string, string>);
  }

  return current.map((slide) => {
    const texts = edits.get(slide.order);
    // layoutId·imageUrl·order는 건드리지 않는다 — 글자 내용만 (DESIGN.md §12)
    return texts ? { ...slide, texts } : slide;
  });
}
