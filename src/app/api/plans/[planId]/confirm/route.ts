import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getPlanningAI } from "@/lib/ai";
import { AUDIENCES, AUDIENCE_DEFAULT, MAX_CARDS_PER_RUN } from "@/lib/audiences";
import { verifyRequest } from "@/lib/server/request-auth";

/**
 * POST /api/plans/[planId]/confirm — 기획 확정 → 카드 N장 생성 (F3 · PLAN §6).
 *
 * **원자성** — 카드 생성과 plan 확정을 한 batch로 묶는다.
 * 전부 성공하거나 전부 취소된다. 일부만 캘린더에 남는 일이 없어야 한다 (PRD §5-7 ③).
 *
 * 이미 확정된 plan이면 그대로 성공으로 응답한다(멱등) —
 * 확정 후 배치(schedule) 단계에서 실패했을 때 [다시 시도]가 안전하게 재진입한다.
 */
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
        visualType: "stock_recommended", // @TODO: 이미지 폴백 판정은 실AI 구현 시 (DESIGN §12)
        photoUrls: [], // @TODO: 기획안의 사진 선택 반영은 Storage 구성 후 (PLAN §8)
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
  } catch {
    return NextResponse.json(
      { error: "카드를 만들지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
