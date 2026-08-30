import "server-only";

import type { Slide, VisualType } from "../../types/card";
import type { ToneKey } from "../../types/user";
import { isClaudeConfigured } from "./caption";

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
 */

export type SlidesInput = {
  title: string;
  audience: string;
  intent: string;
  extraNote: string;
  tone: ToneKey | null; // null = 아직 안 정함 → 기본 말투 (08-28 온보딩 축소)
  avoidExpressions: string[];
  visualType: VisualType;
};

export async function generateSlides(input: SlidesInput): Promise<Slide[]> {
  if (!isClaudeConfigured()) {
    return mockSlides(input);
  }

  // @TODO: 실제 Claude 호출로 교체. 키가 있어도 아직 목을 반환한다.
  return mockSlides(input);
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
