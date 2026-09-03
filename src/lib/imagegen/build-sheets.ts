import "server-only";

import { planSheetCopy } from "../ai/sheet-copy";
import { planPhotoPlacement } from "../ai/photo-plan";
import { TEMPLATE_SHEETS } from "../render/template-sheets";
import { generateSheet, isImageGenConfigured } from "./index";
import { storeSlideImage } from "./store";
import type { LayoutId, Slide, StyleId } from "../../types/card";
import type { ToneKey } from "../../types/user";

/**
 * 시안 템플릿으로 카드뉴스 한 세트를 만든다 (09-02).
 *
 * ```
 * 클로드가 장별 문구 → 동시 생성 + 검사 + 재시도 → 성공한 장은 Storage에
 *                                        ↓ 실패한 장
 *                                  렌더러가 그릴 슬라이드로 내려앉힌다
 * ```
 *
 * **실패한 장을 버리지 않는다.** 그 자리를 빈칸으로 두면 카드뉴스에 구멍이 난다.
 * 대신 문구를 우리 레이아웃 슬롯으로 옮겨 담아 `origin: 'rendered'`로 남긴다 —
 * 시안만큼 예쁘진 않지만 **한 장이 빠지지는 않는다**
 * (DESIGN.md §12 「어디서 멈춰도 완성된다」).
 */

/**
 * 만드는 동안 흘려보내는 소식 (09-02).
 *
 * 3분이 걸리는 일이라 **끝날 때까지 아무 말이 없으면 멈춘 줄 안다.**
 * 가짜 진행률(73% 완료)은 쓰지 않는다(DESIGN.md §0) — 실제로 일어난 일만 알린다.
 */
export type BuildProgress =
  /** 문구가 정해졌다. 이제 몇 장을 만들지 알 수 있다 */
  | { type: "planned"; total: number }
  /** 한 장이 끝났다. `ok`가 false면 그 장은 렌더러로 물러섰다 */
  | { type: "sheet"; order: number; ok: boolean };

export type BuildResult = {
  slides: Slide[];
  /** 몇 장이 시안으로 나왔나 — 화면에 「N장 중 M장」을 알릴 때 쓴다 */
  generated: number;
  /** 몇 장이 렌더러로 물러섰나 */
  fallback: number;
};

/**
 * 실패한 장의 문구를 우리 레이아웃에 옮겨 담는다.
 *
 * 시안 슬롯과 레이아웃 슬롯은 모양이 달라서 **정확히 옮길 수 없다.** 첫 줄을 제목,
 * 나머지를 본문으로 붙이는 타협이다 — 여기까지 온 건 이미 세 번 실패한 뒤이고,
 * 목표는 «예쁘게»가 아니라 «빠지지 않게»다.
 */
function toRenderedSlide(
  order: number,
  lines: string[],
  photoUrls: string[],
  sheetIndex: number,
  isFirst: boolean,
  isLast: boolean,
): Slide {
  const layoutId: LayoutId = isFirst ? "cover" : isLast ? "closing" : "text-only";
  const [head, ...rest] = lines;
  const body = rest.join("\n").trim();

  const texts: Record<string, string> =
    layoutId === "cover"
      ? { title: head ?? "", subtitle: rest[0] ?? "" }
      : layoutId === "closing"
        ? { message: head ?? "", cta: rest[0] ?? "" }
        : { title: head ?? "", body };

  return {
    order,
    layoutId,
    texts,
    imageUrl: null,
    origin: "rendered",
    generatedUrl: null,
    // 「이 장 다시 만들기」가 같은 템플릿·같은 문구로 돌아갈 수 있게 남긴다
    sheetIndex,
    sheetLines: lines,
    sheetPhotoUrls: photoUrls,
  };
}

export type BuildInput = {
  cardId: string;
  styleId: StyleId;
  title: string;
  audience: string;
  intent: string;
  extraNote: string;
  tone: ToneKey | null;
  avoidExpressions: string[];
  /** 사용자가 올린 사진 — 주소와 내용. 있으면 시안 사진 자리에 그대로 들어간다 */
  photos: { url: string; png: Buffer }[];
  /** 「내 스타일」 강조색 `#RRGGBB` */
  accent: string | null;
  /** 기획 ⑤에서 정한 카드 장수. null이면 템플릿이 4~7장에서 고른다 (09-02) */
  slideCount: number | null;
  /** 기획 ⑤에서 좁힌 대상 (09-03). 문구를 그 대상에 맞춘다 */
  targeting?: import("../../types/plan").Targeting;
  /** 브랜드 자리에 넣을 최종 이름 (09-03). 빈 문자열이면 비운다 */
  brandLabel?: string;
  /** 진행 상황을 받아갈 곳. 없으면 아무 데도 안 보낸다 */
  onProgress?: (e: BuildProgress) => void;
};

/** 이 분위기를 시안 템플릿으로 만들 수 있는가 */
export function canBuildFromTemplate(styleId: StyleId | null): styleId is StyleId {
  if (!styleId) return false;
  if (!isImageGenConfigured()) return false;
  return (TEMPLATE_SHEETS[styleId]?.length ?? 0) > 0;
}

/**
 * 이 장에 넘길 사진을 고른다 — **순서대로 돌려가며** (09-02).
 *
 * 예전에는 **모든 장에 올린 사진을 통째로** 넘겼다. 그러면 장마다 gpt-image-2가
 * 알아서 하나를 고르는데, 장들이 동시에 만들어져 서로 뭘 썼는지 모른다. 그래서
 * 같은 사진이 여러 장에 반복되고 어떤 사진은 한 번도 안 쓰이는 일이 생겼다.
 *
 * 여기서 **첫 사진을 장마다 한 칸씩 밀어** 정한다. 사진 3장에 카드 5장이면
 * 1·2·3·1·2 순으로 주인공이 돌아간다.
 *
 * **한 장만 주지 않고 뒤따르는 것까지 함께 준다.** 시안에는 사진틀이 둘·셋인 장이
 * 있는데(「감성」 3번은 사진 3장), 한 장만 주면 같은 사진을 세 번 넣거나 없는 것을
 * 지어낸다. 틀 개수는 시안마다 달라 데이터로 갖고 있지 않으므로 넉넉히 준다.
 * @TODO: TemplateSheet에 사진틀 개수를 넣으면 정확히 맞춰 줄 수 있다
 */
export function photosForSheet<T>(photos: T[], order: number, take = 3): T[] {
  const n = photos.length;
  if (n === 0) return [];
  return Array.from({ length: Math.min(take, n) }, (_, k) => photos[(order + k) % n]);
}

export async function buildFromTemplate(input: BuildInput): Promise<BuildResult> {
  const plan = await planSheetCopy({
    styleId: input.styleId,
    title: input.title,
    audience: input.audience,
    intent: input.intent,
    extraNote: input.extraNote,
    tone: input.tone,
    avoidExpressions: input.avoidExpressions,
    hasUserPhotos: input.photos.length > 0,
    slideCount: input.slideCount,
    targeting: input.targeting,
    brandLabel: input.brandLabel,
  });

  if (plan.sheets.length === 0) return { slides: [], generated: 0, fallback: 0 };
  input.onProgress?.({ type: "planned", total: plan.sheets.length });

  /*
    **어느 사진을 어느 장에 넣을지 클로드가 정한다** (09-02 · B안).

    돌려 배정(`photosForSheet`)만으로는 중복은 없앨 수 있어도 «내용과 맞는가»는
    아무도 안 본다 — 등산화 사진이 준비물 장이 아니라 엉뚱한 장에 들어갔다.
    여기서 사진을 직접 보고 각 장의 문구와 맞춰 고른다.

    **두 경우엔 부르지 않는다.** 사진이 한 장이면 고를 것이 없고, 아예 없으면
    배정할 것이 없다. 괜히 부르면 시간과 비용만 든다.

    실패하면 돌려 배정으로 물러선다 — 사진 배정이 안 됐다고 카드를 못 만들면 안 된다
    (DESIGN §12 「어디서 멈춰도 완성된다」).
  */
  let placement: number[][] | null = null;
  if (input.photos.length > 1) {
    try {
      placement = await planPhotoPlacement({
        sheets: plan.sheets.map((s) => ({
          role: TEMPLATE_SHEETS[input.styleId]?.[s.index]?.role ?? "",
          lines: s.lines,
        })),
        photos: input.photos.map((p) => p.png),
      });
    } catch (e) {
      console.error("[buildFromTemplate] 사진 배정 실패 — 순서대로 나눕니다", e);
    }
  }

  /** 배정 결과를 실제 사진으로 바꾼다. 비었으면 돌려 배정으로 채운다 */
  const photosFor = (order: number) => {
    const picked = placement?.[order] ?? [];
    return picked.length > 0
      ? picked.map((i) => input.photos[i])
      : photosForSheet(input.photos, order);
  };

  /*
    장당 2분이라 **반드시 동시에** 던진다. 순차로 6장이면 13분이다.

    `generateSheets`를 쓰지 않고 여기서 직접 펼치는 이유 — 한 장이 끝날 때마다
    알려야 하는데, 묶어서 기다리면 전부 끝난 뒤에야 한 번에 알게 된다.
  */
  const results = await Promise.all(
    plan.sheets.map((s, order) =>
      generateSheet({
        styleId: input.styleId,
        index: s.index,
        lines: s.lines,
        // 클로드가 고른 사진. 못 정했으면 순서대로 돌려 배정 (09-02)
        photos: photosFor(order),
        photoDirection: plan.photoDirection || undefined,
        accent: input.accent,
      }).then((r) => {
        input.onProgress?.({ type: "sheet", order, ok: r.ok });
        return r;
      }),
    ),
  );

  const slides: Slide[] = [];
  let generated = 0;
  let fallback = 0;

  for (const [order, result] of results.entries()) {
    const lines = plan.sheets[order].lines;
    // 이 장에 넣은 사진 — 다시 만들 때 같은 것을 쓰려고 남긴다 (09-02)
    const urls = photosFor(order).map((p) => p.url);
    const isFirst = order === 0;
    const isLast = order === results.length - 1;

    if (!result.ok) {
      console.error(`[buildFromTemplate] ${order + 1}장 실패 — ${result.reason}`);
      slides.push(
        toRenderedSlide(order, lines, urls, plan.sheets[order].index, isFirst, isLast),
      );
      fallback++;
      continue;
    }

    const stored = await storeSlideImage({ cardId: input.cardId, order, png: result.png });
    if (!stored.ok) {
      // 그림은 나왔는데 저장을 못 했다 — 주소가 없으면 화면에 못 띄운다
      console.error(`[buildFromTemplate] ${order + 1}장 저장 실패 — ${stored.reason}`);
      slides.push(
        toRenderedSlide(order, lines, urls, plan.sheets[order].index, isFirst, isLast),
      );
      fallback++;
      continue;
    }

    slides.push({
      order,
      /*
        `layoutId`·`texts`는 **화면이 쓴다.** 그림은 이미 완성됐지만, 제작 결과에서
        문구를 고치거나 편집기로 넘어갈 때 «무슨 글이 들어 있었는지»가 있어야 한다.
        그리는 데는 안 쓰인다 — `origin`이 'generated'면 `generatedUrl`을 띄운다.
      */
      layoutId: isFirst ? "cover" : isLast ? "closing" : "text-only",
      texts: { title: lines[0] ?? "", body: lines.slice(1).join("\n") },
      imageUrl: null,
      origin: "generated",
      generatedUrl: stored.url,
      sheetIndex: plan.sheets[order].index,
      sheetLines: lines,
      sheetPhotoUrls: urls,
    });
    generated++;
  }

  return { slides, generated, fallback };
}
