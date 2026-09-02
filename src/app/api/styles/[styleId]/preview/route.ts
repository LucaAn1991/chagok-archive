import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { renderSlidePng } from "@/lib/render/render-slide";
import { CARD_STYLES } from "@/lib/render/card-styles";
import { TEMPLATE_SHEETS } from "@/lib/render/template-sheets";
import type { StyleId } from "@/types";

/**
 * GET /api/styles/[styleId]/preview?sheet=n — 분위기 미리보기 (09-02).
 *
 * **실제 시안 템플릿을 그대로 보여준다.** 처음에는 우리 렌더러가 그린 그림을
 * 내보냈는데, 지금은 이 템플릿의 글자만 바꿔서 결과물이 나오므로 **고를 때 본 것과
 * 받는 것이 같아야** 한다. 렌더러 그림을 보여주면 그게 어긋난다.
 *
 * `sheet`를 주면 그 장을, 안 주면 표지(첫 장)를 낸다. 고를 때는 표지만 보이고,
 * 「N장 보기」를 누르면 나머지도 볼 수 있다.
 *
 * 템플릿 파일이 없으면 **렌더러로 그려서 내보낸다** — 분위기는 있는데 시안 파일이
 * 아직 없는 경우에도 화면이 비지 않는다 (DESIGN.md §12 「어디서 멈춰도 완성된다」).
 *
 * **로그인을 요구하지 않는다.** 사용자 데이터가 없는 고정 견본이고,
 * `<img src>`는 Authorization 헤더를 실을 수 없다.
 */

const TEMPLATE_DIR = path.join(process.cwd(), "src/lib/render/templates");

/** 렌더러로 물러설 때 쓰는 견본 문구 — 각 분위기의 `copyRules` 길이에 맞춰 손으로 썼다 */
const SAMPLE: Record<StyleId, { title: string; subtitle: string }> = {
  "bold-graphic": { title: "결론\n먼저", subtitle: "길게 안 씁니다" },
  "photo-frame": { title: "오늘 뭐 마시지?", subtitle: "이번 주 추천" },
  "serif-soft": { title: "천천히 쌓이는 것들", subtitle: "매일 조금씩 남겨두면 됩니다" },
  promo: { title: "50%", subtitle: "이번 주만" },
  pixel: { title: "가볍게 시작", subtitle: "부담 없이 한 장" },
  character: { title: "쉽게 설명할게요", subtitle: "한 장에 하나씩" },
};

/** 시안 템플릿은 바뀌지 않는 파일이라 오래 담아둬도 된다 */
const TEMPLATE_CACHE = "public, max-age=86400";
/** 렌더러 폴백은 코드가 바뀌면 달라지므로 짧게 */
const RENDER_CACHE = "public, max-age=3600";

function png(body: Buffer, cache: string) {
  return new NextResponse(new Uint8Array(body), {
    headers: { "Content-Type": "image/png", "Cache-Control": cache },
  });
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/styles/[styleId]/preview">,
) {
  const { styleId } = await ctx.params;
  if (!(styleId in CARD_STYLES)) {
    return NextResponse.json({ error: "없는 분위기예요." }, { status: 404 });
  }
  const id = styleId as StyleId;

  // ?sheet=2 → 두 번째 장. 범위를 벗어나면 표지로 떨어진다
  const sheets = TEMPLATE_SHEETS[id] ?? [];
  const asked = Number(req.nextUrl.searchParams.get("sheet") ?? "1");
  const index = Number.isFinite(asked) && asked >= 1 && asked <= sheets.length ? asked - 1 : 0;
  const sheet = sheets[index];

  if (sheet) {
    try {
      return png(await readFile(path.join(TEMPLATE_DIR, id, sheet.file)), TEMPLATE_CACHE);
    } catch {
      // 파일이 없다 — 아래 렌더러로 물러선다
    }
  }

  try {
    const made = await renderSlidePng({
      layoutId: "cover",
      styleId: id,
      texts: SAMPLE[id],
      imageUrl: null,
    });
    return png(made, RENDER_CACHE);
  } catch (err) {
    console.error(`[styles/preview] 렌더 실패 style=${id}:`, err);
    return NextResponse.json({ error: "미리보기를 그리지 못했어요." }, { status: 502 });
  }
}
