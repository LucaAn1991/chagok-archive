import "server-only";

import { audiencePrompt } from "../audiences";
import { toneDirective } from "../tone";
import { isStockConfigured, pickStockPhotos } from "../stock";
import { generateImage, isImageGenConfigured } from "../imagegen";
import { saveServerImage } from "../storage/photos";
import { BASE_SYSTEM, STR, callJson, isClaudeConfigured, obj } from "./client";
import { buildPreferenceDirective } from "./preferences";
import { CARD_TEMPLATES, materializeTemplate, type TemplateSlide } from "../card-templates";
import {
  ALL_LAYOUTS,
  DOWNGRADE,
  IMAGE_LAYOUTS,
  LAYOUT_SLOTS,
  TEXT_ONLY_LAYOUTS,
} from "../slide-layout";
import type {
  ImageOrigin,
  LayoutId,
  Slide,
  StockCredit,
  TemplateId,
  VisualType,
} from "../../types/card";
import type { ToneKey, User } from "../../types/user";

/**
 * 카드뉴스 슬라이드 구성 생성 (F8) — 슬라이드 5~8장의 레이아웃·텍스트.
 *
 * 완성된 PNG는 저장하지 않는다. 여기서 만든 구성(layoutId·texts)을 카드에
 * 저장해두고, 이미지는 GET /api/cards/[cardId]/slides/[order]/image 가
 * 요청 시 즉석 렌더링한다 (장당 5~10ms 실측 — scripts/render-smoke.ts).
 *
 * ANTHROPIC_API_KEY가 없으면 목 모드 — 「(개발용 샘플)」 표시가 붙는다.
 *
 * @TODO: 실제 Claude 호출 구현 — src/lib/ai/caption.ts의 TODO와 동일 조건.
 *   슬라이드 장수(5~8)·레이아웃 배치도 AI가 내용에 맞게 정하게 한다.
 *   visualPreferences는 buildPreferenceDirective()로 프롬프트에 반영 (08-31).
 */

export type SlidesInput = {
  /** 생성 이미지를 저장할 경로에 쓴다 — `cards/{cardId}/photos/…` (08-31 F15) */
  cardId: string;
  title: string;
  audience: string;
  intent: string;
  extraNote: string;
  tone: ToneKey | null; // null = 아직 안 정함 → 기본 말투 (08-28 온보딩 축소)
  avoidExpressions: string[];
  /** 온보딩 게시물 취향 — 실호출 시 buildPreferenceDirective()로 프롬프트에 반영 (08-31) */
  visualPreferences?: User["visualPreferences"];
  /**
   * 구성 템플릿 (08-31). 주면 **장수·순서·레이아웃이 고정되고 AI는 문구만 쓴다.**
   * null이면 지금까지처럼 AI가 구성까지 정한다.
   */
  templateId?: TemplateId | null;
  visualType: VisualType;
  /** 사용자가 올린 사진 (F13). 순서 = 배열 순서. 이미지 레이아웃에 이 순서대로 배정된다 */
  photoUrls: string[];
};

/**
 * 프롬프트에 넣을 슬롯 안내 — 정의 자체는 `lib/slide-layout.ts`가 든다.
 * 여기서 다시 적으면 화면·서버와 어긋난다.
 */
const SLOT_HINT: Record<LayoutId, string> = {
  cover: "",
  "text-only": "",
  "image-top": "",
  "image-full": "",
  list: " (item은 3~4개)",
  closing: "",
};

function slotLine(id: LayoutId): string {
  return `${LAYOUT_SLOTS[id].join(", ")}${SLOT_HINT[id]}`;
}

/**
 * 스톡 «검색어»를 이미지 «생성 프롬프트»로 바꾼다 (08-31 F15).
 *
 * 검색어는 `morning run city street`처럼 낱말 몇 개다. 그대로 넣으면 모델이
 * 일러스트나 콜라주를 낼 수 있는데, 이 자리는 **스톡 사진이 있었을 자리**라
 * 사진처럼 보여야 카드뉴스 안에서 튀지 않는다. 그래서 사진 지시를 붙인다.
 *
 * **글자를 넣지 말라고 못박는다.** 문구는 satori가 정확히 그리는데,
 * 생성 이미지에 글자까지 섞이면 한 화면에 두 벌이 겹쳐 보인다.
 */
function imagePrompt(query: string, input: SlidesInput): string {
  const subject = query.trim() || input.audience;
  return [
    `Realistic photograph: ${subject}.`,
    "Natural lighting, candid lifestyle photography, shallow depth of field.",
    "Square 1:1 composition with empty space for text overlay.",
    "No text, no letters, no watermark, no logo, no collage, no illustration.",
  ].join(" ");
}

const MIN_SLIDES = 5;
const MAX_SLIDES = 8;

/**
 * 텍스트 슬롯을 **객체가 아니라 키·값 배열**로 받는다.
 *
 * 구조화 출력은 «임의의 키를 가진 객체»를 허용하지 않는다
 * ("For 'object' type, 'additionalProperties: object' is not supported").
 * 레이아웃마다 슬롯이 달라 고정 속성으로도 못 적으므로 배열로 받아 코드에서 조립한다.
 */
const SLIDES_SCHEMA = obj(
  {
    slides: {
      type: "array",
      items: obj(
        {
          layoutId: STR,
          texts: {
            type: "array",
            items: obj({ key: STR, value: STR }, ["key", "value"]),
          },
          /*
            스톡 사진을 찾을 **영어** 검색어. 카드 제목은 한국어인데 스톡 검색은
            영어가 훨씬 정확하다. 이미지 레이아웃이 아니면 빈 문자열이어도 된다.
          */
          imageQuery: STR,
        },
        ["layoutId", "texts", "imageQuery"],
      ),
    },
  },
  ["slides"],
);

export async function generateSlides(input: SlidesInput): Promise<Slide[]> {
  if (!isClaudeConfigured()) {
    return mockSlides(input);
  }

  /*
    이미지 폴백 사슬 (DESIGN §12) — ① 사용자 사진 → ② 스톡 → ③ text-only.
    ①이 있으면 ②는 쓰지 않는다. 둘을 섞으면 카드뉴스 안에서 톤이 튄다.
  */
  const photos = input.photoUrls ?? [];
  const photoCount = input.visualType === "text_only" ? 0 : photos.length;
  const stockAvailable = photoCount === 0 && isStockConfigured();
  // ③ AI 생성 — 앞의 둘이 모두 비었을 때만 (DESIGN §12 · PRD F15, 08-31)
  const genAvailable = photoCount === 0 && !stockAvailable && isImageGenConfigured();
  const usable =
    photoCount === 0 && !stockAvailable && !genAvailable ? TEXT_ONLY_LAYOUTS : ALL_LAYOUTS;

  /*
    구성 템플릿 (08-31). 주어지면 «몇 장·어떤 순서»가 여기서 확정되고
    AI는 각 자리의 문구만 쓴다.

    사진을 몇 장까지 쓸 수 있는지에 맞춰 이미지 레이아웃을 미리 내려앉힌다 —
    스톡을 쓸 수 있으면 사진 수에 제한이 없으므로 템플릿을 그대로 둔다.
  */
  const template = input.templateId ? CARD_TEMPLATES[input.templateId] : null;
  const plan: TemplateSlide[] | null = template
    ? materializeTemplate(
        template,
        stockAvailable || genAvailable ? template.slides.length : photoCount,
      )
    : null;

  const directives = [
    toneDirective(input.tone),
    buildPreferenceDirective(input.visualPreferences),
    input.avoidExpressions.length
      ? `다음 표현은 절대 쓰지 마라: ${input.avoidExpressions.join(", ")}.`
      : null,
  ].filter(Boolean);

  const result = await callJson<{
    slides: {
      layoutId: string;
      texts: { key: string; value: string }[];
      imageQuery: string;
    }[];
  }>({
    system: [BASE_SYSTEM, "", ...directives].join("\n"),
    user: [
      `주제: ${input.title}`,
      `읽는 사람: ${input.audience}`,
      `대상별 지시: ${audiencePrompt(input.audience)}`,
      input.intent ? `기획의도: ${input.intent}` : "",
      input.extraNote ? `**이번에 꼭 넣어야 하는 것: ${input.extraNote}**` : "",
      "",
      plan
        ? `이 게시물의 카드뉴스는 **${plan.length}장으로 구성이 이미 정해져 있다.** 아래 순서를 그대로 지켜라 — 장수·순서·레이아웃을 바꾸지 마라. 네가 할 일은 각 자리에 들어갈 문구를 쓰는 것이다.`
        : `이 게시물의 카드뉴스를 ${MIN_SLIDES}~${MAX_SLIDES}장으로 구성해라. 넘겨보는 순서가 곧 이야기 흐름이다.`,
      "",
      plan
        ? "정해진 구성 (순서대로, 각 줄이 슬라이드 한 장):"
        : "쓸 수 있는 레이아웃과 **정해진 텍스트 슬롯** (다른 키를 만들면 화면에서 사라집니다):",
      ...(plan
        ? plan.map(
            (p, i) => `${i + 1}. ${p.layoutId} — ${p.purpose} / 슬롯: ${slotLine(p.layoutId)}`,
          )
        : usable.map((id) => `- ${id}: ${slotLine(id)}`)),
      "",
      "규칙:",
      plan
        ? "- 위 순서와 레이아웃을 그대로 따른다. 장을 더하거나 빼지 않는다."
        : "- 첫 장은 반드시 `cover`, 마지막 장은 반드시 `closing`.",
      "- 슬라이드 한 장에 담는 생각은 하나. 글자가 많으면 넘기지 않는다.",
      "- 제목은 짧게(20자 안팎), 본문도 3~4줄을 넘기지 않는다. 화면이 정사각형이라 길면 잘린다.",
      "- 같은 레이아웃을 세 번 넘게 잇달아 쓰지 않는다.",
      photoCount > 0
        ? `- **사용자 사진이 ${photoCount}장 있다.** \`image-top\`·\`image-full\`을 합쳐 **${photoCount}장까지만** 써라. 더 쓰면 사진 없는 빈 면이 된다.`
        : stockAvailable
          ? "- 사용자 사진은 없지만 **스톡 사진을 쓸 수 있다.** 이미지 레이아웃은 2장까지만 — 사진이 많으면 글이 밀린다."
          : "- 사진이 없다. `image-top`·`image-full`은 쓸 수 없다.",
      "",
      "`imageQuery` — 이미지 레이아웃에는 그 자리에 어울릴 사진을 찾을 **영어 검색어**를 넣어라.",
      "  낱말 2~4개로 장면을 묘사한다 (예: `morning run city street`, `person tying running shoes`).",
      "  한국어·고유명사·추상어는 쓰지 마라. 이미지 레이아웃이 아니면 빈 문자열.",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: SLIDES_SCHEMA,
    effort: "medium", // 결과물로 남는다 (PLAN §9)
  });

  /*
    템플릿이 있으면 **AI가 낸 layoutId를 쓰지 않는다.** 지시를 어기고 다른 걸
    낼 수 있는데, 그러면 «구성이 정해진다»는 약속이 깨진다. 순서대로 짝지어
    문구만 가져오고 레이아웃은 우리가 정한 것으로 덮는다.

    모자라게 오면 그 자리는 빈 문구로 남는다 — 장수는 템플릿이 정한 대로 유지한다.
  */
  const kept = plan
    ? plan.map((p, i) => ({
        layoutId: p.layoutId as string,
        texts: result.slides[i]?.texts ?? [],
        imageQuery: result.slides[i]?.imageQuery ?? "",
      }))
    : result.slides
        // 렌더러가 모르는 레이아웃은 버린다 — 넣어봐야 빈 화면이 된다
        .filter((s) => usable.includes(s.layoutId as LayoutId))
        .slice(0, MAX_SLIDES);

  /*
    사진 배정 (F13 · DESIGN §12).
    ① 사용자 사진이 있으면 **올린 순서대로** 한 장씩.
    ② 없으면 AI가 낸 영어 검색어로 스톡을 찾아 채운다.
    ③ 그래도 못 채운 이미지 레이아웃은 글자 레이아웃으로 내려앉힌다 —
       사진 없는 이미지 레이아웃은 회색 빈 면이 된다.
  */
  const imageSlots = kept
    .map((s, i) => ({ i, query: s.imageQuery ?? "" }))
    .filter(({ i }) => IMAGE_LAYOUTS.includes(kept[i].layoutId as LayoutId));

  const assigned = new Map<
    number,
    { url: string; credit: StockCredit | null; origin: ImageOrigin }
  >();

  if (photoCount > 0) {
    imageSlots.forEach((slot, n) => {
      // 사용자 사진은 출처가 본인이라 크레딧이 없다
      if (n < photoCount) {
        assigned.set(slot.i, { url: photos[n], credit: null, origin: "user" });
      }
    });
  } else if (stockAvailable && imageSlots.length > 0) {
    const found = await pickStockPhotos(imageSlots.map((s) => s.query));
    imageSlots.forEach((slot, n) => {
      const photo = found[n];
      if (photo) {
        assigned.set(slot.i, {
          url: photo.imageUrl,
          // 약관이 요구하는 크레딧 — 지금 안 담아두면 나중에 알아낼 방법이 없다
          credit: { photographer: photo.photographer, sourceUrl: photo.sourceUrl },
          origin: "stock",
        });
      }
    });
  } else if (genAvailable && imageSlots.length > 0) {
    /*
      ③ AI 생성 (F15, 08-31). 여기까지 왔다는 건 사용자 사진도 스톡도 없다는 뜻이다.

      **한 장이 12초쯤 걸린다.** 순서대로 부르면 두 장에 25초라, 자리들을 한꺼번에
      부른다. 이미지 자리는 레이아웃당 최대 2개라 동시 호출이 몰릴 일은 없다.

      만든 이미지는 **우리 Storage로 옮겨 저장한다** — 공급자 출력 주소의 수명이
      문서에 없어서, 그대로 두면 나중에 카드를 열 때 이미지가 깨진다.
      저장까지 실패하면 그 자리는 비고, 아래에서 글자 레이아웃으로 내려앉는다.
    */
    const made = await Promise.all(
      imageSlots.map((slot) => generateImage(imagePrompt(slot.query, input))),
    );
    const stored = await Promise.all(
      // 형식은 만들어진 것을 따른다 — 실측상 JPEG가 온다. 고정하면 내용과 어긋난다
      made.map((img) =>
        img ? saveServerImage("cards", input.cardId, img.bytes, img.contentType) : null,
      ),
    );
    imageSlots.forEach((slot, n) => {
      const url = stored[n];
      // AI 생성물에는 크레딧이 없다 — 대신 origin으로 «만든 그림»임을 남긴다
      if (url) assigned.set(slot.i, { url, credit: null, origin: "ai" });
    });
  }

  const slides: Slide[] = kept.map((s, order) => {
    let layoutId = s.layoutId as LayoutId;
    const picked = assigned.get(order) ?? null;
    const imageUrl = picked?.url ?? null;

    // 사진을 못 채운 이미지 레이아웃은 글자 쪽으로
    if (imageUrl === null && IMAGE_LAYOUTS.includes(layoutId)) {
      layoutId = DOWNGRADE[layoutId];
    }

    // 그 레이아웃이 읽지 않는 키는 버린다 — 남겨둬도 화면에 안 나오고 문서만 커진다
    const allowed = LAYOUT_SLOTS[layoutId];
    const texts: Record<string, string> = {};
    for (const { key, value } of s.texts ?? []) {
      if (allowed.includes(key) && typeof value === "string") texts[key] = value;
    }

    return {
      order,
      layoutId,
      texts,
      imageUrl,
      imageCredit: picked?.credit ?? null,
      ...(imageUrl && picked ? { imageOrigin: picked.origin } : {}),
    };
  });

  // 너무 적게 오면 화면이 허전하다 — 최소 장수를 못 채우면 샘플로 되돌린다
  return slides.length >= MIN_SLIDES ? slides : mockSlides(input);
}

/**
 * 개발용 샘플 — 레이아웃 6종 중 텍스트 계열로 구성 (visualType 반영 전).
 *
 * 템플릿이 지정되면 **그 구성 그대로** 자리만 채운다. 안 그러면 API 키가 없는
 * 개발 환경에서 「다른 구성으로」를 눌러도 아무 변화가 없어 보인다.
 */
function mockSlides(input: SlidesInput): Slide[] {
  if (input.templateId) {
    const template = CARD_TEMPLATES[input.templateId];
    // 목 모드에는 사진이 없다 — 이미지 레이아웃은 전부 글자 쪽으로 내려앉는다
    return materializeTemplate(template, 0).map((p, order) => {
      const texts: Record<string, string> = {};
      for (const [i, key] of LAYOUT_SLOTS[p.layoutId].entries()) {
        // 첫 슬롯에만 주제를 넣고 나머지는 «무슨 자리인지»를 그대로 보여준다
        texts[key] = i === 0 ? `(샘플) ${input.title}` : `[${p.purpose}]`;
      }
      return { order, layoutId: p.layoutId, texts, imageUrl: null, imageCredit: null };
    });
  }

  return [
    {
      order: 0,
      layoutId: "cover",
      texts: {
        title: `(개발용 샘플) ${input.title}`,
        subtitle: `${input.audience}를 위해 정리했어요`,
      },
      imageUrl: null,
    },
    {
      order: 1,
      layoutId: "text-only",
      texts: {
        title: "핵심부터 말하면",
        body: input.intent || "실제 본문은 Claude 연동 후 이 자리에 생성됩니다.",
      },
      imageUrl: null,
    },
    {
      order: 2,
      layoutId: "list",
      texts: {
        title: "이렇게 정리했어요",
        item1: "첫 번째 포인트 — 실제 내용은 Claude가 생성합니다",
        item2: "두 번째 포인트 — 대상과 기획의도가 반영됩니다",
        item3: input.extraNote
          ? `꼭 넣을 내용: ${input.extraNote}`
          : "세 번째 포인트 — 개발용 샘플 텍스트입니다",
      },
      imageUrl: null,
    },
    {
      order: 3,
      layoutId: "text-only",
      texts: {
        title: "기억할 것 하나",
        body: "슬라이드 구성·문구는 Claude 연동 후 카드 내용에 맞게 생성됩니다.",
      },
      imageUrl: null,
    },
    {
      order: 4,
      layoutId: "closing",
      texts: {
        message: "오늘도 하나,\n차곡차곡 쌓였어요",
        cta: "저장해두고 필요할 때 다시 봐요",
      },
      imageUrl: null,
    },
  ];
}
