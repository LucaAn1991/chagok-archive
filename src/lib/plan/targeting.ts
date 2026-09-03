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
  for (const k of ["ageRange", "gender", "tone", "timeOfDay"] as const) {
    const val = v[k];
    if (typeof val === "string") out[k] = val.trim().slice(0, 24) || undefined;
  }
  return out;
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
