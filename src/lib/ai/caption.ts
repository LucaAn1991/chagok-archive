import "server-only";

import { AUDIENCES, audiencePrompt } from "../audiences";
import { toneDirective } from "../tone";
import { BASE_SYSTEM, STR, STR_ARRAY, callJson, isClaudeConfigured, obj } from "./client";
import { buildPreferenceDirective } from "./preferences";
import type { Caption } from "../../types/card";
import type { ToneKey, User } from "../../types/user";

/**
 * 캡션 생성 (F7) — Hook · Body · CTA · Hashtag.
 *
 * ANTHROPIC_API_KEY가 없으면 **목(mock) 모드**로 동작한다:
 * 고정된 샘플 캡션을 반환해 UI·저장·에러 처리를 키 없이 개발할 수 있다.
 * 목 데이터에는 「(개발용 샘플)」 표시를 넣어 실제 생성물과 혼동되지 않게 한다.
 *
 * @TODO: 실제 Claude 호출 구현 — API 키 충전 후.
 *   - 모델: claude-opus-5 (PLAN.md §9 확정) · @anthropic-ai/sdk
 *   - 구조화 출력: client.messages.parse + zodOutputFormat — **zod 설치 승인 필요**
 *   - user.tone을 말투 지시로, avoidExpressions를 금지 목록으로 프롬프트에 반영
 *   - visualPreferences는 buildPreferenceDirective()로 지시문을 만들어 시스템
 *     프롬프트에 넣는다 (src/lib/ai/preferences.ts — 취향의 문구 톤 반영, 08-31)
 *   - 실패 시 자동 1회 재시도 (PRD §5-7)
 *   - 1턴 5초 제약: effort 'low' + 스트리밍 검토, p50/p95 실측 (PLAN §9)
 */

export type CaptionInput = {
  title: string; // 카드 주제
  audience: string; // 겨냥한 대상
  intent: string; // 기획의도
  extraNote: string; // «이번에 꼭 넣을 내용»
  tone: ToneKey | null; // null = 아직 안 정함 → 기본 말투 (08-28 온보딩 축소)
  avoidExpressions: string[];
  /** 온보딩 게시물 취향 — 실호출 시 buildPreferenceDirective()로 프롬프트에 반영 (08-31) */
  visualPreferences?: User["visualPreferences"];
};

/** 실제 Claude 호출이 가능한 상태인가 — 키가 없으면 목 모드 */
export { isClaudeConfigured };

const CAPTION_SCHEMA = obj(
  { hook: STR, body: STR, cta: STR, hashtags: STR_ARRAY },
  ["hook", "body", "cta", "hashtags"],
);

/** 인스타 캡션이 길어지면 «더 보기»에 잘린다. 상한을 넘으면 자른다 */
const MAX_BODY = 1500;
const MAX_HASHTAGS = 10;

export async function generateCaption(input: CaptionInput): Promise<Caption> {
  if (!isClaudeConfigured()) {
    return mockCaption(input);
  }

  const directives = [
    toneDirective(input.tone),
    buildPreferenceDirective(input.visualPreferences),
    input.avoidExpressions.length
      ? `다음 표현은 절대 쓰지 마라: ${input.avoidExpressions.join(", ")}.`
      : null,
  ].filter(Boolean);

  const result = await callJson<{
    hook: string;
    body: string;
    cta: string;
    hashtags: string[];
  }>({
    system: [BASE_SYSTEM, "", ...directives].join("\n"),
    user: [
      `주제: ${input.title}`,
      `읽는 사람: ${input.audience}`,
      `대상별 지시: ${audiencePrompt(input.audience)}`,
      input.intent ? `기획의도: ${input.intent}` : "",
      input.extraNote ? `**이번에 꼭 넣어야 하는 것: ${input.extraNote}**` : "",
      "",
      "이 게시물의 인스타그램 캡션을 써라. 네 부분으로 나눈다.",
      "",
      "- hook — 첫 문장. 여기서 멈추지 않으면 나머지는 읽히지 않는다. 한 문장.",
      "- body — 본문. 짧은 문단으로 나눠 읽기 편하게. 줄바꿈을 써도 된다.",
      "- cta — 마지막 한 줄. 저장·댓글·팔로우 중 이 글에 자연스러운 것 하나만.",
      "- hashtags — 5~8개. **#을 붙이지 말고 낱말만** 넣어라. 검색될 만한 말로.",
      "",
      "쓰지 말 것: 낚시성 과장, 근거 없는 숫자, 남의 후기인 척하는 문장.",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: CAPTION_SCHEMA,
    effort: "medium", // 결과물로 남는다 — 대화 턴보다 한 단계 위 (PLAN §9)
  });

  return {
    hook: result.hook,
    body: result.body.slice(0, MAX_BODY),
    cta: result.cta,
    // 화면이 «#»을 붙여 보여주므로 여기서는 낱말만 남긴다 (모델이 붙여 보내도 정리)
    hashtags: result.hashtags
      .filter((t) => typeof t === "string" && t.trim())
      .map((t) => t.replace(/^#+/, "").trim())
      .filter(Boolean)
      .slice(0, MAX_HASHTAGS),
  };
}

/**
 * 대상별 도입부 — lib/audiences.ts의 prompt 지시를 목에서도 흉내 낸다 (08-28).
 * knows_me는 자기소개 없이 근황처럼, stranger는 자기소개 한 줄 필수, seeker는 정보 밀도.
 * 실AI 프롬프트에도 같은 지시(AUDIENCES[].prompt)가 들어간다.
 */
function mockHook(input: CaptionInput): string {
  const meta = AUDIENCES.find((a) => a.label === input.audience);
  switch (meta?.id) {
    case "knows_me":
      // 자기소개 금지 — 이미 아는 사이, 근황을 나누듯
      return `(개발용 샘플) 다들 잘 지내죠? 요즘 「${input.title}」 근황이에요.`;
    case "stranger":
      // 자기소개 필수 — 화자가 누구인지 한 줄로
      return `(개발용 샘플) 처음 뵙는 분들께 — 저는 「${input.title}」 이야기를 하는 사람이에요.`;
    case "seeker":
      // 정보 밀도 최우선 — 검색될 단어를 앞세운다
      return `(개발용 샘플) ${input.title}, 핵심만 정리했어요.`;
    default:
      return `(개발용 샘플) ${input.title}`;
  }
}

/** 개발용 샘플 캡션 — 입력값을 반영해 화면에서 흐름을 확인할 수 있게 한다 */
function mockCaption(input: CaptionInput): Caption {
  return {
    hook: mockHook(input),
    body: [
      `${input.audience}에게 전하는 이야기예요.`,
      input.intent ? `기획의도: ${input.intent}` : null,
      input.extraNote ? `꼭 넣을 내용: ${input.extraNote}` : null,
      "실제 캡션은 Claude 연동 후 이 자리에 생성됩니다.",
    ]
      .filter(Boolean)
      .join("\n"),
    cta: "저장해두고 나중에 다시 봐요.",
    hashtags: ["개발용샘플", "차곡"],
  };
}
