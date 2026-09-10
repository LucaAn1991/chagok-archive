import { NextResponse } from "next/server";
import { getStyleOverlay } from "@/lib/server/ops";
import { CARD_STYLES, STYLE_ORDER, isReady } from "@/lib/render/card-styles";

/**
 * 공개 템플릿 목록 (백오피스 기획 §2-① 템플릿 진열) — 진열 속성이 반영된 목록.
 * 기획 화면(plan/new)의 템플릿 고르기가 이걸 읽어서 «숨김»과 «표시 이름»이 서비스에 닿는다.
 *
 * **순서는 코드 순서 그대로 준다.** 화면이 고를 수 있는 것들을 어차피 한 번 섞기
 * 때문에(plan/new 09-02 — 앞자리 편향 방지) 여기서 정렬해봐야 살아남지 않는다.
 * 백오피스의 드래그 정렬은 관리 목록 전용이다 (§2-① v1 결정).
 *
 * 진열 속성을 못 읽으면 `getStyleOverlay`가 빈 값을 주므로 코드 정의 그대로 나간다 —
 * 운영 설정이 기획을 멈추는 장애 지점이 되면 안 된다.
 */
export async function GET() {
  const { hidden, names } = await getStyleOverlay();

  const styles = STYLE_ORDER.filter((id) => !hidden.has(id)).map((id) => ({
    id,
    label: names[id] ?? CARD_STYLES[id].label,
    ready: isReady(CARD_STYLES[id]),
  }));

  return NextResponse.json(
    { styles },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
