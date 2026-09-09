import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getPlanningAI } from "@/lib/ai";
import { verifyRequest } from "@/lib/server/request-auth";
import { planningGate } from "@/lib/server/ops";
import { ndjson } from "@/lib/server/ndjson";
import { parseTargeting, parsePromo } from "@/lib/plan/targeting";
import type { PlanDraft, PlanMessage, Targeting, Promo } from "@/types";

/**
 * POST /api/plans/[planId]/drafts/[index]/refine — ⑤ 기획안 하나를 대화로 다듬는다 (09-02).
 *
 * body: { message: string }         — 대화로 고친다 (AI 호출 · NDJSON)
 *     | { apply: {...} }            — 고른 후보·장수를 그대로 넣는다 (**AI 호출 없음** · JSON)
 *
 * `apply`를 여기 둔 이유 — 기획안을 고쳐 쓰는 자리가 **한 곳이어야** 한다.
 * 후보 적용을 따로 만들면 대화로 고친 값과 눌러서 고친 값이 다른 길로 저장되고,
 * 둘이 어긋나는 날이 온다.
 *
 * **건너뛸 수 있는 단계다.** 대상을 셋 고르면 다듬기도 세 번이라, 매번 강제하면
 * 그 자리가 곧 이탈 구간이 된다. 이 API를 한 번도 부르지 않아도 카드는 만들어진다 —
 * 그때는 ③에서 만든 기획안이 그대로 쓰인다.
 *
 * 고칠 수 있는 것은 넷: **세부 내용 · 카드 장수 · 제목 · 기획의도.**
 * 말투와 피할 표현은 여기서 다루지 않는다 — 그건 기획 하나가 아니라 계정 전체의
 * 성격이라 설정에 있다. AI가 그렇게 안내하도록 프롬프트에 적어뒀다.
 *
 * 주고받은 말은 `plan.messages`에 그대로 쌓는다. 「지난 기획」에서 계속 읽힌다.
 */

/**
 * 이 기획안에 대해 주고받은 말만 골라낸다.
 *
 * `plan.messages`는 기획 전체의 대화라 다른 기획안 이야기가 섞여 있다. 그대로 넘기면
 * ①번 기획안을 다듬는데 ②번 이야기가 맥락으로 들어가서 엉뚱한 데를 고친다.
 * 그래서 저장할 때 머리에 표시를 달아두고(`[n번]`), 읽을 때 그것으로 가른다.
 */
function historyFor(messages: PlanMessage[], index: number) {
  const tag = markerFor(index);
  return messages
    .filter((m) => m.role !== "system" && m.text.startsWith(tag))
    .map((m) => ({
      role: m.role as "user" | "assistant",
      text: m.text.slice(tag.length),
    }));
}

/** 템플릿 한 벌이 6장이고 표지가 고정이라 그 밖은 만들 수 없다 */
const MIN_SLIDES = 4;
const MAX_SLIDES = 7;

type ApplyPatch = {
  patch: Partial<Pick<PlanDraft, "title" | "shortTitle" | "intent" | "slideCount">>;
  /** 대화 기록에 남길 «사용자가 한 일». 눌러서 고쳐도 기록은 남아야 한다 */
  said: string;
  reply: string;
};

/**
 * 눌러서 고친 값을 받는다. **모르는 필드는 버린다** — 클라이언트가 보낸 것을 그대로
 * 기획안에 펼치면 `chosen`이나 `audience`까지 바뀔 수 있다.
 */
function parseApply(raw: unknown): ApplyPatch | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const patch: ApplyPatch["patch"] = {};
  const done: string[] = [];

  if (typeof v.title === "string" && v.title.trim()) {
    patch.title = v.title.trim();
    if (typeof v.shortTitle === "string" && v.shortTitle.trim()) {
      patch.shortTitle = v.shortTitle.trim().slice(0, 12);
    }
    if (typeof v.intent === "string" && v.intent.trim()) patch.intent = v.intent.trim();
    done.push(typeof v.angle === "string" && v.angle ? `${v.angle}로 바꾸기` : "다른 각도로 바꾸기");
  }

  if (v.slideCount !== undefined) {
    const n = Number(v.slideCount);
    // 범위 밖은 조용히 깎지 않고 통째로 무시한다 — 화면이 4~7만 보여주므로 여기 올 일이 없다
    if (Number.isInteger(n) && n >= MIN_SLIDES && n <= MAX_SLIDES) {
      patch.slideCount = n;
      done.push(`${n}장으로`);
    }
  }

  if (Object.keys(patch).length === 0) return null;
  return {
    patch,
    said: done.join(" · "),
    reply: "그렇게 바꿨어요. 더 고칠 게 있으면 말씀해주세요.",
  };
}

/** 홍보 대상을 받는다 (09-03). 아는 필드만. 빈 문자열은 «지움» */
/** 대화 기록에서 이 기획안 것을 가려내는 표시. 화면은 이걸 떼고 그린다 */
function markerFor(index: number): string {
  return `[기획안${index + 1}] `;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ planId: string; index: string }> },
) {
  const gate = await planningGate(); // 긴급 스위치 (백오피스 기획 §2-⑤)
  if (gate) return gate;
  const session = await verifyRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { planId, index: rawIndex } = await params;
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "기획안 번호가 잘못됐어요." }, { status: 400 });
  }

  let message = "";
  let apply: ApplyPatch | null = null;
  let targeting: Targeting | undefined;
  let promo: Promo | undefined;
  try {
    const body = await request.json();
    message = typeof body?.message === "string" ? body.message.trim() : "";
    apply = parseApply(body?.apply);
    targeting = parseTargeting(body?.targeting);
    promo = parsePromo(body?.promo);
  } catch {
    return NextResponse.json({ error: "요청 형식이 잘못됐어요." }, { status: 400 });
  }
  if (!message && !apply && !targeting && !promo) {
    return NextResponse.json({ error: "무엇을 고칠지 적어주세요." }, { status: 400 });
  }

  const planRef = adminDb.doc(`plans/${planId}`);
  const planSnap = await planRef.get();
  if (!planSnap.exists || planSnap.get("userId") !== session.uid) {
    return NextResponse.json({ error: "기획을 찾을 수 없습니다." }, { status: 404 });
  }
  if (planSnap.get("status") === "confirmed") {
    return NextResponse.json(
      { error: "이미 카드가 만들어진 기획이에요. 카드 상세에서 고쳐주세요." },
      { status: 409 },
    );
  }

  const drafts: PlanDraft[] = planSnap.get("drafts") ?? [];
  const draft = drafts[index];
  if (!draft) {
    return NextResponse.json({ error: "기획안을 찾을 수 없어요." }, { status: 404 });
  }

  const marker0 = markerFor(index);

  /*
    세분화 대상만 바꾼 경우 (09-03) — **AI를 부르지 않는다.** 저장만 하면 된다.
    다음에 다듬기 대화를 하거나 제작할 때 이 값이 프롬프트에 실린다.
  */
  if ((targeting || promo) && !message && !apply) {
    const nextDraft: PlanDraft = {
      ...draft,
      ...(targeting ? { targeting: { ...draft.targeting, ...targeting } } : {}),
      ...(promo ? { promo: { ...draft.promo, ...promo } } : {}),
    };
    const nextDrafts = drafts.map((d, i) => (i === index ? nextDraft : d));
    await planRef.update({ drafts: nextDrafts });
    return NextResponse.json({ draft: nextDraft, index, targetingOnly: true });
  }

  /*
    후보·장수를 눌러서 고른 경우 — **AI를 부르지 않는다.** 이미 정해진 값을 넣는 일이라
    다시 생각할 것이 없다. 여기서 굳이 AI를 태우면 2~4초가 그냥 대기 시간이 된다.
  */
  if (apply) {
    const stored0: PlanMessage[] = planSnap.get("messages") ?? [];
    const next: PlanDraft = { ...draft, ...apply.patch };
    const nextDrafts = drafts.map((d, i) => (i === index ? next : d));
    const now0 = Timestamp.now();

    await planRef.update({
      drafts: nextDrafts,
      messages: [
        ...stored0,
        { role: "user", text: `${marker0}${apply.said}`, createdAt: now0 },
        { role: "assistant", text: `${marker0}${apply.reply}`, createdAt: now0 },
      ],
    });

    return NextResponse.json({ reply: apply.reply, said: apply.said, draft: next, index });
  }

  const topic: string = planSnap.get("topic") ?? "";
  const stored: PlanMessage[] = planSnap.get("messages") ?? [];
  const { ai, isMock } = getPlanningAI();
  const marker = markerFor(index);

  return ndjson(async (emit) => {
    const result = await ai.refineDraft(
      {
        topic,
        draft: {
          audience: draft.audience,
          title: draft.title,
          shortTitle: draft.shortTitle,
          intent: draft.intent,
          extraNote: draft.extraNote,
          slideCount: draft.slideCount,
          targeting: { ...draft.targeting, ...targeting },
        },
        history: historyFor(stored, index),
        message,
      },
      emit,
    );

    const next: PlanDraft = {
      ...draft,
      ...result.draft,
      ...(targeting ? { targeting: { ...draft.targeting, ...targeting } } : {}),
      ...(promo ? { promo: { ...draft.promo, ...promo } } : {}),
    };
    // 배열 통째로 쓴다 — Firestore는 배열 한 칸만 고치지 못한다
    const nextDrafts = drafts.map((d, i) => (i === index ? next : d));
    const now = Timestamp.now();

    await planRef.update({
      drafts: nextDrafts,
      messages: [
        ...stored,
        { role: "user", text: `${marker}${message}`, createdAt: now },
        { role: "assistant", text: `${marker}${result.reply}`, createdAt: now },
      ],
    });

    return { reply: result.reply, draft: next, index, isMock };
  }, `plans/drafts/${index}/refine`);
}
