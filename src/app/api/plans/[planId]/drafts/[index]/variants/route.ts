import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getPlanningAI } from "@/lib/ai";
import { verifyRequest } from "@/lib/server/request-auth";
import type { PlanDraft } from "@/types";

/**
 * POST /api/plans/[planId]/drafts/[index]/variants — ⑤ 다듬기 후보 (09-02).
 *
 * **빈 입력창만 주지 않으려고 만들었다.** ③에서 기획안을 차려주고 ⑤에서만 빈칸을 주면
 * 앞뒤가 안 맞는다 — 사용자는 무엇을 고칠 수 있는지 모른 채 커서만 본다
 * (DESIGN.md §1 「빈칸을 주지 않는다」 · IA 2.1 「열린 질문 금지」).
 *
 * 같은 주제·같은 대상을 **다른 각도로** 다시 잡은 것 3개를 낸다.
 *
 * **다듬기 화면을 열 때만 부른다.** 기획안 셋을 만들었다고 셋 다 후보를 뽑아두면,
 * 열어보지도 않을 것에 시간과 비용이 든다.
 *
 * 저장하지 않는다 — 고른 것만 `refine`의 `apply`로 기획안에 반영된다.
 * 여기서 저장해두면 «보여주기만 한 것»과 «정해진 것»이 섞인다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ planId: string; index: string }> },
) {
  const session = await verifyRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { planId, index: rawIndex } = await params;
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "기획안 번호가 잘못됐어요." }, { status: 400 });
  }

  try {
    const snap = await adminDb.doc(`plans/${planId}`).get();
    if (!snap.exists || snap.get("userId") !== session.uid) {
      return NextResponse.json({ error: "기획을 찾을 수 없습니다." }, { status: 404 });
    }

    const drafts: PlanDraft[] = snap.get("drafts") ?? [];
    const draft = drafts[index];
    if (!draft) {
      return NextResponse.json({ error: "기획안을 찾을 수 없어요." }, { status: 404 });
    }

    const { ai, isMock } = getPlanningAI();
    const variants = await ai.draftVariants({
      topic: snap.get("topic") ?? "",
      audience: draft.audience,
      title: draft.title,
      intent: draft.intent,
    });

    return NextResponse.json({ variants, isMock });
  } catch (e) {
    /*
      후보를 못 만들어도 **다듬기 자체는 되어야 한다.** 빈 배열로 돌려주면 화면은
      자유 입력만 남기고 계속 간다 — 후보는 거들어주는 것이지 필수 관문이 아니다.
    */
    console.error(`[plans/drafts/${rawIndex}/variants]`, e);
    return NextResponse.json({ variants: [], failed: true });
  }
}
