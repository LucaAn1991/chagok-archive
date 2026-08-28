import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getPlanningAI } from "@/lib/ai";
import { verifyRequest } from "@/lib/server/request-auth";

/**
 * POST /api/plans/[planId]/continue — 이어서 기획하기 (F11 · PLAN §6 · IA 2.4).
 *
 * 원 기획의 주제를 이어받아 **새 draft 세션**을 만든다. 원 세션은 건드리지 않는다.
 * @TODO: 중복 방지 — 과거 카드를 프롬프트에 몇 개까지 넣을지 미확정 (PLAN §12 미결 8).
 *        실AI 구현 시 이 라우트에서 원 plan의 카드 제목들을 컨텍스트로 넘긴다.
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
    const sourceSnap = await adminDb.doc(`plans/${planId}`).get();
    if (!sourceSnap.exists || sourceSnap.get("userId") !== session.uid) {
      return NextResponse.json({ error: "기획을 찾을 수 없습니다." }, { status: 404 });
    }

    const topic: string = sourceSnap.get("topic") ?? "";
    const { ai, isMock } = getPlanningAI();

    const userSnap = await adminDb.doc(`users/${session.uid}`).get();
    const ctx = {
      field: String(userSnap.get("field") ?? ""),
      tone: String(userSnap.get("tone") ?? ""),
    };

    // 주제를 이어받아 바로 ② 후보 제시로 간다 — ① 주제 확인은 건너뛴다
    const turn = await ai.ideaTurn(topic, ctx);
    const reply = `지난 「${topic}」 기획을 이어가볼게요.\n\n${turn.reply}`;

    const now = Timestamp.now();
    const ref = await adminDb.collection("plans").add({
      userId: session.uid,
      type: "series",
      topic: turn.topic ?? topic,
      audiences: [],
      purposes: [],
      intent: "",
      seriesTitle: "",
      messages: [{ role: "assistant", text: reply, createdAt: now }],
      cardCount: 0,
      recordDays: null,
      templateVarNames: [],
      status: "draft",
      createdAt: now,
      confirmedAt: null,
    });

    return NextResponse.json({
      planId: ref.id,
      reply,
      topicSuggestions: null,
      proposal: turn.proposal ?? null,
      summary: { topic: turn.topic ?? topic, audiences: [], purposes: [], intent: "" },
      readyToConfirm: false,
      isMock,
    });
  } catch {
    return NextResponse.json(
      { error: "기획을 이어가지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
