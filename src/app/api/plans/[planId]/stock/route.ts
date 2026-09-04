import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import { toStockQuery } from "@/lib/ai/stock-query";
import { isStockConfigured, searchStockPhotos } from "@/lib/stock";
import type { Plan } from "@/types";

/**
 * GET /api/plans/[planId]/stock — 기획 단계 사진 후보 (09-01).
 *
 * 기획안 박스의 사진 그리드에 보여줄 **실제 스톡 사진**을 내려준다.
 * 이전에는 자리표시용 SVG 5장이 박혀 있었는데, 고를 수는 있지만 어디에도
 * 반영되지 않는 칩이었다. 이제 여기서 온 사진이 카드까지 그대로 간다.
 *
 * 흐름: 주제(한국어) → 영어 검색어(Claude, 노력 `low`) → Pexels 검색.
 *
 * **막히면 빈 목록을 준다.** 키가 없든 검색이 실패하든 200으로 `photos: []`다 —
 * 사진은 «있으면 쓰는» 재료라 여기서 에러를 던지면 기획 화면이 멈춘다 (DESIGN §12).
 * 화면은 빈 목록을 받으면 「내 사진」 올리기만 보여주면 된다.
 */

/**
 * 09-02 — 5장에서 12장으로 늘렸다.
 *
 * 카드뉴스가 4~7장인데 고를 수 있는 사진이 다섯이면 «마음에 드는 게 없다»가 되기 쉽고,
 * 여러 장을 고르게 바꾸면서 더 필요해졌다. 그리드는 스크롤되므로 칸은 늘어도 된다.
 */
const MAX_CANDIDATES = 12;

/** 「다른 사진 보기」로 넘어갈 수 있는 페이지 한도 — 그 뒤로는 결과가 주제에서 멀어진다 */
const MAX_PAGE = 5;

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/plans/[planId]/stock">,
) {
  const uid = await getUidFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const { planId } = await ctx.params;
  const planSnap = await adminDb.collection("plans").doc(planId).get();
  const plan = planSnap.data() as Plan | undefined;
  if (!plan || plan.userId !== uid) {
    return NextResponse.json({ error: "기획을 찾을 수 없어요." }, { status: 404 });
  }

  if (!isStockConfigured() || !plan.topic?.trim()) {
    return NextResponse.json({ photos: [] });
  }

  const query = await toStockQuery(plan.topic);
  if (!query) return NextResponse.json({ photos: [] });

  /*
    「다른 사진 보기」 (09-04) — 같은 검색어의 다음 묶음을 준다.

    **검색어를 새로 만들지 않는다.** 주제가 그대로인데 Claude를 다시 부르면
    비슷한 말이 나올 뿐이고, 사용자가 화면에서 기다리는 자리에 호출만 하나 는다.
    Pexels 쪽 페이지를 넘기는 편이 «다른 사진»이라는 목적에 곧바로 닿는다.
    범위를 넘는 값은 1로 — 손으로 주소를 고쳐도 빈손이 되지 않게.
  */
  const asked = Number(req.nextUrl.searchParams.get("page"));
  const page = Number.isInteger(asked) && asked >= 1 && asked <= MAX_PAGE ? asked : 1;

  const found = await searchStockPhotos(query, page);
  const photos = found.slice(0, MAX_CANDIDATES).map((p) => ({
    imageUrl: p.imageUrl,
    photographer: p.photographer,
    sourceUrl: p.sourceUrl,
  }));

  return NextResponse.json({ photos });
}
