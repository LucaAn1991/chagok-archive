import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyRequest } from "@/lib/server/request-auth";
import { CARD_STYLES, isReady } from "@/lib/render/card-styles";
import type { StyleId } from "@/types";

/**
 * PATCH /api/plans/[planId]/style — 기획 ③단계에서 고른 비주얼 스타일을 저장한다 (09-02).
 *
 * **`/messages`를 쓰지 않고 라우트를 따로 두는 이유** — 그 경로는 patch를 받으면
 * AI를 한 번 더 부른다. 분위기 고르기는 대화가 아니라 설정이라, 색을 바꿔볼 때마다
 * 토큰을 태울 이유가 없다. 스톡 고르기(`/stock`)와 같은 결이다.
 *
 * 확정된 기획은 거절한다 — 카드가 이미 만들어진 뒤에 기획의 분위기만 바꾸면
 * 기획과 카드가 서로 다른 값을 들고 있게 된다. 그때는 「이어서 기획하기」로 간다.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const session = await verifyRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { planId } = await params;

  let body: { styleId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청을 읽지 못했어요." }, { status: 400 });
  }

  const styleId = body.styleId;

  /*
    null은 «고르지 않음»으로 되돌리는 것이라 허용한다.
    문자열이면 우리가 아는 6종 안에 있어야 하고, **그리기에 필요한 그림이 다 있어야**
    한다 — 화면에서 「준비 중」으로 막아둔 것을 주소로 직접 찔러 넣지 못하게 한다.
  */
  if (styleId !== null) {
    if (typeof styleId !== "string" || !(styleId in CARD_STYLES)) {
      return NextResponse.json({ error: "없는 분위기예요." }, { status: 400 });
    }
    if (!isReady(CARD_STYLES[styleId as StyleId])) {
      return NextResponse.json({ error: "아직 준비 중인 분위기예요." }, { status: 400 });
    }
  }

  try {
    const planRef = adminDb.doc(`plans/${planId}`);
    const planSnap = await planRef.get();
    if (!planSnap.exists || planSnap.get("userId") !== session.uid) {
      return NextResponse.json({ error: "기획을 찾을 수 없습니다." }, { status: 404 });
    }
    if (planSnap.get("status") === "confirmed") {
      return NextResponse.json(
        { error: "이미 카드가 만들어진 기획이에요." },
        { status: 409 },
      );
    }

    await planRef.update({ styleId: styleId as StyleId | null });
    return NextResponse.json({ styleId: styleId as StyleId | null });
  } catch {
    return NextResponse.json({ error: "저장하지 못했어요." }, { status: 500 });
  }
}
