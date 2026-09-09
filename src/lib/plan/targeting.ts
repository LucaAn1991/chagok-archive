import type { Promo, Targeting } from "@/types";

/**
 * 세부 대상·홍보 대상을 요청 body에서 안전하게 꺼낸다 (09-03).
 *
 * 아는 필드만 남긴다 — 임의 키를 기획 문서에 펼치지 않는다.
 *
 * **비어 있는 항목은 키를 아예 만들지 않는다 (09-09).** 예전에는 «지움»의 뜻으로
 * `undefined`를 값에 넣었는데, Firebase Admin은 `undefined` 값을 저장하지 못하고
 * 예외를 던진다. 그래서 연령·성별을 둘 다 고르지 않은 채 ②를 제출하면
 * `plans` 문서 update가 항상 실패했다(09-04 복수 선택 도입 때 들어온 회귀).
 * 지금은 다 비면 `{}`를 돌려주고, 저장하는 쪽이 「키가 없으면 안 쓴다」로 거른다.
 * (⑤ 다듬기의 «지움» 의도는 원래도 이 예외 때문에 동작한 적이 없고,
 *  09-03에 세부 대상이 ②로 옮겨 가면서 다듬기는 이 값을 보내지 않는다.)
 *
 * ②(대상 선택)와 ⑤(다듬기) 두 곳에서 같은 규칙으로 받아야 해서 여기 한 벌만 둔다.
 */
export function parseTargeting(raw: unknown): Targeting | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;
  const out: Targeting = {};
  // 여러 개 고를 수 있는 줄 (09-04)
  for (const k of ["ageRange", "gender"] as const) {
    const list = parseChoiceList(v[k]);
    if (list) out[k] = list;
  }
  // 하나만 고르는 줄 — 말투·시간대는 여럿이면 서로 부딪혀 프롬프트가 흐려진다
  for (const k of ["tone", "timeOfDay"] as const) {
    const val = v[k];
    if (typeof val !== "string") continue;
    const value = val.trim().slice(0, 24);
    if (value) out[k] = value;
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

/** 홍보 대상 — 위 `parseTargeting`과 같은 이유로 빈 항목은 키를 만들지 않는다 (09-09) */
export function parsePromo(raw: unknown): Promo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;
  const out: Promo = {};
  for (const k of ["brandName", "handle"] as const) {
    const val = v[k];
    if (typeof val !== "string") continue;
    const value = val.trim().slice(0, 40);
    if (value) out[k] = value;
  }
  return out;
}
