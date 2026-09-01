import { DOWNGRADE, IMAGE_LAYOUTS } from "./slide-layout";
import type { LayoutId, TemplateId } from "../types/card";

/**
 * 카드뉴스 «구성» 템플릿 (08-31).
 *
 * 테마가 «어떤 색·글자 비율로 그리는가», 레이아웃이 «한 장 안에 무엇을 어디에»라면
 * 템플릿은 **«몇 장을, 어떤 순서로, 각 장이 무슨 일을 하는가»**다.
 *
 * **더미 문구를 담지 않는다.** 캔바 템플릿은 가짜 글이 든 껍데기를 주고
 * 사용자가 지우고 채우게 하는데, 그건 DESIGN.md §0의
 * *«사용자가 빈칸부터 채우게 만든다»* 금지에 걸린다.
 * 여기 담기는 건 틀과 «각 장이 할 일»(`purpose`)뿐이고, 문구는 AI가 쓴다.
 *
 * id는 새로 짓지 않았다 — `lib/style-examples.ts`의 `ContentFormat`을 그대로 쓴다.
 * 온보딩이 이미 «어떤 형식을 좋아하는지»(`visualPreferences.contentFormats`)를
 * 모으고 있어서, 어휘가 같아야 취향과 템플릿이 이어진다.
 *
 * **4종만 두는 이유** — 08-28에 취향 예시를 11종에서 다시 짤 때
 * «실제 인스타에 올려도 어색하지 않은가»를 기준으로 걸러냈고,
 * 살아남은 세트에 실제로 등장하는 형식이 diary·editorial·statement·informational이다.
 * `collage`(사진 여러 장)·`review`(별점·총평)는 지금 레이아웃 6종으로 못 그린다.
 */

export type TemplateSlide = {
  layoutId: LayoutId;
  /** AI에게 «이 장이 할 일»을 알려주는 지시. 문구 자체가 아니다 */
  purpose: string;
};

export type CardTemplate = {
  id: TemplateId;
  /** 화면에 보이는 이름 — 내부 id는 노출하지 않는다 */
  label: string;
  hint: string;
  slides: TemplateSlide[];
};

export const CARD_TEMPLATES: Record<TemplateId, CardTemplate> = {
  informational: {
    id: "informational",
    label: "정보 카드뉴스",
    hint: "알려주고 저장하게 만드는 구성",
    slides: [
      { layoutId: "cover", purpose: "무엇을 알려주는 글인지 질문형으로 붙잡는다" },
      { layoutId: "text-only", purpose: "결론을 먼저 한 줄로 말한다" },
      { layoutId: "list", purpose: "근거나 방법을 3~4가지로 나눈다" },
      { layoutId: "image-top", purpose: "실제 장면 하나로 뒷받침한다" },
      { layoutId: "closing", purpose: "저장해두라고 권한다" },
    ],
  },
  diary: {
    id: "diary",
    label: "기록",
    hint: "사진으로 남기는 그날의 이야기",
    slides: [
      { layoutId: "cover", purpose: "언제의 무슨 기록인지 담담하게" },
      { layoutId: "image-full", purpose: "그날의 한 장면. 설명하지 말고 보여준다" },
      { layoutId: "text-only", purpose: "그때 든 생각을 짧게" },
      { layoutId: "image-top", purpose: "또 다른 장면과 한 줄 설명" },
      { layoutId: "closing", purpose: "다음에도 이어가겠다는 마무리" },
    ],
  },
  statement: {
    id: "statement",
    label: "한 문장",
    hint: "하고 싶은 말을 크게 박는 구성",
    slides: [
      { layoutId: "cover", purpose: "하고 싶은 말을 한 문장으로 못박는다" },
      { layoutId: "text-only", purpose: "그 말이 나온 배경을 짧게" },
      { layoutId: "image-full", purpose: "말과 겹치는 장면 하나" },
      { layoutId: "text-only", purpose: "그래서 무엇을 하기로 했는지" },
      { layoutId: "closing", purpose: "같이 해보자고 건넨다" },
    ],
  },
  editorial: {
    id: "editorial",
    label: "에세이",
    hint: "사진과 글을 번갈아 읽히는 구성",
    slides: [
      { layoutId: "cover", purpose: "제목처럼 붙잡는 첫 줄" },
      { layoutId: "image-full", purpose: "분위기를 잡는 한 장" },
      { layoutId: "text-only", purpose: "이야기의 앞부분" },
      { layoutId: "image-top", purpose: "장면과 그에 붙는 설명" },
      { layoutId: "text-only", purpose: "이야기를 매듭짓는 생각" },
      { layoutId: "closing", purpose: "읽어줘서 고맙다는 마무리" },
    ],
  },
};

export const TEMPLATE_ORDER: TemplateId[] = [
  "informational",
  "diary",
  "statement",
  "editorial",
];

/**
 * 이 템플릿이 사진에 기대는 정도 — 이미지 레이아웃이 몇 자리인지.
 *
 * 사진도 스톡도 없으면(`visualType === "text_only"`) 그 자리가 전부 글자로
 * 내려앉아, 「기록」이 사진 한 장 없는 글 다섯 장이 된다.
 * 그럴 땐 아예 못 고르게 하는 편이 낫다 — 레이아웃 칩과 같은 원칙이다.
 */
export function imageSlotCount(template: CardTemplate): number {
  return template.slides.filter((s) => IMAGE_LAYOUTS.includes(s.layoutId)).length;
}

/** 사진 없이도 말이 되는 구성인가 — 이미지 자리가 1개 이하면 괜찮다고 본다 */
export function worksWithoutPhotos(template: CardTemplate): boolean {
  return imageSlotCount(template) <= 1;
}

/**
 * 템플릿을 «이 카드에서 실제로 쓸 구성»으로 바꾼다.
 *
 * 사진이 모자라면 이미지 레이아웃을 글자 레이아웃으로 내려앉힌다 —
 * 사진 없는 이미지 레이아웃은 회색 빈 면이 된다 (DESIGN §12 폴백 사슬).
 * 스톡을 쓸 수 있으면 내려앉히지 않는다. 그 판단은 부르는 쪽이 한다.
 */
export function materializeTemplate(
  template: CardTemplate,
  imageCapacity: number,
): TemplateSlide[] {
  let left = imageCapacity;
  return template.slides.map((s) => {
    if (!IMAGE_LAYOUTS.includes(s.layoutId)) return s;
    if (left > 0) {
      left -= 1;
      return s;
    }
    return { ...s, layoutId: DOWNGRADE[s.layoutId] };
  });
}
