import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import { imageGenGate } from "@/lib/server/ops";
import { canBuildFromTemplate, photosForSheet } from "@/lib/imagegen/build-sheets";
import { generateSheet } from "@/lib/imagegen";
import { storeSlideImage } from "@/lib/imagegen/store";
import type { Card, User } from "@/types";

/**
 * POST /api/cards/[cardId]/slides/[order]/regenerate — **이 장만** 다시 만든다 (09-02).
 *
 * **09-03 — 곧바로 덮어쓰지 않는다.** 새 그림을 «미리보기»(candidate) 경로에 두고
 * 주소만 돌려준다. 옛 그림은 그대로 남는다. 사용자가 둘을 나란히 보고 고른 뒤에야
 * 확정한다 (`POST .../regenerate/apply`). 우리가 «더 나아졌다»고 판단해 덮지 않는다.
 *
 * **자동 재시도를 없애고 이 자리를 만들었다.** 그림 생성은 장마다 결과가 달라
 * 실패하는데, 실측에서 한 장이 세 번 다 같은 이유로 실패하며 7분과 세 장 값을 썼다.
 * 될 것은 대개 첫 판에 되고 안 될 것은 몇 번을 해도 안 된다.
 *
 * 그래서 실패한 장은 **렌더러로 채워 먼저 보여주고**, 다시 만들지는 결과를 본
 * 사용자가 정한다. 「AI가 먼저 정하고 사용자는 확인·수정」(DESIGN.md §1).
 *
 * 같은 템플릿 장(`sheetIndex`)과 같은 문구(`sheetLines`)로 돌아간다 —
 * 문구를 다시 짓지 않으므로 나머지 장과 흐름이 어긋나지 않는다.
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/cards/[cardId]/slides/[order]/regenerate">,
) {
  const gate = await imageGenGate(); // 긴급 스위치 (백오피스 기획 §2-⑤)
  if (gate) return gate;
  const uid = await getUidFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const { cardId, order } = await ctx.params;
  const index = Number(order);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "슬라이드 번호가 잘못됐어요." }, { status: 400 });
  }

  /*
    수정 문구·자유 지시를 받는다 (09-03). 둘 다 없으면 «있는 그대로 다시 만들기»다 —
    옛 흐름과 같다. body가 없어도(예전 클라이언트) 동작한다.
  */
  let editedLines: string[] | null = null;
  let userRequest = "";
  let newPhotoUrl = ""; // 사용자가 이 장에 새로 넣을 사진 (09-03)
  try {
    const body = await req.json();
    if (Array.isArray(body?.lines)) {
      editedLines = body.lines.map((l: unknown) => (typeof l === "string" ? l : ""));
    }
    if (typeof body?.request === "string") userRequest = body.request.trim().slice(0, 300);
    if (typeof body?.photoUrl === "string") newPhotoUrl = body.photoUrl.trim();
  } catch {
    // body 없는 요청 허용
  }

  const cardRef = adminDb.collection("cards").doc(cardId);
  const cardSnap = await cardRef.get();
  const card = cardSnap.data() as Card | undefined;
  if (!card || card.userId !== uid) {
    return NextResponse.json({ error: "카드를 찾을 수 없어요." }, { status: 404 });
  }

  const slide = card.slides?.find((s) => s.order === index);
  if (!slide) {
    return NextResponse.json({ error: "슬라이드를 찾을 수 없어요." }, { status: 404 });
  }

  if (!canBuildFromTemplate(card.styleId)) {
    return NextResponse.json(
      { error: "이 카드는 시안 템플릿으로 만드는 방식이 아니에요." },
      { status: 409 },
    );
  }

  /*
    시안 정보가 없으면 다시 만들 수 없다. 렌더러로만 만들어진 옛 카드가 여기 해당한다 —
    문구를 새로 지어 넣을 수도 있지만, 그러면 나머지 장과 흐름이 어긋난다.
  */
  const sheetIndex = slide.sheetIndex;
  const stored = slide.sheetLines;
  if (typeof sheetIndex !== "number" || !Array.isArray(stored) || stored.length === 0) {
    return NextResponse.json(
      { error: "이 장은 다시 만들 정보가 없어요. 카드를 통째로 다시 만들어주세요." },
      { status: 409 },
    );
  }

  /*
    수정한 문구를 쓴다 (09-03). **자리 수는 시안이 정하므로 바꾸지 못한다** —
    빈 줄을 없애거나 새 줄을 늘리면 슬롯과 어긋난다. 길이가 같을 때만 갈아끼우고,
    빈 값이 오면 원래 줄로 되돌린다(칸을 통째로 비우면 «자리표시가 남았다»로 실패한다).
  */
  const lines =
    editedLines && editedLines.length === stored.length
      ? editedLines.map((l, i) => (l.trim() ? l : stored[i]))
      : stored;

  const userSnap = await adminDb.collection("users").doc(uid).get();
  const user = userSnap.data() as User | undefined;

  try {
    const made = await generateSheet({
      styleId: card.styleId,
      index: sheetIndex,
      lines,
      /*
        **처음 만들 때와 같은 사진을 준다** (09-02). 배정이 순서로 정해지므로
        여기서도 같은 규칙을 써야 다시 만든 장만 딴 사진이 되지 않는다.
      */
      /*
        사진을 정한다 (09-03).

        ① 사용자가 이 장에 **새 사진을 올렸으면** 그것만 쓴다 — 바꾸려고 올린 것이다.
        ② 아니면 처음 만들 때 넣었던 그 사진(`sheetPhotoUrls`)을 그대로 쓴다 — 배정을
           다시 돌리지 않으려고 만들 때 적어둔 값이다.
        ③ 기록이 없는 옛 카드는 순서대로 돌려 배정한다.
      */
      photos: newPhotoUrl
        ? await loadUserPhotos([newPhotoUrl])
        : slide.sheetPhotoUrls?.length
          ? await loadUserPhotos(slide.sheetPhotoUrls)
          : photosForSheet(
              await loadUserPhotos([
                ...(card.photoUrls ?? []),
                ...(card.stockPhotos ?? []).map((p) => p.imageUrl),
              ]),
              index,
            ),
      accent: user?.brand?.accent ?? null,
      userRequest: userRequest || undefined,
      // 검사를 끈다 (09-03) — 결과는 사용자가 비교해서 고른다. 미리 버리지 않는다
      verify: false,
    });

    if (!made.ok) {
      /*
        **그림 생성 자체가 실패했다** (09-03). 검사를 껐으므로 여기 오는 건 «검사 반려»가
        아니라 모델·네트워크 실패다. 보여줄 그림이 없으니 카드는 그대로 두고 알린다.
      */
      return NextResponse.json(
        {
          ok: false,
          error: "그림을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
          reason: made.reason,
        },
        { status: 200 },
      );
    }

    /*
      **미리보기 경로에 둔다** (09-03). 확정본을 덮지 않으므로 옛 그림이 그대로 있다.
      카드 문서(`slides`)도 **건드리지 않는다** — 사용자가 고른 뒤 apply에서 바꾼다.
      다만 다시 만들 때 쓴 문구는 apply가 알아야 하니 함께 돌려준다.
    */
    const stored = await storeSlideImage({ cardId, order: index, png: made.png, variant: "candidate" });
    if (!stored.ok) {
      console.error(`[regenerate] 저장 실패 card=${cardId} order=${index} — ${stored.reason}`);
      return NextResponse.json(
        { ok: false, error: "만들긴 했는데 저장하지 못했어요. 잠시 후 다시 시도해주세요." },
        { status: 200 },
      );
    }

    return NextResponse.json({ ok: true, candidateUrl: stored.url, lines, photoUrl: newPhotoUrl || null });
  } catch (e) {
    console.error("[regenerate]", e);
    return NextResponse.json(
      { error: "다시 만들지 못했어요. 잠시 후 시도해주세요." },
      { status: 502 },
    );
  }
}

type LoadedPhoto = { url: string; png: Buffer };

/** 올린 사진을 내려받는다 — 주소는 생성에, 내용은 «그대로 들어갔는지» 검사에 쓴다 */
async function loadUserPhotos(urls: string[]): Promise<LoadedPhoto[]> {
  const loaded: (LoadedPhoto | null)[] = await Promise.all(
    urls.slice(0, 15).map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return { url, png: Buffer.from(await res.arrayBuffer()) };
      } catch {
        return null;
      }
    }),
  );
  return loaded.filter((p): p is LoadedPhoto => p !== null);
}
