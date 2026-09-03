import "server-only";

import { audiencePrompt } from "../audiences";
import { toneDirective } from "../tone";
import { BASE_SYSTEM, STR, STR_ARRAY, callJson, obj } from "./client";
import { CARD_STYLES } from "../render/card-styles";
import { TEMPLATE_SHEETS } from "../render/template-sheets";
import type { StyleId } from "../../types/card";
import type { ToneKey } from "../../types/user";

/**
 * 시안 템플릿의 **각 장에 들어갈 문구**를 쓴다 (09-02).
 *
 * **`generateSlides`와 다르다.** 그쪽은 우리 레이아웃 6종의 슬롯(`title`·`body`…)에
 * 맞춰 쓰는데, 시안 템플릿은 장마다 슬롯이 다르다 — 목차 6줄이 필요한 장도 있고
 * 번호 항목 3개가 필요한 장도 있다. 슬롯 명세를 그대로 넘기고 **줄 배열**로 받는다.
 *
 * **어느 장을 쓸지도 AI가 고른다.** 템플릿 6~7장을 전부 쓰지 않는다 —
 * 「세일」의 마지막 장은 숫자 모음(장식용)이라 내용이 들어갈 자리가 아니고,
 * 「사진 위」는 같은 «메뉴 카드» 구조가 4장이라 주제에 따라 두세 장이면 충분하다.
 *
 * **표지는 항상 첫 장이다.** 그건 고르게 두지 않는다.
 */

const SHEET_COPY_SCHEMA = obj(
  {
    sheets: {
      type: "array",
      items: obj({ index: { type: "integer" }, lines: STR_ARRAY }, ["index", "lines"]),
    },
    /** 사진 자리를 무엇으로 채울지 — 사용자 사진이 없을 때만 쓴다 */
    photoDirection: STR,
  },
  ["sheets", "photoDirection"],
);

export type SheetCopy = {
  /** 템플릿 몇 번째 장인가 (0부터) */
  index: number;
  /** 그 장의 슬롯 순서대로 채운 문구 */
  lines: string[];
};

export type SheetCopyResult = {
  sheets: SheetCopy[];
  /** 사진 자리에 넣을 장면 설명(영어). 사용자 사진이 있으면 안 쓴다 */
  photoDirection: string;
};

export type SheetCopyInput = {
  styleId: StyleId;
  title: string;
  audience: string;
  intent: string;
  extraNote: string;
  tone: ToneKey | null;
  avoidExpressions: string[];
  /** 올린 사진이 있으면 사진 지시를 만들지 않는다 */
  hasUserPhotos: boolean;
  /**
   * 사용자가 기획 ⑤에서 정한 카드 장수 (09-02). null이면 AI가 4~7장 사이에서 고른다.
   *
   * 범위 밖 값은 여기 오기 전에 걸러진다 (`lib/ai/claude.ts` refineDraft) —
   * 혹시 넘어와도 아래에서 다시 묶는다.
   */
  slideCount: number | null;
};

/** 카드뉴스 한 세트의 길이. 너무 짧으면 이야기가 안 되고 길면 안 넘겨본다 */
const MIN_SHEETS = 4;
const MAX_SHEETS = 7;

export async function planSheetCopy(input: SheetCopyInput): Promise<SheetCopyResult> {
  const style = CARD_STYLES[input.styleId];
  const sheets = TEMPLATE_SHEETS[input.styleId] ?? [];
  if (sheets.length === 0) return { sheets: [], photoDirection: "" };

  /*
    사용자가 장수를 정했으면 그 수에 맞춘다 (09-02).
    쓸 수 있는 장보다 많이 요청할 수는 없어서 시트 수로도 한 번 더 묶는다.
  */
  const exact = input.slideCount
    ? Math.min(Math.max(input.slideCount, MIN_SHEETS), Math.min(MAX_SHEETS, sheets.length))
    : null;

  const directives = [
    toneDirective(input.tone),
    input.avoidExpressions.length
      ? `다음 표현은 절대 쓰지 마라: ${input.avoidExpressions.join(", ")}.`
      : null,
    /*
      분위기의 문구 규칙은 여기서도 쓴다 — 시안이 정한 글자 크기·줄 수를 넘기면
      레이아웃이 무너진다. `lib/ai/slides.ts`와 같은 규칙을 같은 자리에 얹는다.
    */
    [
      `이 카드뉴스는 「${style.label}」 분위기다. 문구를 그 분위기에 맞춰 써라:`,
      ...style.copyRules.map((r) => `- ${r}`),
    ].join("\n"),
  ].filter(Boolean);

  const result = await callJson<SheetCopyResult>({
    system: [BASE_SYSTEM, "", ...directives].join("\n"),
    user: [
      `주제: ${input.title}`,
      `읽는 사람: ${input.audience}`,
      `대상별 지시: ${audiencePrompt(input.audience)}`,
      input.intent ? `기획의도: ${input.intent}` : "",
      input.extraNote ? `**이번에 꼭 넣어야 하는 것: ${input.extraNote}**` : "",
      "",
      "이 카드뉴스는 **정해진 디자인 템플릿**으로 만들어진다. 쓸 수 있는 장은 이렇다:",
      ...sheets.map(
        (s, i) => `${i}. [${s.role}] 글자 자리 ${s.slots.length}개 — ${s.slots.join(" / ")}`,
      ),
      "",
      exact
        ? `할 일: 이 중에서 **정확히 ${exact}장**을 골라 순서를 정하고, 각 장의 글자 자리를 채워라.`
        : `할 일: 이 중에서 **${MIN_SHEETS}~${MAX_SHEETS}장**을 골라 순서를 정하고, 각 장의 글자 자리를 채워라.`,
      "",
      "규칙:",
      "- **0번(표지)은 반드시 첫 장으로 넣는다.**",
      "- 고른 장들이 하나의 흐름이어야 한다: 붙잡기 → 왜 → 무엇을 → 어떻게 → 마무리.",
      "- **주제에 맞지 않는 장은 빼라.** 할인 정보가 없는데 숫자 강조 장을 넣지 마라.",
      "- 같은 구조의 장이 여러 개면 필요한 만큼만 쓴다.",
      "- `lines`는 그 장의 **글자 자리 순서 그대로**, 자리 수만큼 채운다. 빈 줄을 남기지 마라.",
      "- 「~줄」이라고 적힌 자리는 그 줄 수에 맞춰 **줄바꿈(\\n)으로** 나눈다.",
      "- 영문 자리(영문 한 줄 · 큰 영문 제목)에는 짧은 영어를 쓴다. 나머지는 한국어.",
      "- 전화번호·이메일·주소·가격·날짜를 **지어내지 마라.** 그런 자리가 있으면",
      "  「프로필 링크에서 확인」처럼 어디서 보면 되는지로 채운다.",
      "",
      input.hasUserPhotos
        ? "`photoDirection`은 빈 문자열로 둬라 — 사용자가 올린 사진을 쓴다."
        : [
            "`photoDirection` — 사진 자리에 넣을 장면을 **영어**로 한 줄 묘사해라.",
            "  낱말 몇 개로 장면을 말한다 (예: `people hiking on a mountain trail at sunrise`).",
            "  주제와 대상에 맞아야 한다. 한국어·고유명사는 쓰지 마라.",
          ].join("\n"),
    ]
      .filter(Boolean)
      .join("\n"),
    schema: SHEET_COPY_SCHEMA,
    effort: "medium", // 결과물로 남는다 (PLAN §9)
  });

  /*
    AI가 범위를 벗어난 장 번호를 주면 버린다. 스키마로는 못 막는 값이라
    여기서 거른다 — 없는 장을 만들려다 통째로 실패하는 것보다 낫다.
    표지가 빠졌으면 앞에 끼워 넣는다.
  */
  const valid = (result.sheets ?? [])
    .filter((s) => Number.isInteger(s.index) && s.index >= 0 && s.index < sheets.length)
    .filter((s) => Array.isArray(s.lines) && s.lines.length > 0)
    .slice(0, exact ?? MAX_SHEETS);

  const withCover = valid.some((s) => s.index === 0)
    ? valid
    : [{ index: 0, lines: [input.title] }, ...valid].slice(0, exact ?? MAX_SHEETS);

  return { sheets: withCover, photoDirection: result.photoDirection ?? "" };
}
