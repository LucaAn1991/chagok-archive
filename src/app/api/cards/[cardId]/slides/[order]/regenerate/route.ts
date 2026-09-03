import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { getUidFromRequest } from "@/lib/api/auth";
import { canBuildFromTemplate, photosForSheet } from "@/lib/imagegen/build-sheets";
import { generateSheet } from "@/lib/imagegen";
import { storeSlideImage } from "@/lib/imagegen/store";
import type { Card, Slide, User } from "@/types";

/**
 * POST /api/cards/[cardId]/slides/[order]/regenerate — **이 장만** 다시 만든다 (09-02).
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
  const uid = await getUidFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const { cardId, order } = await ctx.params;
  const index = Number(order);
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "슬라이드 번호가 잘못됐어요." }, { status: 400 });
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
  const lines = slide.sheetLines;
  if (typeof sheetIndex !== "number" || !Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json(
      { error: "이 장은 다시 만들 정보가 없어요. 카드를 통째로 다시 만들어주세요." },
      { status: 409 },
    );
  }

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
        **처음 만들 때 넣었던 그 사진을 그대로 쓴다** (09-02).

        배정은 클로드가 사진을 보고 정하는데(`lib/ai/photo-plan.ts`), 한 장을 다시
        만들자고 그 판단을 다시 돌릴 수는 없다. 만들 때 `sheetPhotoUrls`에 적어둔
        결과를 그대로 읽는다. 그 기록이 없는 옛 카드는 순서대로 돌려 배정한다.
      */
      photos: slide.sheetPhotoUrls?.length
        ? await loadUserPhotos(slide.sheetPhotoUrls)
        : photosForSheet(
            await loadUserPhotos([
              ...(card.photoUrls ?? []),
              ...(card.stockPhotos ?? []).map((p) => p.imageUrl),
            ]),
            index,
          ),
      accent: user?.brand?.accent ?? null,
    });

    if (!made.ok) {
      /*
        또 실패했다. **카드를 건드리지 않는다** — 지금 있는 장(렌더러로 그린 것)이
        그대로 남는다. 빈칸으로 바꿔버리면 다시 만들기를 눌렀다가 있던 것마저 잃는다.
      */
      return NextResponse.json(
        {
          ok: false,
          error: "이번에도 시안대로 나오지 않았어요. 지금 장은 그대로 두었어요.",
          reason: made.reason,
        },
        { status: 200 },
      );
    }

    const stored = await storeSlideImage({ cardId, order: index, png: made.png });
    if (!stored.ok) {
      console.error(`[regenerate] 저장 실패 card=${cardId} order=${index} — ${stored.reason}`);
      return NextResponse.json(
        { ok: false, error: "만들긴 했는데 저장하지 못했어요. 잠시 후 다시 시도해주세요." },
        { status: 200 },
      );
    }

    const next: Slide = {
      ...slide,
      origin: "generated",
      generatedUrl: stored.url,
      sheetIndex,
      sheetLines: lines,
      sheetPhotoUrls: slide.sheetPhotoUrls ?? null,
    };
    // 배열 통째로 쓴다 — Firestore는 배열 한 칸만 고치지 못한다
    const slides = card.slides.map((s) => (s.order === index ? next : s));
    await cardRef.update({ slides, updatedAt: FieldValue.serverTimestamp() });

    return NextResponse.json({ ok: true, slide: next });
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
