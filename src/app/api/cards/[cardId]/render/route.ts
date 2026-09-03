import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import { generateSlides } from "@/lib/ai/slides";
import { isClaudeConfigured } from "@/lib/ai/caption";
import { isStockConfigured } from "@/lib/stock";
import { CARD_TEMPLATES } from "@/lib/card-templates";
import { buildFromTemplate, canBuildFromTemplate } from "@/lib/imagegen/build-sheets";
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
      : // 기획에서 고른 스톡은 이미 손에 있다 — 검색 키가 없어도 그 한 장은 쓸 수 있다 (09-01)
        isStockConfigured() || card.stockPhotos?.length
        ? "stock_recommended"
        : "text_only";

  try {
    /*
      **시안 템플릿으로 만들 수 있으면 그 길로 간다** (09-02).

      기획에서 분위기를 골랐고 그림 생성이 설정돼 있으면, 우리 레이아웃 대신
      시안 템플릿의 글자를 바꿔 완성 카드를 만든다. 실패한 장만 아래 렌더러 경로로
      물러서므로 **한 장도 빠지지 않는다.**

      장당 2분이라 이 요청은 오래 걸린다 — 화면이 기다릴 준비가 돼 있어야 한다.
    */
    if (canBuildFromTemplate(card.styleId)) {
      const styleId = card.styleId;
      /*
        **고른 추천 사진도 함께 넘긴다** (09-02).

        지금까지는 올린 사진(`photoUrls`)만 시안에 들어가고, 기획에서 고른 스톡은
        렌더러 경로에서만 쓰였다 — 사진을 골라도 시안 카드에는 안 나왔다.
        폴백 사슬 순서(DESIGN §12)대로 **올린 사진을 앞에** 두고 스톡을 뒤에 붙인다.
      */
      const photos = await loadUserPhotos([
        ...(card.photoUrls ?? []),
        ...(card.stockPhotos ?? []).map((p) => p.imageUrl),
      ]);

      /*
        **NDJSON 스트림으로 돌려준다** (09-02). 이 일은 3분쯤 걸리는데, 다 끝난 뒤에
        한 번에 응답하면 화면은 그동안 «멈춘 것»과 구분할 수 없다. 장이 하나씩
        끝날 때마다 흘려보내면 사용자가 진행을 본다.

        기획 대화가 쓰는 방식과 같다 (`lib/ai/client.ts`의 `onText`).
        연결에 계속 데이터가 흐르므로 중간 프록시가 끊을 위험도 줄어든다.
      */
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (o: unknown) =>
            controller.enqueue(encoder.encode(`${JSON.stringify(o)}\n`));

          /*
            브랜드 자리에 넣을 이름을 정한다 (09-03). 우선순위:
            ① 홍보 상품·브랜드명 → ② 인스타 계정명 → ③ 계정 닉네임(이메일 @앞).
            셋 다 없으면 빈 문자열 — 그땐 sheet-copy가 브랜드 자리를 비운다.
          */
          const brandLabel =
            card.promo?.brandName?.trim() ||
            card.promo?.handle?.trim() ||
            (user.email ?? "").split("@")[0] ||
            "";

          try {
            const built = await buildFromTemplate({
              cardId,
              styleId,
              title: card.title,
              audience: card.audience,
              intent: card.intent,
              extraNote: card.extraNote,
              tone: user.tone,
              avoidExpressions: user.avoidExpressions,
              // 올린 사진은 «그대로» 들어간다 — 다시 그리지 말라고 프롬프트가 못박는다
              photos,
              accent: user.brand?.accent ?? null,
              // 기획 ⑤에서 정한 장수. 안 정했으면 null → 템플릿이 4~7장에서 고른다 (09-02)
              slideCount: card.slideCount ?? null,
              targeting: card.targeting, // ⑤에서 좁힌 대상 (09-03)
              brandLabel, // 브랜드 자리에 넣을 이름 (09-03)
              onProgress: send,
            });

            if (built.slides.length === 0) {
              // 한 장도 못 만들었다 — 화면이 「다시 시도」를 띄운다
              send({ type: "error", error: "카드뉴스를 만들지 못했어요. 다시 시도해주세요." });
              controller.close();
              return;
            }

            await cardSnap.ref.update({
              slides: built.slides,
              visualType,
              templateId,
              status: "pending",
              updatedAt: FieldValue.serverTimestamp(),
            });

            send({
              type: "done",
              slides: built.slides,
              visualType,
              templateId,
              // 몇 장이 시안대로 나왔는지 — 화면이 「N장 중 M장」을 알릴 수 있다
              generated: built.generated,
              fallback: built.fallback,
              mock: false,
            });
          } catch (e) {
            console.error("[render:stream]", e);
            send({ type: "error", error: "카드뉴스를 만들지 못했어요. 다시 시도해주세요." });
          } finally {
            controller.close();
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          // 중간 캐시가 스트림을 모아뒀다 한 번에 주면 진행이 안 보인다
          "Cache-Control": "no-store, no-transform",
        },
      });
    }

    const slides = await generateSlides({
      cardId, // 생성 이미지를 cards/{cardId}/photos/ 아래 저장한다 (08-31 F15)
      title: card.title,
      audience: card.audience,
      intent: card.intent,
      extraNote: card.extraNote,
      tone: user.tone,
      avoidExpressions: user.avoidExpressions,
      visualPreferences: user.visualPreferences ?? null, // 취향의 문구 톤 반영 (08-31)
      visualType,
      photoUrls: card.photoUrls ?? [], // 이미지 레이아웃에 순서대로 배정된다 (08-31)
      // 기획에서 고른 스톡의 첫 장 — 렌더러는 첫 이미지 자리에 한 장만 쓴다 (09-01)
      chosenStock: card.stockPhotos?.[0] ?? null,
      templateId, // 주면 장수·순서가 고정된다 (08-31)
      styleId: card.styleId ?? null, // 분위기의 문구 규칙을 프롬프트에 얹는다 (09-02)
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

/**
 * 사용자가 올린 사진을 내려받는다 (09-02).
 *
 * 그림 생성에는 **주소**를 넘기고, 검사할 때는 **내용**이 있어야 원본과 비교할 수 있다.
 * 못 받은 사진은 조용히 빠진다 — 사진 하나 때문에 카드 제작이 멈추면 안 된다.
 *
 * 참조 이미지는 문서상 최대 16장이고 템플릿이 한 자리를 쓰므로 15장까지다.
 * 넘치면 앞에서부터 자른다 — `photoUrls` 순서가 곧 사용자가 정한 순서다.
 */
type LoadedPhoto = { url: string; png: Buffer };

async function loadUserPhotos(urls: string[]): Promise<LoadedPhoto[]> {
  const loaded: (LoadedPhoto | null)[] = await Promise.all(
    urls.slice(0, 15).map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return { url, png: Buffer.from(await res.arrayBuffer()) };
      } catch {
        return null;
      }
    }),
  );
  return loaded.filter((p): p is LoadedPhoto => p !== null);
}
