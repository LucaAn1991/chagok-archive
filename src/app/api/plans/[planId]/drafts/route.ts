import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getPlanningAI } from "@/lib/ai";
import { AUDIENCES, AUDIENCE_DEFAULT, MAX_CARDS_PER_RUN } from "@/lib/audiences";
import { verifyRequest } from "@/lib/server/request-auth";
import { parseTargeting } from "@/lib/plan/targeting";
import type { PlanDraft, Promo, Targeting } from "@/types";

/**
 * 대상별 기획안 — ③ 만들기 · ④ 고르기 (09-02).
 *
 * **원래도 만들고 있던 값을 화면으로 꺼낸 것이다.** 예전에는 「이대로 카드 만들기」를
 * 누르는 순간 confirm이 대상마다 `generateCard()`를 돌려 곧바로 카드로 저장했다 —
 * 사용자는 자기가 뭘 받게 될지 **보지 못한 채** 결과를 받았다.
 *
 * 이제 여기서 미리 만들어 보여주고, 고른 것만 카드가 된다.
 * confirm은 AI를 다시 부르지 않으므로 「이대로 카드 만들기」가 그만큼 빨라진다.
 */

/** 기획안을 다시 만들면 지금까지 고른 것·다듬은 것이 사라진다 — 그래서 한 번만 만든다 */
async function loadPlan(planId: string, uid: string) {
  const ref = adminDb.doc(`plans/${planId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get("userId") !== uid) return null;
  return { ref, snap };
}

/**
 * POST — ③ 대상마다 기획안 하나씩 만든다.
 *
 * 이미 만들어져 있으면 **다시 만들지 않고 그대로 돌려준다**(멱등). 새로고침이나
 * [다시 보내기]로 두 번 들어와도 사용자가 골라둔 것이 날아가지 않는다.
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
    const found = await loadPlan(planId, session.uid);
    if (!found) {
      return NextResponse.json({ error: "기획을 찾을 수 없습니다." }, { status: 404 });
    }
    const { ref, snap } = found;

    if (snap.get("status") === "confirmed") {
      return NextResponse.json(
        { error: "이미 카드가 만들어진 기획이에요." },
        { status: 409 },
      );
    }

    const existing: PlanDraft[] = snap.get("drafts") ?? [];
    if (existing.length > 0) {
      return NextResponse.json({ drafts: existing, already: true });
    }

    const topic: string = snap.get("topic") ?? "";
    if (!topic) {
      return NextResponse.json(
        { error: "주제가 아직 정해지지 않았어요." },
        { status: 400 },
      );
    }

    // 미선택이면 기본 대상 하나로 진행한다 (08-28 — AUDIENCE_DEFAULT)
    const stored: string[] = snap.get("audiences") ?? [];
    const fallback =
      AUDIENCES.find((a) => a.id === AUDIENCE_DEFAULT)?.label ?? AUDIENCES[0].label;
    const audiences = stored.length > 0 ? stored : [fallback];
    const capped = audiences.length > MAX_CARDS_PER_RUN;
    const targets = audiences.slice(0, MAX_CARDS_PER_RUN);

    const { ai, isMock } = getPlanningAI();
    const purposes: string[] = snap.get("purposes") ?? [];
    const intent: string = snap.get("intent") ?? "";

    // ② 단계에서 받아둔 세부 대상·홍보 대상 (09-03) — 기획안 생성 프롬프트에 먹인다.
    // 예전에는 다듬기(⑤)에서 받아 정작 생성에는 못 썼다. 없으면(undefined) 그대로 흐른다.
    // 09-04: 연령·성별이 복수가 됐다. 09-03에 저장된 문서엔 문자열 하나가 들어 있어
    // 여기서 한 번 정규화한다 — 그래야 옛 기획의 대상이 배열을 기대하는 쪽에서 안 샌다.
    const targeting: Targeting | undefined = parseTargeting(snap.get("targeting"));
    const promo: Promo | undefined = snap.get("promo") ?? undefined;

    // **대상 하나당 독립 호출** — 지시가 정반대인 대상을 한 프롬프트에 섞지 않는다 (08-28)
    const made = await Promise.all(
      targets.map((audience) =>
        ai.generateCard({ topic, audience, purposes, intent, targeting }),
      ),
    );

    /*
      **처음에는 전부 골라둔다** (chosen: true). 지금까지의 흐름이 「대상을 고르면
      그만큼 카드가 나온다」였는데, 여기서 아무것도 안 골라두면 ④가 «다시 고르는 일»이
      되어 같은 선택을 두 번 하게 된다. 빼고 싶은 것만 끄게 한다.
    */
    const drafts: PlanDraft[] = made.map((d) => ({
      audience: d.audience,
      title: d.title,
      shortTitle: d.shortTitle,
      intent: d.intent,
      extraNote: "",
      slideCount: null,
      chosen: true,
      // 기획 전체 값을 각 기획안에 복사한다 (09-03) — 다듬기·제작이 draft만 보고도 동작하게.
      // 비어 있으면 넣지 않는다(빈 객체를 Firestore에 쌓지 않는다).
      ...(targeting && Object.keys(targeting).length > 0 ? { targeting } : {}),
      ...(promo && Object.keys(promo).length > 0 ? { promo } : {}),
    }));

    await ref.update({ drafts });

    return NextResponse.json({ drafts, capped, isMock });
  } catch (e) {
    console.error("[plans/drafts]", e);
    return NextResponse.json(
      { error: "기획안을 만들지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}

/**
 * PATCH — ④ 어느 기획안을 만들지 고른다.
 *
 * body: { chosen: number[] } — 고른 기획안의 순번
 *
 * **하나는 남겨야 한다.** 전부 끄면 만들 카드가 없는데, 그 상태로 ⑤⑥⑦을 지나
 * 마지막에야 «만들 게 없어요»를 만나면 헛걸음이 된다. 여기서 막는다.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const session = await verifyRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { planId } = await params;

  let chosen: number[];
  try {
    const body = await request.json();
    chosen = Array.isArray(body?.chosen) ? body.chosen.filter(Number.isInteger) : [];
  } catch {
    return NextResponse.json({ error: "요청 형식이 잘못됐어요." }, { status: 400 });
  }

  if (chosen.length === 0) {
    return NextResponse.json(
      { error: "적어도 하나는 골라주세요." },
      { status: 400 },
    );
  }

  try {
    const found = await loadPlan(planId, session.uid);
    if (!found) {
      return NextResponse.json({ error: "기획을 찾을 수 없습니다." }, { status: 404 });
    }
    const { ref, snap } = found;

    if (snap.get("status") === "confirmed") {
      return NextResponse.json(
        { error: "이미 카드가 만들어진 기획이에요." },
        { status: 409 },
      );
    }

    const drafts: PlanDraft[] = snap.get("drafts") ?? [];
    if (drafts.length === 0) {
      return NextResponse.json({ error: "기획안이 아직 없어요." }, { status: 400 });
    }

    const picked = new Set(chosen);
    const next = drafts.map((d, i) => ({ ...d, chosen: picked.has(i) }));
    if (!next.some((d) => d.chosen)) {
      return NextResponse.json({ error: "적어도 하나는 골라주세요." }, { status: 400 });
    }

    await ref.update({ drafts: next, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ drafts: next });
  } catch (e) {
    console.error("[plans/drafts PATCH]", e);
    return NextResponse.json(
      { error: "고른 내용을 저장하지 못했어요." },
      { status: 500 },
    );
  }
}
