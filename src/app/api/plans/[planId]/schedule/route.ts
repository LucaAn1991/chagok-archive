import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { verifyRequest } from "@/lib/server/request-auth";

/**
 * POST /api/plans/[planId]/schedule — 업로드 빈도에 맞춰 예정일 배정 (F4 · PLAN §6).
 *
 * @TODO: 배치 규칙 미확정 (PLAN §12 미결 6 — 요일 선호·최소 간격).
 * 임시 규칙: 내일부터 시작해 user.uploadFrequency(주당 목표)로 7일을 나눈
 * 균등 간격(최소 1일)으로 순서대로 배정한다. 같은 날에 두 장을 두지 않는다.
 * 규칙이 확정되면 이 함수만 바꾼다.
 */

/** 로컬 기준 'YYYY-MM-DD' */
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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
    const planSnap = await adminDb.doc(`plans/${planId}`).get();
    if (!planSnap.exists || planSnap.get("userId") !== session.uid) {
      return NextResponse.json({ error: "기획을 찾을 수 없습니다." }, { status: 404 });
    }
    if (planSnap.get("status") !== "confirmed") {
      return NextResponse.json(
        { error: "카드를 먼저 만든 뒤에 배치할 수 있어요." },
        { status: 409 },
      );
    }

    const userSnap = await adminDb.doc(`users/${session.uid}`).get();
    const frequency = Number(userSnap.get("uploadFrequency")) || 3;
    const intervalDays = Math.max(1, Math.round(7 / frequency));

    const cardsSnap = await adminDb
      .collection("cards")
      .where("userId", "==", session.uid)
      .where("planId", "==", planId)
      .get();

    // 생성 순서대로 배정한다 — confirm이 createdAt에 1ms 간격으로 새긴 순서를 따른다
    const cards = cardsSnap.docs.sort((a, b) => {
      const diff = a.get("createdAt").toMillis() - b.get("createdAt").toMillis();
      return diff !== 0 ? diff : a.id < b.id ? -1 : 1;
    });

    const now = Timestamp.now();
    const start = new Date();
    start.setDate(start.getDate() + 1); // 내일부터

    const batch = adminDb.batch();
    const scheduled: { id: string; scheduledDate: string }[] = [];
    cards.forEach((doc, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i * intervalDays);
      const scheduledDate = toDateKey(date);
      batch.update(doc.ref, { scheduledDate, updatedAt: now });
      scheduled.push({ id: doc.id, scheduledDate });
    });
    await batch.commit();

    return NextResponse.json({ scheduled });
  } catch {
    return NextResponse.json(
      { error: "일정을 배치하지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
