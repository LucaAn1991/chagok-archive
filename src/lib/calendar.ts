/**
 * 캘린더 날짜 계산 (F4 · DESIGN.md §8).
 *
 * **시간대를 타지 않는다.** `card.scheduledDate`는 'YYYY-MM-DD' 문자열이고
 * 사용자가 보는 날짜는 «현지 날짜»다. `new Date('2026-08-31')`은 UTC 자정으로 읽혀
 * 한국에서 하루 밀리므로, 문자열 ↔ 연·월·일을 직접 다룬다.
 *
 * 주 시작은 월요일이다 — `user.uploadDays`가 0=월 … 6=일 기준이라(§2-1)
 * 캘린더도 같은 축을 쓰지 않으면 요일 설정과 화면이 어긋난다.
 */

/** 'YYYY-MM-DD' — 로컬 기준. toISOString()은 UTC라 쓰지 않는다 */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export type YearMonth = { year: number; month: number }; // month: 1~12

export function currentYearMonth(): YearMonth {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const zero = month - 1 + delta;
  return { year: year + Math.floor(zero / 12), month: ((zero % 12) + 12) % 12 + 1 };
}

/** 그 달의 1일과 말일 — Firestore 범위 조회에 쓴다 */
export function monthRange({ year, month }: YearMonth): { start: string; end: string } {
  const lastDay = new Date(year, month, 0).getDate(); // month는 1-based라 0일 = 전달 말일
  const mm = String(month).padStart(2, "0");
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

export type CalendarCell = {
  key: string; // 'YYYY-MM-DD'
  day: number; // 1~31
  inMonth: boolean; // 앞뒤 달에서 채워 넣은 칸인지
};

/**
 * 월간 그리드 — 항상 7의 배수로 채운다.
 * 앞뒤를 이웃 달 날짜로 메워야 요일 열이 어긋나지 않는다.
 */
export function monthGrid({ year, month }: YearMonth): CalendarCell[] {
  const first = new Date(year, month - 1, 1);
  // getDay()는 0=일요일 → 월요일 시작으로 옮긴다
  const leading = (first.getDay() + 6) % 7;

  const cells: CalendarCell[] = [];
  const cursor = new Date(year, month - 1, 1 - leading);

  // 6주(42칸)면 어떤 달이든 덮는다. 마지막 주가 통째로 다음 달이면 잘라낸다
  for (let i = 0; i < 42; i++) {
    cells.push({
      key: toDateKey(cursor),
      day: cursor.getDate(),
      inMonth: cursor.getMonth() === month - 1,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const lastWeek = cells.slice(35);
  return lastWeek.every((c) => !c.inMonth) ? cells.slice(0, 35) : cells;
}

export const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

/** 「9.2 (수)」 — 목록에서 쓰는 짧은 표기 */
export function formatDateLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const weekday = WEEKDAY_LABELS[(new Date(y, m - 1, d).getDay() + 6) % 7];
  return `${m}.${d} (${weekday})`;
}
