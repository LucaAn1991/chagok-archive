import type { Promo, Targeting } from "@/types";

/**
 * 세부 대상·홍보 대상을 요청 body에서 안전하게 꺼낸다 (09-03).
 *
 * 아는 필드만 남긴다 — 임의 키를 기획 문서에 펼치지 않는다.
 * 빈 문자열은 «지움»으로 본다(칩을 껐다는 뜻이라 undefined로 지운다).
 *
 * ②(대상 선택)와 ⑤(다듬기) 두 곳에서 같은 규칙으로 받아야 해서 여기 한 벌만 둔다.
 */
export function parseTargeting(raw: unknown): Targeting | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;
  const out: Targeting = {};
  // 여러 개 고를 수 있는 줄 (09-04)
  for (const k of ["ageRange", "gender"] as const) {
    out[k] = parseChoiceList(v[k]);
  }
  // 하나만 고르는 줄 — 말투·시간대는 여럿이면 서로 부딪혀 프롬프트가 흐려진다
  for (const k of ["tone", "timeOfDay"] as const) {
    const val = v[k];
    if (typeof val === "string") out[k] = val.trim().slice(0, 24) || undefined;
  }
  return out;
}

/**
 * 칩 여러 개를 받아 문자열 배열로 (09-04).
 *
 * **문자열 하나로 온 것도 받는다** — 09-03에 저장된 기획 문서엔 `"20대"`처럼
 * 들어 있어서, 배열만 받으면 옛 기획의 대상이 통째로 사라진다.
 * 빈 값·중복은 버린다. 다 비면 `undefined`(=«무관»)다.
 */
export function parseChoiceList(raw: unknown): string[] | undefined {
  const list = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const value = item.trim().slice(0, 24);
    if (value && !out.includes(value)) out.push(value);
  }
  return out.length ? out : undefined;
}

export function parsePromo(raw: unknown): Promo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;
  const out: Promo = {};
  for (const k of ["brandName", "handle"] as const) {
    const val = v[k];
    if (typeof val === "string") out[k] = val.trim().slice(0, 40) || undefined;
  }
  return out;
}
