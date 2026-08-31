import "server-only";

import { audiencePrompt } from "../audiences";
import { toneDirective } from "../tone";
import { BASE_SYSTEM, STR, callJson, isClaudeConfigured, obj } from "./client";
import { buildPreferenceDirective } from "./preferences";
import type { LayoutId, Slide, VisualType } from "../../types/card";
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
  title: string;
  audience: string;
  intent: string;
  extraNote: string;
  tone: ToneKey | null; // null = 아직 안 정함 → 기본 말투 (08-28 온보딩 축소)
  avoidExpressions: string[];
  /** 온보딩 게시물 취향 — 실호출 시 buildPreferenceDirective()로 프롬프트에 반영 (08-31) */
  visualPreferences?: User["visualPreferences"];
  visualType: VisualType;
  /** 사용자가 올린 사진 (F13). 순서 = 배열 순서. 이미지 레이아웃에 이 순서대로 배정된다 */
  photoUrls: string[];
};

/** 사진을 넣는 레이아웃 — 나머지는 사진이 있어도 자리가 없다 */
const IMAGE_LAYOUTS: LayoutId[] = ["image-top", "image-full"];

/**
 * 사진이 없는 이미지 레이아웃은 회색 빈 면이 된다 (`lib/render/layouts.ts`의 `imageArea`).
 * 그래서 글자만 있는 레이아웃으로 내려앉힌다 — 빈 면보다 낫다 (DESIGN §12 폴백 사슬).
 */
const DOWNGRADE: Record<string, LayoutId> = {
  "image-top": "text-only",
  "image-full": "text-only",
};

/**
 * 레이아웃별로 렌더러가 **실제로 읽는** 텍스트 슬롯 (`lib/render/layouts.ts`).
 *
 * 여기 없는 키를 넣으면 조용히 사라지고, 빠뜨리면 그 자리가 빈다.
 * 그래서 프롬프트에 그대로 넣어 모델이 지어내지 못하게 한다.
 */
const LAYOUT_SLOTS: Record<LayoutId, string> = {
  cover: "title, subtitle",
  "text-only": "title, body",
  "image-top": "title, body",
  "image-full": "title",
  list: "title, item1, item2, item3, item4 (item은 3~4개)",
  closing: "message, cta",
};

/** 이미지가 없으면 이미지 레이아웃은 빈 면이 된다 — 아예 후보에서 뺀다 */
const TEXT_ONLY_LAYOUTS: LayoutId[] = ["cover", "text-only", "list", "closing"];
const ALL_LAYOUTS = Object.keys(LAYOUT_SLOTS) as LayoutId[];

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
        },
        ["layoutId", "texts"],
      ),
    },
  },
  ["slides"],
);

/** 레이아웃별로 렌더러가 받아들이는 슬롯 이름 — 모르는 키는 버린다 */
const ALLOWED_KEYS: Record<LayoutId, string[]> = {
  cover: ["title", "subtitle"],
  "text-only": ["title", "body"],
  "image-top": ["title", "body"],
  "image-full": ["title"],
  list: ["title", "item1", "item2", "item3", "item4"],
  closing: ["message", "cta"],
};

export async function generateSlides(input: SlidesInput): Promise<Slide[]> {
  if (!isClaudeConfigured()) {
    return mockSlides(input);
  }

  // 사진이 없으면 이미지 레이아웃을 고를 수 없다 (DESIGN §12 폴백 사슬)
  const photos = input.photoUrls ?? [];
  const photoCount = input.visualType === "text_only" ? 0 : photos.length;
  const usable = photoCount === 0 ? TEXT_ONLY_LAYOUTS : ALL_LAYOUTS;

  const directives = [
    toneDirective(input.tone),
    buildPreferenceDirective(input.visualPreferences),
    input.avoidExpressions.length
      ? `다음 표현은 절대 쓰지 마라: ${input.avoidExpressions.join(", ")}.`
      : null,
  ].filter(Boolean);

  const result = await callJson<{
    slides: { layoutId: string; texts: { key: string; value: string }[] }[];
  }>({
    system: [BASE_SYSTEM, "", ...directives].join("\n"),
    user: [
      `주제: ${input.title}`,
      `읽는 사람: ${input.audience}`,
      `대상별 지시: ${audiencePrompt(input.audience)}`,
      input.intent ? `기획의도: ${input.intent}` : "",
      input.extraNote ? `**이번에 꼭 넣어야 하는 것: ${input.extraNote}**` : "",
      "",
      `이 게시물의 카드뉴스를 ${MIN_SLIDES}~${MAX_SLIDES}장으로 구성해라. 넘겨보는 순서가 곧 이야기 흐름이다.`,
      "",
      "쓸 수 있는 레이아웃과 **정해진 텍스트 슬롯** (다른 키를 만들면 화면에서 사라진다):",
      ...usable.map((id) => `- ${id}: ${LAYOUT_SLOTS[id]}`),
      "",
      "규칙:",
      "- 첫 장은 반드시 `cover`, 마지막 장은 반드시 `closing`.",
      "- 슬라이드 한 장에 담는 생각은 하나. 글자가 많으면 넘기지 않는다.",
      "- 제목은 짧게(20자 안팎), 본문도 3~4줄을 넘기지 않는다. 화면이 정사각형이라 길면 잘린다.",
      "- 같은 레이아웃을 세 번 넘게 잇달아 쓰지 않는다.",
      photoCount > 0
        ? `- **사진이 ${photoCount}장 있다.** \`image-top\`·\`image-full\`을 합쳐 **${photoCount}장까지만** 써라. 더 쓰면 사진 없는 빈 면이 된다.`
        : "- 사진이 없다. `image-top`·`image-full`은 쓸 수 없다.",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: SLIDES_SCHEMA,
    effort: "medium", // 결과물로 남는다 (PLAN §9)
  });

  /*
    사진 배정 (F13 · DESIGN §12).
    이미지 레이아웃에 **올린 순서대로** 한 장씩 넣는다. 사진이 모자라면 그 슬라이드는
    글자 레이아웃으로 내려앉힌다 — 사진 없는 이미지 레이아웃은 회색 빈 면이 된다.
    프롬프트에서 이미 장수를 알려주므로 보통은 여기까지 오지 않는다(안전망).
  */
  let nextPhoto = 0;

  const slides: Slide[] = result.slides
    // 렌더러가 모르는 레이아웃은 버린다 — 넣어봐야 빈 화면이 된다
    .filter((s) => usable.includes(s.layoutId as LayoutId))
    .slice(0, MAX_SLIDES)
    .map((s, order) => {
      let layoutId = s.layoutId as LayoutId;
      let imageUrl: string | null = null;

      if (IMAGE_LAYOUTS.includes(layoutId)) {
        if (nextPhoto < photoCount) {
          imageUrl = photos[nextPhoto];
          nextPhoto++;
        } else {
          layoutId = DOWNGRADE[layoutId];
        }
      }

      // 그 레이아웃이 읽지 않는 키는 버린다 — 남겨둬도 화면에 안 나오고 문서만 커진다
      const allowed = ALLOWED_KEYS[layoutId];
      const texts: Record<string, string> = {};
      for (const { key, value } of s.texts ?? []) {
        if (allowed.includes(key) && typeof value === "string") texts[key] = value;
      }

      return { order, layoutId, texts, imageUrl };
    });

  // 너무 적게 오면 화면이 허전하다 — 최소 장수를 못 채우면 샘플로 되돌린다
  return slides.length >= MIN_SLIDES ? slides : mockSlides(input);
}

/** 개발용 샘플 5장 — 레이아웃 6종 중 텍스트 계열로 구성 (visualType 반영 전) */
function mockSlides(input: SlidesInput): Slide[] {
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
