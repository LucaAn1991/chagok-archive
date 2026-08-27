import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getPlanningAI } from "@/lib/ai";
import type { PlanningContext } from "@/lib/ai";
import { verifyRequest } from "@/lib/server/request-auth";

/**
 * POST /api/plans/[planId]/messages — 대화 1턴 (PLAN §6 · F2 · IA 2.1).
 *
 * body 셋 중 하나:
 *   { text: string }       — 자유 발화·주제 후보 선택. 주제를 잡고 ② 후보를 제시한다
 *   { selection: { audiences: string[], purposes: string[] } }
 *                          — ② 멀티 선택. 빈 배열이면 AI가 알아서 정하고 넘어간다
 *   { update: { topic?, audiences?, purposes?, intent? } }
 *                          — 기획안 카드 부분 수정 (PRD §5-7 ② — 부분 수정이 기본)
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
  if (update.topic !== undefined) parts.push(`주제를 「${update.topic}」(으)로`);
  if (update.audiences !== undefined) parts.push(`대상을 ${update.audiences.join(" · ")}(으)로`);
  if (update.purposes !== undefined) parts.push(`목적을 ${update.purposes.join(" · ")}(으)로`);
  if (update.intent !== undefined) parts.push("기획의도를");
  return `${parts.join(", ")} 고쳤어요.`;
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

  let text = "";
  let selection: { audiences: string[]; purposes: string[] } | null = null;
  let update: PlanUpdate | null = null;
  try {
    const body = await request.json();
    if (typeof body?.text === "string") text = body.text.trim();
    if (body?.selection && typeof body.selection === "object") {
      selection = {
        audiences: parseStringArray(body.selection.audiences),
        purposes: parseStringArray(body.selection.purposes),
      };
    }
    update = parseUpdate(body?.update);
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!text && !selection && !update) {
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

    // ── 기획안 카드 부분 수정 — AI 호출 없이 반영하고 짧게 답한다 ──
    if (update) {
      const merged = {
        topic: update.topic ?? planSnap.get("topic"),
        audiences: update.audiences ?? planSnap.get("audiences"),
        purposes: update.purposes ?? planSnap.get("purposes"),
        intent: update.intent ?? planSnap.get("intent"),
      };
      const reply = "반영했어요. 기획안을 업데이트했습니다.";
      await planRef.update({
        ...merged,
        seriesTitle: update.topic ?? planSnap.get("seriesTitle") ?? merged.topic,
        messages: [
          ...planSnap.get("messages"),
          { role: "user", text: updateLabel(update), createdAt: now },
          { role: "assistant", text: reply, createdAt: now },
        ],
      });
      return NextResponse.json({
        reply,
        proposal: null,
        topicSuggestions: null,
        summary: merged,
        readyToConfirm: true,
        isMock,
      });
    }

    // ── ② 대상·목적 선택 — 안 고르면(빈 배열) AI가 알아서 정한다 (IA 2.1-②) ──
    if (selection && topic) {
      const turn = await ai.selectionTurn(topic, selection, ctx);
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
        seriesTitle: turn.seriesTitle ?? topic,
        messages: [
          ...planSnap.get("messages"),
          { role: "user", text: userText, createdAt: now },
          { role: "assistant", text: turn.reply, createdAt: now },
        ],
      });
      return NextResponse.json({
        reply: turn.reply,
        proposal: null,
        topicSuggestions: null,
        summary: merged,
        readyToConfirm: turn.readyToConfirm ?? false,
        isMock,
      });
    }

    // ── 자유 발화·주제 후보 선택 — 주제를 (다시) 잡고 ② 후보를 제시한다 ──
    const turn = await ai.ideaTurn(text, ctx);
    const merged = {
      topic: turn.topic ?? topic,
      audiences: [], // 주제가 새로 잡히면 선택은 처음부터 (IA 2.1 순서)
      purposes: [],
      intent: "",
    };
    await planRef.update({
      ...merged,
      seriesTitle: "",
      messages: [
        ...planSnap.get("messages"),
        { role: "user", text, createdAt: now },
        { role: "assistant", text: turn.reply, createdAt: now },
      ],
    });
    return NextResponse.json({
      reply: turn.reply,
      proposal: turn.proposal ?? null,
      topicSuggestions: null,
      summary: merged,
      readyToConfirm: false,
      isMock,
    });
  } catch {
    return NextResponse.json(
      { error: "응답을 만들지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
