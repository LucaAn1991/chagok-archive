import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { CARD_STYLES, STYLE_ORDER, isReady, type StyleId } from "@/lib/render/card-styles";

/**
 * 공개 스타일 목록 (백오피스 기획 §2-① 템플릿 진열) — 진열 속성이 반영된 목록.
 * 기획 화면(plan/new)의 스타일 선택이 이걸 읽으면 «숨김»이 서비스에 반영된다.
 * @TODO: plan/new 연동은 창현 님 — 현재 화면은 STYLE_ORDER를 직접 읽고 순서를
 *        의도적으로 섞는다(09-02). 숨김 필터만 이 API로 가져가면 된다.
 */
export async function GET() {
  try {
    const overlay = (await adminDb.doc("ops/styles").get()).data() ?? {};
    const hidden = new Set((overlay.hidden as string[]) ?? []);
    const names = (overlay.names as Record<string, string>) ?? {};
    const saved = Array.isArray(overlay.order)
      ? (overlay.order as string[]).filter((id): id is StyleId => id in CARD_STYLES)
      : [];
    const ordered = [...saved, ...STYLE_ORDER.filter((id) => !saved.includes(id))];

    const styles = ordered.filter((id) => !hidden.has(id)).map((id) => ({
      id,
      label: names[id] ?? CARD_STYLES[id].label,
      ready: isReady(CARD_STYLES[id]),
    }));
    return NextResponse.json(
      { styles },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (e) {
    console.error("[styles]", e);
    // 진열 속성을 못 읽으면 코드 정의 그대로 — 운영 설정이 서비스를 멈추면 안 된다
    return NextResponse.json({
      styles: STYLE_ORDER.map((id) => ({
        id,
        label: CARD_STYLES[id].label,
        ready: isReady(CARD_STYLES[id]),
      })),
    });
  }
}
