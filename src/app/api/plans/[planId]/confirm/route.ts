import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getPlanningAI } from "@/lib/ai";
import { AUDIENCES, AUDIENCE_DEFAULT, MAX_CARDS_PER_RUN } from "@/lib/audiences";
import { verifyRequest } from "@/lib/server/request-auth";
import { themeFromAttributes } from "@/lib/render/themes";
import type { StockPick, StyleAttributes, StyleId } from "@/types";

/**
 * POST /api/plans/[planId]/confirm — 기획 확정 → 카드 N장 생성 (F3 · PLAN §6).
 *
 * **원자성** — 카드 생성과 plan 확정을 한 batch로 묶는다.
 * 전부 성공하거나 전부 취소된다. 일부만 캘린더에 남는 일이 없어야 한다 (PRD §5-7 ③).
 *
 * 이미 확정된 plan이면 그대로 성공으로 응답한다(멱등) —
 * 확정 후 배치(schedule) 단계에서 실패했을 때 [다시 시도]가 안전하게 재진입한다.
 */
/**
 * 목록용 짧은 제목 (08-31 §5) — 사용자가 쓴 낱말을 **그대로 줄이기만** 한다.
 * 새 표현·수식어를 지어 붙이지 않는다. 끝의 요청 어미만 걷어내고 20자 어절 단위로 자른다.
 * @TODO: 실AI 연결 시 원문 낱말 유지 제약을 프롬프트로 옮긴다
 */
function shortenForList(topic: string): string {
  let t = topic.trim().replace(/\s+/g, " ");
  t = t
    .replace(
      /(을|를)?\s*(만들어\s*줘|해\s*줘|제작해\s*줘|알려\s*줘|부탁해|주세요|해주세요|만들어주세요|제안해\s*줘|제안)[.!~]*$/u,
      "",
    )
    .trim();
  if (t.length > 20) {
    let out = "";
    for (const w of t.split(" ")) {
      if ((out ? out + " " + w : w).length > 20) break;
      out = out ? out + " " + w : w;
    }
    t = out || t.slice(0, 20);
  }
  return t || topic;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const session = await verifyRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { planId } = await params;

  try {
    const planRef = adminDb.doc(`plans/${planId}`);
    const planSnap = await planRef.get();
    if (!planSnap.exists || planSnap.get("userId") !== session.uid) {
      return NextResponse.json({ error: "기획을 찾을 수 없습니다." }, { status: 404 });
    }

    // 멱등 — 이미 확정됐으면 다시 만들지 않는다
    if (planSnap.get("status") === "confirmed") {
      return NextResponse.json({ cardCount: planSnap.get("cardCount") ?? 0, capped: false, already: true });
    }

    const topic: string = planSnap.get("topic") ?? "";
    if (!topic) {
      return NextResponse.json(
        { error: "기획안이 아직 정리되지 않았어요. 주제를 먼저 정해주세요." },
        { status: 400 },
      );
    }

    // 미선택이면 기본 대상 하나로 진행한다 (08-28 — AUDIENCE_DEFAULT)
    const stored: string[] = planSnap.get("audiences") ?? [];
    const fallback =
      AUDIENCES.find((a) => a.id === AUDIENCE_DEFAULT)?.label ?? AUDIENCES[0].label;
    const audiences = stored.length > 0 ? stored : [fallback];

    // 상한을 넘으면 8장까지만 — 결과 화면이 「먼저 8장만」 안내를 띄운다
    const capped = audiences.length > MAX_CARDS_PER_RUN;
    const targets = audiences.slice(0, MAX_CARDS_PER_RUN);

    const { ai } = getPlanningAI();
    const purposes: string[] = planSnap.get("purposes") ?? [];
    const intent: string = planSnap.get("intent") ?? "";
    // **대상 하나당 독립 호출** — 지시가 정반대인 대상을 한 프롬프트에 섞지 않는다 (08-28)
    const drafts = await Promise.all(
      targets.map((audience) => ai.generateCard({ topic, audience, purposes, intent })),
    );
    if (drafts.length < 1) {
      return NextResponse.json(
        { error: "카드를 만들지 못했어요. 잠시 후 다시 시도해주세요." },
        { status: 500 },
      );
    }

    const now = Timestamp.now();
    const batch = adminDb.batch();

    /*
      기획에서 올린 사진을 카드에 물려준다 (08-31).
      **주소만 넘기고 파일은 복사하지 않는다** — 대상이 셋이면 카드도 셋인데
      같은 사진을 세 벌 둘 이유가 없다. 파일은 plans/{planId}/photos/에 한 벌뿐이다.

      visualType은 사진 유무로 정한다 (DESIGN §12 폴백 사슬). 사진이 없으면
      제작 단계에서 스톡을 찾고 그것도 없으면 글자만으로 완성되므로,
      최종 판정은 렌더 route가 그 시점에 다시 한다.
    */
    const planPhotos: string[] = planSnap.get("photoUrls") ?? [];
    // 기획 단계에서 고른 스톡 한 장 (09-01). 사진처럼 주소만 물려준다
    const planStock: StockPick | null = planSnap.get("stockPhoto") ?? null;
    /*
      기획에서 고른 분위기를 카드 전부에 그대로 물려준다 (09-02).
      한 기획에서 나온 카드가 제각각이면 시리즈로 보이지 않는다.
    */
    const planStyle: StyleId | null = planSnap.get("styleId") ?? null;
    const visualType = planPhotos.length > 0 ? "user_photo_preferred" : "stock_recommended";

    /*
      산출물 테마는 **온보딩에서 고른 취향**에서 정한다 (08-31).
      그동안 `visualPreferences`는 모으기만 하고 결과물에 닿지 않아서,
      어떤 취향을 골랐든 카드가 똑같이 나왔다.

      취향이 없으면(«잘 모르겠어요») 기본 테마로 떨어진다.
      사용자는 제작 결과 화면에서 언제든 바꿀 수 있다.
    */
    const userSnap = await adminDb.collection("users").doc(session.uid).get();
    const attributes: StyleAttributes[] = userSnap.get("visualPreferences.attributes") ?? [];
    const themeId = themeFromAttributes(attributes);

    for (const [index, draft] of drafts.entries()) {
      const cardRef = adminDb.collection("cards").doc();
      // 생성 순서를 createdAt에 1ms씩 새겨 둔다 — 배치(F4)가 이 순서대로 날짜를 준다
      const createdAt = Timestamp.fromMillis(now.toMillis() + index);
      // Card 스키마는 PLAN §2-3 — 필드를 임의로 추가하지 않는다
      batch.set(cardRef, {
        userId: session.uid,
        planId,
        title: draft.title,
        shortTitle: draft.shortTitle.slice(0, 14), // 12자 내외 — 초과분은 잘라 쓴다 (PLAN §3)
        audience: draft.audience,
        intent: draft.intent,
        scheduledDate: "", // 배치(F4·/schedule)가 부여한다
        status: "planned",
        publishIntent: null,
        themeId, // 온보딩 취향에서 정한 기본값. 제작 결과 화면에서 변경 가능 (08-31)
        visualType, // 사진 유무로 판정. 렌더 시점에 다시 확인한다 (DESIGN §12)
        photoUrls: planPhotos, // 기획 단계 사진을 그대로 물려받는다 (08-31)
        stockPhoto: planStock, // 기획 단계에서 고른 스톡 (09-01). 안 골랐으면 null
        styleId: planStyle, // 기획 단계에서 고른 분위기 (09-02). 안 골랐으면 null → themeId로 그린다
        templateId: null, // 구성은 제작 결과 화면에서 고른다. null이면 AI가 정한다
        extraNote: "",
        templateVars: {},
        caption: null,
        slides: [],
        createdAt,
        updatedAt: createdAt,
        publishedAt: null,
      });
    }

    batch.update(planRef, {
      status: "confirmed",
      cardCount: drafts.length,
      confirmedAt: now,
      seriesTitle: shortenForList(topic), // 목록용 짧은 제목 — 원문은 messages에 그대로 남는다

      messages: [
        ...planSnap.get("messages"),
        {
          role: "assistant",
          text: `${drafts.length}장의 카드를 만들었어요. 올리기 좋은 날짜에 맞춰 배치할게요.`,
          createdAt: now,
        },
      ],
    });

    await batch.commit(); // 전부 성공하거나 전부 취소

    return NextResponse.json({ cardCount: drafts.length, capped });
  } catch (e) {
    /*
      **원인을 반드시 남긴다** (09-02). 여기가 `catch {}`였던 탓에 AI 호출이 왜 실패했는지
      화면에도 로그에도 남지 않았다. 실제로 잔액 부족(400 invalid_request_error)으로
      전부 500이 났는데, 서버가 죽은 것처럼 보여 한참을 엉뚱한 데서 찾았다.
      사용자 문구는 그대로 두고(사정을 알릴 필요가 없다) 서버에만 적는다.
    */
    console.error("[plans/confirm]", e);
    return NextResponse.json(
      { error: "카드를 만들지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
