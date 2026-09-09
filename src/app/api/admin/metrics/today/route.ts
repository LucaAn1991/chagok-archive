import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";

/**
 * 대시보드 «오늘의 건강» + «즉시 조치» 실시간 집계 (백오피스 기획 §2-④).
 *
 * 오늘분은 실시간으로 계산한다 — 추이 그래프(과거)는 metrics_daily 집계(크론)가
 * 맡는다. 전부 count 집계 쿼리라 문서를 내려받지 않는다(읽기 비용 최소).
 * 비교 기준은 «최근 7일 하루 평균» — 절대값보다 편차가 이상 감지에 쓸모 있다.
 */

/** KST 기준 오늘 0시 (서버 시간대와 무관) */
function kstTodayStart(): Date {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  return new Date(`${key}T00:00:00+09:00`);
}

async function countBetween(
  collection: string,
  field: string,
  from: Date,
  to?: Date,
): Promise<number> {
  let q = adminDb.collection(collection).where(field, ">=", Timestamp.fromDate(from));
  if (to) q = q.where(field, "<", Timestamp.fromDate(to));
  return (await q.count().get()).data().count;
}

export async function GET(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  const todayStart = kstTodayStart();
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekAgo = new Date(todayStart.getTime() - 7 * 86400000);

  try {
    const [
      signupsToday,
      signupsWeek,
      onboardedToday,
      onboardedWeek,
      plansStartedToday,
      plansStartedWeek,
      confirmedToday,
      confirmedWeek,
      cardsCreatedToday,
      cardsCreatedWeek,
      publishedToday,
      publishedWeek,
      signupsYest,
      onboardedYest,
      plansStartedYest,
      confirmedYest,
      cardsCreatedYest,
      publishedYest,
      fallbackCards,
      deletionIssues,
      openInquiries,
    ] = await Promise.all([
      countBetween("users", "createdAt", todayStart),
      countBetween("users", "createdAt", weekAgo, todayStart),
      countBetween("users", "onboardedAt", todayStart),
      countBetween("users", "onboardedAt", weekAgo, todayStart),
      countBetween("plans", "createdAt", todayStart),
      countBetween("plans", "createdAt", weekAgo, todayStart),
      countBetween("plans", "confirmedAt", todayStart),
      countBetween("plans", "confirmedAt", weekAgo, todayStart),
      countBetween("cards", "createdAt", todayStart),
      countBetween("cards", "createdAt", weekAgo, todayStart),
      countBetween("cards", "publishedAt", todayStart),
      countBetween("cards", "publishedAt", weekAgo, todayStart),
      countBetween("users", "createdAt", yesterdayStart, todayStart),
      countBetween("users", "onboardedAt", yesterdayStart, todayStart),
      countBetween("plans", "createdAt", yesterdayStart, todayStart),
      countBetween("plans", "confirmedAt", yesterdayStart, todayStart),
      countBetween("cards", "createdAt", yesterdayStart, todayStart),
      countBetween("cards", "publishedAt", yesterdayStart, todayStart),
      // 폴백 장이 남아 있는 카드 — 생성 실패 큐(3단계)의 대상 수
      adminDb
        .collection("cards")
        .where("fallbackCount", ">", 0)
        .count()
        .get()
        .then((s) => s.data().count),
      // 탈퇴 잔여물 — 문서가 남아 있다 = 확인 필요 (running·partial·failed 전부)
      adminDb
        .collection("deletion_attempts")
        .count()
        .get()
        .then((s) => s.data().count),
      // 미처리 문의 (3단계 연결)
      adminDb
        .collection("inquiries")
        .where("status", "==", "open")
        .count()
        .get()
        .then((s) => s.data().count),
    ]);

    // 발행 예정 사용자(향후 7일) — 지금 이 순간의 잔고 (대표 선행지표)
    const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const in6Key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
      new Date(Date.now() + 6 * 86400000),
    );
    const balanceSnap = await adminDb
      .collection("cards")
      .where("scheduledDate", ">=", todayKey)
      .where("scheduledDate", "<=", in6Key)
      .select("userId", "status")
      .get();
    const holders = new Set<string>();
    for (const doc of balanceSnap.docs) {
      const v = doc.data();
      if (v.status !== "discarded" && v.status !== "published") holders.add(v.userId as string);
    }
    // 7일 평균은 일일 스냅샷에서 — 아직 안 쌓였으면 0(화면이 «비교 없음»으로 그린다)
    const snapDocs = await adminDb
      .collection("metrics_daily")
      .where("date", "<", todayKey)
      .orderBy("date", "desc")
      .limit(7)
      .get();
    const balances = snapDocs.docs.map((d) => (d.data().calendarBalance as number) ?? 0);
    const balanceAvg = balances.length
      ? balances.reduce((a, b) => a + b, 0) / balances.length
      : 0;
    const yesterdayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
      yesterdayStart,
    );
    const yesterdayDoc = snapDocs.docs.find((d) => d.id === yesterdayKey);
    const balanceYest = (yesterdayDoc?.data().calendarBalance as number) ?? 0;

    return NextResponse.json({
      today: {
        signups: signupsToday,
        onboarded: onboardedToday,
        plansStarted: plansStartedToday,
        confirmedPlans: confirmedToday,
        cardsCreated: cardsCreatedToday,
        published: publishedToday,
        balance: holders.size,
      },
      yesterday: {
        signups: signupsYest,
        onboarded: onboardedYest,
        plansStarted: plansStartedYest,
        confirmedPlans: confirmedYest,
        cardsCreated: cardsCreatedYest,
        published: publishedYest,
        balance: balanceYest,
      },
      weekAvg: {
        signups: signupsWeek / 7,
        onboarded: onboardedWeek / 7,
        plansStarted: plansStartedWeek / 7,
        confirmedPlans: confirmedWeek / 7,
        cardsCreated: cardsCreatedWeek / 7,
        published: publishedWeek / 7,
        balance: balanceAvg,
      },
      actions: { fallbackCards, deletionIssues, openInquiries },
    });
  } catch (e) {
    console.error("[admin/metrics/today]", e);
    return NextResponse.json({ error: "지표를 계산하지 못했어요." }, { status: 500 });
  }
}
