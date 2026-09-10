import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getPlanningAI } from "@/lib/ai";
import type { PlanTurnResult } from "@/lib/ai";
import { PLAN_INTRO_TEXT, PLAN_INTRO_TOPIC_SUGGESTIONS } from "@/lib/plan/intro";
import { TOPIC_ACCEPTED_REPLY, audienceCandidates, topicFromText } from "@/lib/plan/topic";
import { verifyRequest } from "@/lib/server/request-auth";
import { planningGate } from "@/lib/server/ops";

/**
 * POST /api/plans — 기획 세션 생성 (draft) + 첫 턴 (PLAN §6 · F2).
 *
 * body: { idea?: string } — 홈 「아이디어 말하기」에서 넘어온 첫 문장.
 * idea가 있으면 **그 원문을 그대로 주제로** 저장하고 대상 후보를 함께 돌려주며,
 * 없으면 고정 인사만 담아 만든다 (① 주제 확인 단계는 주제가 없을 때만 존재).
 * **이 라우트는 AI를 부르지 않는다** (09-09) — 주제 다듬기·인사 생성 둘 다 없앴다.
 */
export async function POST(request: Request) {
  const gate = await planningGate(); // 긴급 스위치 (백오피스 기획 §2-⑤)
  if (gate) return gate;
  const session = await verifyRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let idea = "";
  try {
    const body = await request.json();
    if (typeof body?.idea === "string") idea = body.idea.trim();
    // `freeTopic`(설정 분야 풀기, 09-02)은 더 이상 읽지 않는다 — 이 라우트가 분야를
    // 쓰지 않게 되면서(09-09) 값이 있어도 할 일이 없다. 보내는 화면도 이미 없다.
  } catch {
    // body 없는 요청 허용 — idea 없이 시작하는 경로
  }

  try {
    // 계정 확인만 한다. 온보딩 분야는 여기서 쓰지 않는다 — 주제는 사용자 원문 그대로 (09-09)
    const userSnap = await adminDb.doc(`users/${session.uid}`).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "계정 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    const { isMock } = getPlanningAI();
    /*
      **AI를 부르지 않는다** (09-09 확정).
      - 첫 인사는 고정 문구(`lib/plan/intro.ts`)를 그대로 첫 메시지로 저장한다 — 화면과
        저장 문구가 같아야 칩을 고른 뒤에도 옛 AI 인사가 되살아나지 않는다. 주제 후보도
        화면에 고정돼 있어 빈 배열만 «① 단계» 신호로 보낸다.
      - 홈에서 적어 온 idea는 **원문 그대로 주제**가 된다(`lib/plan/topic.ts`). 예전에는
        Claude가 온보딩 분야를 참고해 다듬었는데, 그게 사용자가 쓰지 않은 소재를 끌어왔다.
        대상 후보는 원래도 고정 목록이라 AI가 필요 없다.
    */
    const turn: PlanTurnResult = idea
      ? { reply: TOPIC_ACCEPTED_REPLY, topic: topicFromText(idea), proposal: audienceCandidates() }
      : { reply: PLAN_INTRO_TEXT, topicSuggestions: PLAN_INTRO_TOPIC_SUGGESTIONS };

    // idea 없는 진입 — 인사만 남은 기존 빈 draft가 있으면 재사용한다 (08-28).
    // 진입할 때마다 빈 세션 문서가 쌓이지 않게 서버가 걸러준다
    if (!idea) {
      const draftsSnap = await adminDb
        .collection("plans")
        .where("userId", "==", session.uid)
        .where("status", "==", "draft")
        .get();
      const empty = draftsSnap.docs
        .filter((d) => {
          const msgs = (d.get("messages") ?? []) as { role: string }[];
          return !d.get("topic") && msgs.every((m) => m.role !== "user");
        })
        .sort((a, b) => b.get("createdAt").toMillis() - a.get("createdAt").toMillis())[0];
      if (empty) {
        const stored = (empty.get("messages") ?? []) as { text: string }[];
        /*
          옛 빈 draft에는 AI가 쓴 인사가 첫 메시지로 남아 있다 (09-09 이전 데이터).
          사용자 발화가 하나도 없는 문서라 첫 메시지를 고정 문구로 바꿔도 잃는 것이 없고,
          바꿔야 화면(고정 문구)과 문서가 같은 첫 메시지를 갖는다.
        */
        if (stored[0]?.text !== turn.reply) {
          await empty.ref.update({
            messages: [{ role: "assistant", text: turn.reply, createdAt: Timestamp.now() }],
          });
        }
        return NextResponse.json({
          planId: empty.id,
          reply: turn.reply,
          topicSuggestions: turn.topicSuggestions ?? null,
          proposal: null,
          summary: { topic: "", audiences: [], purposes: [], intent: "" },
          readyToConfirm: false,
          isMock,
        });
      }
    }

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
      styleId: null, // ③ 단계에서 고른다 (09-02)
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
  } catch (e) {
    /*
      **원인을 반드시 남긴다** (09-02). 여기가 `catch {}`였던 탓에 AI 호출이 왜 실패했는지
      화면에도 로그에도 남지 않았다. 실제로 잔액 부족(400 invalid_request_error)으로
      전부 500이 났는데, 서버가 죽은 것처럼 보여 한참을 엉뚱한 데서 찾았다.
      사용자 문구는 그대로 두고(사정을 알릴 필요가 없다) 서버에만 적는다.
    */
    console.error("[plans]", e);
    return NextResponse.json(
      { error: "기획을 시작하지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
