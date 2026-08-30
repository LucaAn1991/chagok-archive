/**
 * 사용자가 직접 쓴 대상 — localStorage에 남겨 다음에도 칩으로 보여준다 (08-28).
 * 나중에 기본 후보(AUDIENCES)를 늘릴지 판단할 데이터가 된다.
 * 클라이언트 전용 — SSR에서는 조용히 빈 배열.
 */
const KEY = "chagok:custom-audiences";
const MAX = 10; // 칩이 화면을 덮지 않게 최근 것부터 보관

export function loadCustomAudiences(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function addCustomAudience(label: string): string[] {
  const next = [label, ...loadCustomAudiences().filter((v) => v !== label)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  return next;
}
