import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getPlanningAI } from "@/lib/ai";
import type { PlanningContext } from "@/lib/ai";
import { verifyRequest } from "@/lib/server/request-auth";
import { planningGate } from "@/lib/server/ops";
import { ndjson } from "@/lib/server/ndjson";
import { parseTargeting, parsePromo } from "@/lib/plan/targeting";
import { PLAN_INTRO_TOPIC_SUGGESTIONS } from "@/lib/plan/intro";
import { TOPIC_ACCEPTED_REPLY, audienceCandidates, topicFromText } from "@/lib/plan/topic";
import type { Promo, Targeting } from "@/types";
import { suffix로 } from "@/lib/josa";

/**
 * POST /api/plans/[planId]/messages — 대화 1턴 (PLAN §6 · F2 · IA 2.1).
 *
 * body 셋 중 하나:
 *   { text: string }       — 자유 발화·주제 후보 선택. 주제를 잡고 ② 후보를 제시한다
 *   { selection: { audiences: string[], purposes: string[] } }
 *                          — ② 멀티 선택. 빈 배열이면 AI가 알아서 정하고 넘어간다
 *   { update: { topic?, audiences?, purposes?, intent? } }
 *                          — 기획안 카드 부분 수정 (PRD §5-7 ② — 부분 수정이 기본)
 *   { resume: true }       — 이탈 후 복원. 아무것도 쓰지 않고 현재 진행 단계
 *                            (주제 후보·대상 후보·확정 가능)만 계산해 돌려준다 (08-28)
 */

type PlanUpdate = {
  topic?: string;
  audiences?: string[];
  purposes?: string[];
  intent?: string;
};

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
    : [];
}

function parseUpdate(raw: unknown): PlanUpdate | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;
  const update: PlanUpdate = {};
  if (typeof body.topic === "string" && body.topic.trim()) update.topic = body.topic.trim();
  if (typeof body.intent === "string") update.intent = body.intent.trim();
  if (Array.isArray(body.audiences)) update.audiences = parseStringArray(body.audiences);
  if (Array.isArray(body.purposes)) update.purposes = parseStringArray(body.purposes);
  return Object.keys(update).length > 0 ? update : null;
}

/** 수정 내용을 대화 히스토리에 남길 사람 말로 바꾼다 */
function updateLabel(update: PlanUpdate): string {
  const parts: string[] = [];
  if (update.topic !== undefined)
    parts.push(`주제를 「${update.topic}」${suffix로(update.topic)}`);
  if (update.audiences !== undefined) {
    const joined = update.audiences.join(" · ");
    parts.push(`대상을 ${joined}${suffix로(joined)}`);
  }
  if (update.purposes !== undefined) {
    const joined = update.purposes.join(" · ");
    parts.push(`목적을 ${joined}${suffix로(joined)}`);
  }
  if (update.intent !== undefined) parts.push("기획의도를");
  return `${parts.join(", ")} 고쳤어요.`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const gate = await planningGate(); // 긴급 스위치 (백오피스 기획 §2-⑤)
  if (gate) return gate;
  const session = await verifyRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { planId } = await params;

  let text = "";
  let selection: {
    audiences: string[];
    purposes: string[];
    targeting?: Targeting;
    promo?: Promo;
  } | null = null;
  let update: PlanUpdate | null = null;
  let resume = false;
  try {
    const body = await request.json();
    if (typeof body?.text === "string") text = body.text.trim();
    resume = body?.resume === true;
    if (body?.selection && typeof body.selection === "object") {
      selection = {
        audiences: parseStringArray(body.selection.audiences),
        purposes: parseStringArray(body.selection.purposes),
        // ② 세부 대상·홍보 대상 — 기획안 생성에 먹인다 (09-03). 전부 선택이라 비어도 됨
        targeting: parseTargeting(body.selection.targeting),
        promo: parsePromo(body.selection.promo),
      };
    }
    update = parseUpdate(body?.update);
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!text && !selection && !update && !resume) {
    return NextResponse.json({ error: "보낼 내용이 없습니다." }, { status: 400 });
  }

  try {
    const planRef = adminDb.doc(`plans/${planId}`);
    const planSnap = await planRef.get();
    // 남의 문서면 존재 자체를 알리지 않는다 — 404 (PLAN §4 「권한 없음이 따로 없다」)
    if (!planSnap.exists || planSnap.get("userId") !== session.uid) {
      return NextResponse.json({ error: "기획을 찾을 수 없습니다." }, { status: 404 });
    }
    if (planSnap.get("status") !== "draft") {
      return NextResponse.json(
        { error: "이미 확정된 기획이에요. 「이어서 기획하기」로 새 대화를 시작해주세요." },
        { status: 409 },
      );
    }

    const now = Timestamp.now();
    const { ai, isMock } = getPlanningAI();
    const topic: string = planSnap.get("topic") ?? "";

    const userSnap = await adminDb.doc(`users/${session.uid}`).get();
    const ctx: PlanningContext = {
      field: String(userSnap.get("field") ?? ""),
      tone: String(userSnap.get("tone") ?? ""),
    };

    // ── 복원(resume) — 문서를 건드리지 않고 진행 단계만 다시 계산한다 ──
    if (resume) {
      const audiences: string[] = planSnap.get("audiences") ?? [];
      const summary = {
        topic,
        audiences,
        purposes: planSnap.get("purposes") ?? [],
        intent: planSnap.get("intent") ?? "",
      };
      if (audiences.length > 0) {
        return NextResponse.json({
          reply: null, proposal: null, topicSuggestions: null,
          summary, readyToConfirm: true, isMock,
        });
      }
      if (topic) {
        // ② 단계에서 멈춤 — 대상 후보를 다시 준다 (저장된 대화는 그대로).
        // 후보는 고정 목록이라 AI를 부르지 않는다 (09-09, lib/plan/topic.ts)
        return NextResponse.json({
          reply: null, proposal: audienceCandidates(), topicSuggestions: null,
          summary, readyToConfirm: false, isMock,
        });
      }
      // ① 단계에서 멈춤 — 주제 칩을 다시 띄운다. 칩 문구는 화면에 고정돼 있어
      // AI를 부르지 않고 «① 단계» 신호(빈 배열)만 돌려준다 (09-09, lib/plan/intro.ts)
      return NextResponse.json({
        reply: null, proposal: null, topicSuggestions: PLAN_INTRO_TOPIC_SUGGESTIONS,
        summary, readyToConfirm: false, isMock,
      });
    }

    // ── 기획안 카드 부분 수정 — AI 호출 없이 반영하고 짧게 답한다 ──
    if (update) {
      const prevTopic: string = planSnap.get("topic") ?? "";
      const nextTopic = update.topic !== undefined ? topicFromText(update.topic) : prevTopic;
      const topicChanged = nextTopic !== prevTopic;
      /*
        주제가 **실제로** 바뀌면 그 주제에서 파생된 값을 무효화한다 (09-09).

        예전에는 topic만 갈아 끼우고 purposes·intent·drafts를 그대로 뒀다. 그래서
        기획안이 생긴 뒤 주제를 고치면 옛 주제로 만든 기획안·기획의도가 남아, 다듬기와
        카드 확정이 옛 산출물을 그대로 썼다(「런던베이글」로 고쳤는데 「고양이」 카드).
        사용자가 고른 대상(audiences)은 주제와 무관한 선택이라 그대로 둔다.
        기획안은 화면이 다시 만든다 — 응답의 `topicChanged`가 그 신호다.
      */
      const merged = {
        topic: nextTopic,
        audiences: update.audiences ?? planSnap.get("audiences"),
        purposes: topicChanged ? [] : (update.purposes ?? planSnap.get("purposes")),
        intent: topicChanged ? "" : (update.intent ?? planSnap.get("intent")),
      };

      // 주제만 바뀐 경우 — 흔적을 대화에 한 줄 남긴다 (08-28).
      // 과거 발화는 고치지 않고, 전/후 주제·시각이 히스토리(messages)에 그대로 남는다
      const topicOnly =
        topicChanged &&
        update.audiences === undefined && update.purposes === undefined &&
        update.intent === undefined;

      /*
       * 주제 변경은 대화가 아니라 **상태 변경 기록**이다 (08-28) —
       * 말풍선이 아닌 가운데 시스템 라인으로 그린다. 문구는 새 주제만:
       * 바꾸기 전 주제는 바로 위 말풍선에 이미 있고, 「대상은 그대로」류의
       * 부연은 칩이 눈앞에 보이므로 반복하지 않는다.
       */
      const systemEvent = topicOnly
        ? `주제를 「${nextTopic}」${suffix로(nextTopic)} 바꿨어요`
        : null;
      const reply = topicOnly ? null : "반영했어요. 기획안을 업데이트했습니다.";

      const appended = topicOnly
        ? [{ role: "system", text: systemEvent, createdAt: now }]
        : [
            { role: "user", text: updateLabel(update), createdAt: now },
            { role: "assistant", text: reply, createdAt: now },
          ];

      await planRef.update({
        ...merged,
        seriesTitle: topicChanged ? nextTopic : (planSnap.get("seriesTitle") ?? merged.topic),
        // 옛 주제로 만든 기획안(고른 표시 포함)은 비운다 — 화면이 새 주제로 다시 만든다
        ...(topicChanged ? { drafts: [] } : {}),
        messages: [...planSnap.get("messages"), ...appended],
      });
      return NextResponse.json({
        reply,
        systemEvent,
        proposal: null,
        topicSuggestions: null,
        summary: merged,
        // 단계를 앞지르지 않는다 — 대상이 정해진 뒤에만 카드 생성으로 갈 수 있다 (08-28)
        readyToConfirm: merged.audiences.length > 0,
        // 화면이 기획안·다듬기 상태를 비우고 ③을 다시 돌리는 신호 (09-09)
        topicChanged,
        isMock,
      });
    }

    /*
      아래 두 경로는 **스트리밍으로 답한다.**
      실측(08-31) 전체 응답 11초 · 첫 글자 1.2초 — 다 만들어질 때까지 기다렸다
      한 번에 보여주면 그 차이가 통째로 사용자 대기 시간이 된다 (PLAN §9 위험 3).
      Firestore 저장과 최종 payload는 지금까지와 똑같고, 앞에 글자만 흘려보낸다.
    */

    // ── ② 대상·목적 선택 — 안 고르면(빈 배열) AI가 알아서 정한다 (IA 2.1-②) ──
    if (selection && topic) {
      return ndjson(async (emit) => {
        const turn = await ai.selectionTurn(topic, selection, ctx, emit);
        const userText =
          selection.audiences.length > 0 || selection.purposes.length > 0
            ? [...selection.audiences, ...selection.purposes].join(" · ")
            : "차곡이 알아서 정해주세요.";
        const merged = {
          topic,
          audiences: turn.audiences ?? [],
          purposes: turn.purposes ?? [],
          intent: turn.intent ?? "",
        };
        await planRef.update({
          ...merged,
          // ② 세부 대상·홍보 대상을 여기 한 번 저장한다 (09-03) — 기획안 생성이 이 값을 읽는다.
          // 빈 객체면 안 쓴다(필드를 지우거나 비우지 않는다).
          ...(selection.targeting && Object.keys(selection.targeting).length > 0
            ? { targeting: selection.targeting }
            : {}),
          ...(selection.promo && Object.keys(selection.promo).length > 0
            ? { promo: selection.promo }
            : {}),
          seriesTitle: turn.seriesTitle ?? topic,
          messages: [
            ...planSnap.get("messages"),
            { role: "user", text: userText, createdAt: now },
            { role: "assistant", text: turn.reply, createdAt: now },
          ],
        });
        return {
          reply: turn.reply,
          proposal: null,
          topicSuggestions: null,
          summary: merged,
          readyToConfirm: turn.readyToConfirm ?? false,
          isMock,
        };
      }, "plans/messages 선택턴");
    }

    // ── 자유 발화 — 원문을 그대로 주제로 잡고 ② 후보를 제시한다 ──
    /*
      **AI를 부르지 않는다** (09-09 확정). 예전에는 `ideaTurn`이 온보딩 분야를 참고해
      주제를 다듬었는데, 짧게 적으면 분야로 빈칸을 메운 주제가 나왔다. 지금은 사용자가
      적은 말이 곧 주제다(`lib/plan/topic.ts`). 응답 형식(NDJSON)은 화면이 그대로
      읽도록 유지한다 — 흘려보낼 글자가 없을 뿐이다.
    */
    return ndjson(async () => {
      const nextTopic = topicFromText(text);
      const merged = {
        topic: nextTopic,
        audiences: [], // 주제가 새로 잡히면 선택은 처음부터 (IA 2.1 순서)
        purposes: [],
        intent: "",
      };
      await planRef.update({
        ...merged,
        seriesTitle: "",
        // 주제가 바뀌었으면 옛 주제의 기획안도 비운다 (update 분기와 같은 규칙)
        ...(nextTopic !== topic ? { drafts: [] } : {}),
        messages: [
          ...planSnap.get("messages"),
          { role: "user", text, createdAt: now },
          { role: "assistant", text: TOPIC_ACCEPTED_REPLY, createdAt: now },
        ],
      });
      return {
        reply: TOPIC_ACCEPTED_REPLY,
        proposal: audienceCandidates(),
        topicSuggestions: null,
        summary: merged,
        readyToConfirm: false,
        isMock,
      };
    }, "plans/messages 자유턴");
  } catch (e) {
    /*
      **원인을 반드시 남긴다** (09-02). 여기가 `catch {}`였던 탓에 AI 호출이 왜 실패했는지
      화면에도 로그에도 남지 않았다. 실제로 잔액 부족(400 invalid_request_error)으로
      전부 500이 났는데, 서버가 죽은 것처럼 보여 한참을 엉뚱한 데서 찾았다.
      사용자 문구는 그대로 두고(사정을 알릴 필요가 없다) 서버에만 적는다.
    */
    console.error("[plans/messages]", e);
    return NextResponse.json(
      { error: "응답을 만들지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
