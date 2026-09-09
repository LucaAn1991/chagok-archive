import "server-only";

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

/**
 * 일일 지표 스냅샷 `metrics_daily/{YYYY-MM-DD}` (백오피스 기획 §2-④ · 지표 체계 §5).
 *
 * 왜 미리 집계하나 — 잔고 같은 «시점 상태»는 그날 찍지 않으면 재구성이 안 되고,
 * 사용자 수 세기는 문서를 훑어야 해서 화면마다 계산하면 낭비다.
 *
 * 실행 경로 둘:
 *   ① /api/cron/daily — 매일 아침 스케줄러가 부른다 (정시 스냅샷)
 *   ② ensureDailyMetrics() — 추이 API가 부른다: 빠진 날짜를 발견하면 채운다.
 *      크론이 죽어도 그래프가 끊기지 않는 안전망. 뒤늦게 채운 날은
 *      `backfilled: true`로 표시된다 — 잔고류는 계산 시점 기준이라 근사값이다.
 */

export type DailyMetrics = {
  date: string;
  signups: number;
  /** 그날 온보딩을 완료한 사용자 수 — 가입 추이와 비교하면 완주율이 보인다 */
  onboarded: number;
  confirmedPlans: number;
  published: number;
  /** 그날 기준 향후 7일에 예정 카드를 보유한 사용자 수 (대표 선행지표) */
  calendarBalance: number;
  /** 그날 만들어진 카드 중 폴백 장이 있는 카드 수 */
  fallbackCards: number;
  backfilled: boolean;
};

function kstDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
}
function kstDayStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+09:00`);
}
function addDays(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function countBetween(collection: string, field: string, from: Date, to: Date) {
  return (
    await adminDb
      .collection(collection)
      .where(field, ">=", Timestamp.fromDate(from))
      .where(field, "<", Timestamp.fromDate(to))
      .count()
      .get()
  ).data().count;
}

/** 하루치 계산 — dateKey는 KST 날짜 */
export async function computeMetricsForDate(
  dateKey: string,
  backfilled: boolean,
): Promise<DailyMetrics> {
  const start = kstDayStart(dateKey);
  const end = kstDayStart(addDays(dateKey, 1));

  const [signups, onboarded, confirmedPlans, published, balanceSnap, daysCards] = await Promise.all([
    countBetween("users", "createdAt", start, end),
    countBetween("users", "onboardedAt", start, end),
    countBetween("plans", "confirmedAt", start, end),
    countBetween("cards", "publishedAt", start, end),
    // 잔고 — scheduledDate는 'YYYY-MM-DD' 문자열이라 키 비교로 조회
    adminDb
      .collection("cards")
      .where("scheduledDate", ">=", dateKey)
      .where("scheduledDate", "<=", addDays(dateKey, 6))
      .select("userId", "status")
      .get(),
    // 그날 만든 카드의 폴백 여부 — 범위 필드가 둘이면 쿼리가 안 되므로 메모리에서 거른다
    adminDb
      .collection("cards")
      .where("createdAt", ">=", Timestamp.fromDate(start))
      .where("createdAt", "<", Timestamp.fromDate(end))
      .select("fallbackCount")
      .get(),
  ]);

  const holders = new Set<string>();
  for (const doc of balanceSnap.docs) {
    const v = doc.data();
    if (v.status !== "discarded" && v.status !== "published") holders.add(v.userId as string);
  }
  const fallbackCards = daysCards.docs.filter(
    (d) => ((d.data().fallbackCount as number) ?? 0) > 0,
  ).length;

  return {
    date: dateKey,
    signups,
    onboarded,
    confirmedPlans,
    published,
    calendarBalance: holders.size,
    fallbackCards,
    backfilled,
  };
}

/** dateKey 하루를 계산해 저장. 이미 있으면 건너뛴다(멱등) */
export async function snapshotDate(dateKey: string, backfilled: boolean): Promise<boolean> {
  const ref = adminDb.collection("metrics_daily").doc(dateKey);
  const existing = await ref.get();
  // 필드가 나중에 추가되면(예: onboarded 09-09) 옛 문서는 그 값이 없다 — 다시 계산해 채운다
  if (existing.exists && existing.data()?.onboarded !== undefined) return false;
  const metrics = await computeMetricsForDate(dateKey, backfilled);
  await ref.set({ ...metrics, computedAt: new Date().toISOString() });
  return true;
}

/**
 * 어제까지 빠진 날짜를 채운다 (최대 최근 30일). 새로 채운 날짜 수를 돌려준다.
 * 서비스 초기라 하루치 계산이 가볍다 — 커지면 크론 전용으로 좁힌다.
 */
export async function ensureDailyMetrics(): Promise<number> {
  const yesterday = kstDateKey(new Date(Date.now() - 86400000));
  let filled = 0;
  for (let i = 29; i >= 0; i--) {
    const key = addDays(yesterday, -i);
    if (await snapshotDate(key, i > 0)) filled++;
  }
  return filled;
}

/** 추이 그래프용 — 최근 n일 (빠진 날은 먼저 채운다) */
export async function getTrend(days = 30): Promise<DailyMetrics[]> {
  await ensureDailyMetrics();
  const from = addDays(kstDateKey(new Date()), -days);
  const snap = await adminDb
    .collection("metrics_daily")
    .where("date", ">=", from)
    .orderBy("date", "asc")
    .get();
  return snap.docs.map((d) => d.data() as DailyMetrics);
}
