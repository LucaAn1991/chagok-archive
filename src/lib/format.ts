import type { CardStatus } from "@/types";

/**
 * 대상·예정일 표기 규칙 (08-28 확정).
 *
 * `{label}에게 · {M월 D일}` — 예) 나를 모르는 사람에게 · 12월 3일
 * label은 변형하지 않는다 («사람»을 «분»·«님»으로 바꾸지 않는다).
 * 붙일 수 있는 조사는 «에게» 하나뿐 — 화면마다 표현이 달라지면 같은 것인 줄 모른다.
 */

/** 'YYYY-MM-DD' 또는 Date → 'M월 D일 (월)' — 날짜 표기 통일형 (08-31) */
export function formatMonthDayWeekday(input: string | Date): string {
  const date = typeof input === "string" ? new Date(`${input}T00:00:00`) : input;
  if (Number.isNaN(date.getTime())) return "날짜 미정";
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday})`;
}

/** 대상 한 줄 표기 — «나를 모르는 사람에게» */
export function audienceLine(label: string): string {
  return `${label}에게`;
}

/**
 * 카드 CTA 라벨 — **여기 한 곳에서만 정한다** (09-08).
 *
 * `FeaturedContentCard`는 라벨을 통째로 넘겨받아 상태를 안 봤고, `TodayCardRail`은
 * 상태를 봤다. 그래서 같은 홈 안에서 **이미 만들어 둔 카드(「업로드 대기」 배지)에
 * 「제작하기」라고 적히는** 자리가 생겼다. 두 곳이 각자 판단하는 한 또 갈라진다.
 *
 * `ahead` — 오늘이 아니라 «앞으로» 올릴 카드일 때(홈 C 분기). 「미리」가 붙는다.
 */
export function cardCtaLabel(status: CardStatus, ahead = false): string {
  if (status !== "planned") return "이어서 보기"; // 만들어 뒀다 — 남은 건 올리는 일
  return ahead ? "미리 제작하기" : "제작하기";
}
