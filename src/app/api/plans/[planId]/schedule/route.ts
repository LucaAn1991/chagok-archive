import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { verifyRequest } from "@/lib/server/request-auth";

/**
 * POST /api/plans/[planId]/schedule — 업로드 요일에 맞춰 예정일 배정 (F4 · PLAN §6).
 *
 * 규칙 (09-04 확정 — «내일부터 균등 간격» 임시 규칙 폐기):
 * - `user.uploadDays`(0=월 … 6=일)의 요일에만 놓는다. 값이 없으면 [0, 3](월·목) — 홈과 같은 기본값.
 * - 기획한 날(KST 오늘)부터 훑는다 — 오늘이 업로드 요일이고 비어 있으면 오늘이 첫 자리다.
 * - 이미 카드가 있는 날짜는 건너뛴다(버림 제외). 같은 배치 안에서도 하루 한 장.
 * - 홈의 자동 이월(`nextPublishDates`)과 같은 규칙이어야 한다 — 배치와 이월이 다른 요일을
 *   말하면 캘린더가 거짓말이 된다. 규칙을 고치면 두 곳을 함께 고칠 것.
 *
 * 날짜는 전부 KST 기준으로 계산한다 — 서버(App Hosting)는 UTC라 `new Date()`의
 * «오늘»이 한국 새벽에는 어제가 된다.
 */

/** KST 기준 오늘 'YYYY-MM-DD' */
function kstTodayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

/** 'YYYY-MM-DD' → 요일 (0=월 … 6=일). 날짜 문자열 자체의 요일이라 시간대와 무관하다 */
function weekdayMonFirst(dateKey: string): number {
  return (new Date(`${dateKey}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** 'YYYY-MM-DD'에 n일 더하기 */
function addDays(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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
    const rawDays = userSnap.get("uploadDays");
    const uploadDays: number[] =
      Array.isArray(rawDays) && rawDays.length > 0
        ? rawDays.filter((d: unknown): d is number => typeof d === "number" && d >= 0 && d <= 6)
        : [0, 3];

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

    const todayKey = kstTodayKey();

    // 이미 카드가 있는 날짜 — 오늘 이후 · 버림 제외. 배치가 그 날들을 건너뛴다
    const takenSnap = await adminDb
      .collection("cards")
      .where("userId", "==", session.uid)
      .where("scheduledDate", ">=", todayKey)
      .get();
    const taken = new Set(
      takenSnap.docs
        .filter((d) => d.get("status") !== "discarded")
        .map((d) => d.get("scheduledDate") as string),
    );

    const now = Timestamp.now();
    const batch = adminDb.batch();
    const scheduled: { id: string; scheduledDate: string }[] = [];
    let cursor = todayKey; // 오늘부터 — 오늘이 업로드 요일이고 비어 있으면 오늘이 첫 자리
    for (const doc of cards) {
      // 안전장치: 1년 안에 자리를 못 찾으면(요일 설정이 깨진 경우) 그날 그대로 놓는다
      for (let hop = 0; hop < 370; hop++) {
        if (uploadDays.includes(weekdayMonFirst(cursor)) && !taken.has(cursor)) break;
        cursor = addDays(cursor, 1);
      }
      batch.update(doc.ref, { scheduledDate: cursor, updatedAt: now });
      scheduled.push({ id: doc.id, scheduledDate: cursor });
      taken.add(cursor);
      cursor = addDays(cursor, 1);
    }
    await batch.commit();

    return NextResponse.json({ scheduled });
  } catch {
    return NextResponse.json(
      { error: "일정을 배치하지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
