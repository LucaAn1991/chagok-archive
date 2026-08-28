import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getPlanningAI } from "@/lib/ai";
import type { PlanningContext } from "@/lib/ai";
import { verifyRequest } from "@/lib/server/request-auth";

/**
 * POST /api/plans — 기획 세션 생성 (draft) + 첫 턴 (PLAN §6 · F2).
 *
 * body: { idea?: string } — 홈 「아이디어 말하기」에서 넘어온 첫 문장.
 * idea가 있으면 주제 확정 + 대상·목적 후보까지 한 번에 진행하고,
 * 없으면 AI 인사만 담아 만든다 (① 주제 확인 단계는 주제가 없을 때만 존재).
 */
export async function POST(request: Request) {
  const session = await verifyRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let idea = "";
  try {
    const body = await request.json();
    if (typeof body?.idea === "string") idea = body.idea.trim();
  } catch {
    // body 없는 요청 허용 — idea 없이 시작하는 경로
  }

  try {
    // 온보딩 값은 대화 맥락으로 쓴다 (PLAN §2-1)
    const userSnap = await adminDb.doc(`users/${session.uid}`).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "계정 정보를 찾을 수 없습니다." }, { status: 404 });
    }
    const ctx: PlanningContext = {
      field: String(userSnap.get("field") ?? ""),
      tone: String(userSnap.get("tone") ?? ""),
    };

    const { ai, isMock } = getPlanningAI();
    const turn = idea ? await ai.ideaTurn(idea, ctx) : await ai.greeting(ctx);

    const now = Timestamp.now();
    const messages = [
      ...(idea ? [{ role: "user", text: idea, createdAt: now }] : []),
      { role: "assistant", text: turn.reply, createdAt: now },
    ];

    // Plan 스키마는 PLAN §2-2 — 필드를 임의로 추가하지 않는다.
    // 대상·목적은 ② 선택 턴에서 확정된다 (IA 2.1 — 08-27 원안 복원)
    const ref = await adminDb.collection("plans").add({
      userId: session.uid,
      type: "series", // @TODO: 기록형(F12) 판정은 기록형 구현 시
      topic: turn.topic ?? "",
      audiences: [],
      purposes: [],
      intent: "",
      seriesTitle: "",
      messages,
      cardCount: 0,
      recordDays: null,
      templateVarNames: [],
      status: "draft",
      createdAt: now, // TTV 측정 시작점 (PRD §5-3)
      confirmedAt: null,
    });

    return NextResponse.json({
      planId: ref.id,
      reply: turn.reply,
      topicSuggestions: turn.topicSuggestions ?? null,
      proposal: turn.proposal ?? null,
      summary: { topic: turn.topic ?? "", audiences: [], purposes: [], intent: "" },
      readyToConfirm: false,
      isMock,
    });
  } catch {
    return NextResponse.json(
      { error: "기획을 시작하지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
