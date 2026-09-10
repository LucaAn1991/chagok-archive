/**
 * 홈 — 시간대별 인사 문구 (09-01 확정 표).
 *
 * 기준 시각은 한국시간(Asia/Seoul) **고정** — 브라우저 로컬 시간이 아니다.
 * 시간대마다 문구는 하나. 랜덤·후보 없음. 어미·부호(물음표 유무 포함)를 다듬지 않는다.
 * 9구간이 빈틈없이 0~24시를 덮는다 — 어떤 시각에도 문구가 비면 안 된다.
 */

type GreetingSlot = {
  /** 시작 시(포함, KST) */
  start: number;
  /** 끝 시(제외, KST) */
  end: number;
  text: string;
};

const GREETING_SLOTS: GreetingSlot[] = [
  { start: 0, end: 5, text: "늦은 시간까지 고생 많으세요" },
  { start: 5, end: 7, text: "오늘 일찍 시작하셨네요" },
  { start: 7, end: 11, text: "좋은 아침이에요!" },
  { start: 11, end: 12, text: "곧 점심시간이에요" },
  { start: 12, end: 14, text: "맛점하셨나요?" },
  { start: 14, end: 17, text: "오후도 잘 보내고 계시죠?" },
  { start: 17, end: 19, text: "오늘 하루 고생하셨어요" },
  { start: 19, end: 22, text: "오늘 하루 어떠셨어요" },
  { start: 22, end: 24, text: "편안한 밤 보내세요" },
];

const KST_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  hourCycle: "h23",
});

function kstParts(date: Date): { year: number; month: number; day: number; hour: number } {
  const parts: Record<string, number> = {};
  for (const p of KST_PARTS.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour };
}

/** 주어진 시각의 KST 시간대 인사 — 표 밖 시각은 없다(0~24 완전 커버) */
export function greetingFor(date: Date = new Date()): string {
  const { hour } = kstParts(date);
  const slot = GREETING_SLOTS.find((s) => hour >= s.start && hour < s.end);
  return (slot ?? GREETING_SLOTS[0]).text;
}

/**
 * KST 기준 «오늘» 날짜 — 연/월/일이 KST와 일치하는 Date를 돌려준다.
 * formatMonthDayWeekday()에 그대로 넘겨 쓴다. KST 자정에 날짜가 함께 바뀐다.
 */
export function kstToday(date: Date = new Date()): Date {
  const { year, month, day } = kstParts(date);
  return new Date(year, month - 1, day);
}
