/**
 * 대상·예정일 표기 규칙 (08-28 확정).
 *
 * `{label}에게 · {M월 D일}` — 예) 나를 모르는 사람에게 · 12월 3일
 * label은 변형하지 않는다 («사람»을 «분»·«님»으로 바꾸지 않는다).
 * 붙일 수 있는 조사는 «에게» 하나뿐 — 화면마다 표현이 달라지면 같은 것인 줄 모른다.
 */

/** 'YYYY-MM-DD' → 'M월 D일'. 값이 없으면 «날짜 미정» */
export function formatMonthDay(dateKey: string): string {
  if (!dateKey) return "날짜 미정";
  const [, m, d] = dateKey.split("-").map(Number);
  return `${m}월 ${d}일`;
}

/** 대상 한 줄 표기 — «나를 모르는 사람에게» */
export function audienceLine(label: string): string {
  return `${label}에게`;
}

/** 대상 + 예정일 — «나를 모르는 사람에게 · 12월 3일» */
export function audienceDateLine(label: string, dateKey: string): string {
  return `${audienceLine(label)} · ${formatMonthDay(dateKey)}`;
}
