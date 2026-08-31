import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import { generateSlides } from "@/lib/ai/slides";
import { isClaudeConfigured } from "@/lib/ai/caption";
import { isStockConfigured } from "@/lib/stock";
import { CARD_TEMPLATES } from "@/lib/card-templates";
import type { Card, VisualType, User, TemplateId } from "@/types";

/**
 * POST /api/cards/[cardId]/render — 카드뉴스 구성 생성 (F8).
 *
 * 이미지 폴백 사슬로 visualType을 판정하고, 슬라이드 구성(레이아웃·텍스트)을
 * 생성해 저장한 뒤 status를 '업로드 대기(pending)'로 바꾼다 (08-31: crafted 단계 제거).
 * 완성 PNG는 저장하지 않는다 — slides/[order]/image 가 요청 시 렌더링한다.
 *
 * body의 `templateId`(선택)로 **구성을 지정해 다시 만들 수 있다** (08-31).
 * 결과 화면의 「다른 구성으로」가 이 경로를 쓴다. 주지 않으면 카드에 저장된
 * 템플릿을 따르고, 그것도 없으면 AI가 구성까지 정한다.
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/cards/[cardId]/render">,
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
  if (card.status === "discarded") {
    return NextResponse.json({ error: "버린 카드는 제작할 수 없어요." }, { status: 409 });
  }

  // 구성 템플릿 — 요청에 오면 그것, 없으면 카드에 저장된 것 (08-31)
  const body = (await req.json().catch(() => null)) as { templateId?: unknown } | null;
  let templateId: TemplateId | null = card.templateId ?? null;
  if (body?.templateId !== undefined && body.templateId !== null) {
    if (typeof body.templateId !== "string" || !(body.templateId in CARD_TEMPLATES)) {
      return NextResponse.json({ error: "없는 구성이에요." }, { status: 400 });
    }
    templateId = body.templateId as TemplateId;
  }

  const userSnap = await adminDb.collection("users").doc(uid).get();
  const user = userSnap.data() as User | undefined;
  if (!user) {
    return NextResponse.json({ error: "사용자 정보를 찾을 수 없어요." }, { status: 404 });
  }

  /*
    이미지 폴백 사슬 (DESIGN.md §12) — 어디서 멈춰도 완성된다.
    ① 사용자 사진 → ② 무료 스톡(Pexels, 08-31) → ③ text_only

    여기서 정하는 건 «어느 단계까지 쓸 수 있는가»다. 실제로 스톡에서 사진을 못
    찾으면 generateSlides가 그 슬라이드를 글자 레이아웃으로 내려앉힌다.
  */
  const visualType: VisualType =
    card.photoUrls.length > 0
      ? "user_photo_preferred"
      : isStockConfigured()
        ? "stock_recommended"
        : "text_only";

  try {
    const slides = await generateSlides({
      title: card.title,
      audience: card.audience,
      intent: card.intent,
      extraNote: card.extraNote,
      tone: user.tone,
      avoidExpressions: user.avoidExpressions,
      visualPreferences: user.visualPreferences ?? null, // 취향의 문구 톤 반영 (08-31)
      visualType,
      photoUrls: card.photoUrls ?? [], // 이미지 레이아웃에 순서대로 배정된다 (08-31)
      templateId, // 주면 장수·순서가 고정된다 (08-31)
    });

    await cardSnap.ref.update({
      slides,
      visualType,
      templateId,
      status: "pending",
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ slides, visualType, templateId, mock: !isClaudeConfigured() });
  } catch (e) {
    // 사용자에게는 사정을 감추되 서버에는 남긴다 — 삼켜버리면 원인을 못 찾는다
    console.error("[render]", e);
    return NextResponse.json(
      { error: "카드뉴스를 만들지 못했어요. 다시 시도해주세요." },
      { status: 502 },
    );
  }
}
