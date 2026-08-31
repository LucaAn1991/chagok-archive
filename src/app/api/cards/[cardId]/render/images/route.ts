import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import { generateImage, isImageGenConfigured } from "@/lib/imagegen";
import { saveServerImage } from "@/lib/storage/photos";
import { DOWNGRADE, IMAGE_LAYOUTS, LAYOUT_SLOTS } from "@/lib/slide-layout";
import type { Card, Slide } from "@/types";

/**
 * POST /api/cards/[cardId]/render/images — 비워둔 이미지 자리를 채운다 (08-31 F15, 2단계).
 *
 * **왜 두 번에 나눠 부르는가** — AI 이미지 생성이 장당 25~40초다(실측).
 * 한 번에 하면 사용자가 그동안 skeleton만 본다. 그래서 `POST .../render`는
 * 글자가 든 슬라이드를 곧바로 돌려주고(이미지 자리는 비운 채), 이 경로가
 * 뒤이어 사진을 채운다. 「차곡차곡 쌓임」과 같은 방향이다 (DESIGN.md §10).
 *
 * **여러 번 불러도 안전하다.** 채울 자리가 없으면 아무것도 하지 않고 돌아간다.
 * 생성에 실패한 자리는 글자 레이아웃으로 내려앉혀 **카드를 완결시킨다** —
 * 회색 빈 면을 남기면 「어디서 멈춰도 완성된다」(DESIGN.md §12)가 깨진다.
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/cards/[cardId]/render/images">,
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

  // 비어 있는 이미지 자리 — 레이아웃은 이미지용인데 사진이 없는 슬라이드
  const pending = card.slides.filter(
    (s) => IMAGE_LAYOUTS.includes(s.layoutId) && !s.imageUrl,
  );
  if (pending.length === 0) {
    return NextResponse.json({ slides: card.slides, filled: 0 });
  }

  // 키가 사라졌으면 기다리게 두지 않고 바로 글자 쪽으로 내려앉힌다
  if (!isImageGenConfigured()) {
    const slides = card.slides.map((s) => (pending.includes(s) ? downgrade(s) : s));
    await cardSnap.ref.update({ slides, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ slides, filled: 0 });
  }

  /*
    자리들을 한꺼번에 부른다. 순서대로 부르면 두 장에 60초가 되는데
    동시에 부르면 30초에 끝난다 (08-31 실측: 2장 동시 29.5초).
  */
  const made = await Promise.all(
    pending.map((s) => generateImage(promptFor(s, card))),
  );
  const stored = await Promise.all(
    made.map((img) =>
      img ? saveServerImage("cards", cardId, img.bytes, img.contentType) : null,
    ),
  );

  const urlByOrder = new Map<number, string>();
  pending.forEach((s, i) => {
    const url = stored[i];
    if (url) urlByOrder.set(s.order, url);
  });

  const slides: Slide[] = card.slides.map((s) => {
    if (!pending.includes(s)) return s;
    const url = urlByOrder.get(s.order);
    // 못 만들었으면 글자 쪽으로 — 회색 빈 면으로 두지 않는다
    return url ? { ...s, imageUrl: url, imageOrigin: "ai" as const } : downgrade(s);
  });

  await cardSnap.ref.update({ slides, updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ slides, filled: urlByOrder.size });
}

/** 이미지 레이아웃 → 같은 뜻의 글자 레이아웃. 새 레이아웃이 안 읽는 슬롯은 버린다 */
function downgrade(slide: Slide): Slide {
  const layoutId = DOWNGRADE[slide.layoutId] ?? slide.layoutId;
  const allowed = LAYOUT_SLOTS[layoutId];
  const texts: Record<string, string> = {};
  for (const [k, v] of Object.entries(slide.texts)) {
    if (allowed.includes(k)) texts[k] = v;
  }
  return { ...slide, layoutId, texts, imageUrl: null, imageCredit: null };
}

/**
 * 이 슬라이드에 어울릴 사진의 생성 프롬프트.
 *
 * 1단계에서 AI가 낸 영어 검색어(`slide.imageQuery`)를 그대로 쓴다 — 이 자리에
 * 어울리는 장면을 이미 그때 판단해뒀다. 없으면(옛 슬라이드) 대상·기획의도로
 * 대신한다. **한국어 제목은 쓰지 않는다** — 생성 품질이 눈에 띄게 떨어진다.
 */
function promptFor(slide: Slide, card: Card): string {
  const subject =
    slide.imageQuery?.trim() ||
    [card.audience, card.intent].filter(Boolean).join(", ") ||
    card.title;
  return [
    `Realistic photograph related to: ${subject}.`,
    "Natural lighting, candid lifestyle photography, shallow depth of field.",
    "Square 1:1 composition with empty space for text overlay.",
    "No text, no letters, no watermark, no logo, no collage, no illustration.",
  ].join(" ");
}
