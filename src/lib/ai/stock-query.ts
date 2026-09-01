import "server-only";

import { BASE_SYSTEM, callJson, isClaudeConfigured, obj, STR } from "./client";

/**
 * 기획 주제(한국어) → 스톡 검색어(영어) — 09-01 신설.
 *
 * 왜 필요한가: Pexels는 영어 검색이 훨씬 정확하다 (`lib/stock/index.ts`).
 * 제작 단계는 슬라이드마다 Claude가 `imageQuery`를 함께 내주지만
 * (`lib/ai/slides.ts`), 기획 단계에는 아직 슬라이드가 없다.
 * 주제 하나로 후보를 보여줘야 해서 검색어도 따로 만든다.
 *
 * **노력 수준은 `low`다.** 사용자가 화면에서 기다리는 데다,
 * 하는 일이 «짧은 영어 명사구 만들기»뿐이라 더 들일 이유가 없다 (PLAN §9).
 *
 * 실패하면 던지지 않고 `null`을 준다 — 사진은 «있으면 쓰는» 재료라
 * 여기서 막히면 기획 화면 전체가 멈춘다 (DESIGN §12).
 */
export async function toStockQuery(topic: string): Promise<string | null> {
  const trimmed = topic.trim();
  if (!trimmed || !isClaudeConfigured()) return null;

  try {
    const result = await callJson<{ query: string }>({
      system: BASE_SYSTEM,
      user: [
        "아래 인스타그램 콘텐츠 주제에 어울리는 **사진**을 무료 스톡 사이트에서 찾으려 한다.",
        "검색에 쓸 영어 단어를 만들어라.",
        "",
        `주제: ${trimmed}`,
        "",
        "규칙:",
        "- 영어 소문자 명사구. 2~4단어.",
        "- 눈에 보이는 장면을 적는다. 추상적인 말(success, growth, mindset)은 쓰지 않는다.",
        "- 사람 이름·상호·상표를 넣지 않는다.",
        "- 예: 「아침 루틴 공유」 → morning coffee desk",
      ].join("\n"),
      schema: obj({ query: STR }, ["query"]),
      effort: "low",
    });

    const query = result.query?.trim();
    return query ? query : null;
  } catch {
    // 검색어를 못 만들면 후보를 못 보여줄 뿐이다 — 기획은 계속된다
    return null;
  }
}
