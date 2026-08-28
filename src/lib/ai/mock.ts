import "server-only";

import { AUDIENCES, AUDIENCE_DEFAULT, MAX_CARDS_PER_RUN, audiencePrompt } from "@/lib/audiences";
import { suffix을 } from "@/lib/josa";
import type { CardDraft, PlanningAI, PlanProposal, PlanTurnResult } from "./types";

/**
 * 대본형 모의 AI — ANTHROPIC_API_KEY 없이 F2·F3 흐름 전체를 돌리기 위한 구현.
 *
 * 진짜 AI가 아니다. 응답은 주제 문자열을 끼워 넣은 고정 문구다.
 * 고정 문구는 어떤 주제·분야에도 성립하는 것만 쓴다 (08-27 피드백).
 * 실구현이 붙으면 후보·기획의도는 주제를 이해하고 실시간으로 만들어진다.
 */

/** 사용자가 쓴 아이디어 문장을 주제로 다듬는 흉내 — 앞뒤 공백 제거 + 길이 제한 */
function toTopic(idea: string): string {
  const trimmed = idea.trim().replace(/\s+/g, " ");
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

/*
 * ② 단계 후보의 단일 출처는 lib/audiences.ts다 (08-28 확정).
 * 목적은 화면에서 고르지 않는다 — 대상에 딸려오므로 AI가 정하고,
 * 기획안 카드에서 수정할 수 있다.
 */

/** 대상별 기본 목적 — 직접 입력한 대상은 공감 얻기로 둔다 */
const PURPOSE_BY_AUDIENCE: Record<string, string> = {
  "나를 아는 사람": "공감 얻기",
  "나를 모르는 사람": "팔로우 유도",
  "이 주제를 찾는 사람": "정보 전달",
};

function purposesFor(audiences: string[]): string[] {
  const picked = audiences.map((a) => PURPOSE_BY_AUDIENCE[a] ?? "공감 얻기");
  return [...new Set(picked)];
}

function candidates(): PlanProposal {
  return { audiences: AUDIENCES.map((a) => a.label), purposes: [] };
}

const DEFAULT_AUDIENCE_LABEL =
  AUDIENCES.find((a) => a.id === AUDIENCE_DEFAULT)?.label ?? AUDIENCES[0].label;

/*
 * ① 주제 후보 — 「이미 사용자 안에 있는 재료」만 가리킨다 (08-28 확정).
 * 겪은 것 / 느낀 것 / 찍어둔 것. 제품 정체성은 머릿속에 있는 걸 꺼내는 것이므로
 * 없는 걸 만들게 하는 칩("공유"·"해결법"·"공개" 류)은 넣지 않는다.
 * 외부 트렌드·뉴스·콘텐츠 마케팅 템플릿에서 가져온 주제 금지.
 * 3개인 이유 — 칩은 보조, 입력창이 주인공. 4개가 2줄로 접히면 무게가 커진다.
 */
const TOPIC_DEFAULTS = ["이번 주에 있었던 일", "요즘 자주 하는 생각", "찍어두고 안 올린 사진"];

/** 온보딩 활동/콘텐츠 답변에서 핵심 단어를 뽑는다 — 못 뽑으면 null */
function coreWord(field: string): string | null {
  const generic = new Set(["기록", "일기", "공유", "리뷰", "콘텐츠", "계정", "이야기", "브이로그", "관련"]);
  const token = field
    .trim()
    .split(/\s+/)
    .find((t) => t && !generic.has(t));
  return token ?? null;
}

/**
 * 칩은 항상 3개 · 각 **띄어쓰기 포함 16자** 이내 (08-28 확정 — 중요한 건 글자 수가
 * 아니라 칩이 한 줄에 들어가느냐다). 하나라도 넘치면 기본형 전체를 쓴다
 */
function topicSuggestionsFor(field: string): string[] {
  const w = coreWord(field);
  if (!w) return TOPIC_DEFAULTS;
  const specialized = [
    `이번 주에 한 ${w}`,
    `요즘 ${w}하면서 드는 생각`,
    `찍어두고 안 올린 ${w} 사진`,
  ];
  const fits = (t: string) => t.length <= 16;
  return specialized.every(fits) ? specialized : TOPIC_DEFAULTS;
}

export const mockPlanningAI: PlanningAI = {
  async greeting(ctx): Promise<PlanTurnResult> {
    // ① 열린 질문 금지 — 후보 3개를 제시한다 (IA 2.1-① · 08-28 3개로 축소)
    return {
      reply: "오늘은 어떤 이야기를 해볼까요? 아래에서 골라도 되고, 직접 적어도 돼요.",
      topicSuggestions: topicSuggestionsFor(ctx.field),
    };
  },

  async ideaTurn(idea: string): Promise<PlanTurnResult> {
    const topic = toTopic(idea);
    return {
      reply: `「${topic}」 좋은데요! 누구에게 말할지만 정하면 바로 카드로 만들 수 있어요.\n\n아래에서 골라주세요. 안 고르셔도 제가 알아서 정할게요.`,
      topic,
      proposal: candidates(),
    };
  },

  async selectionTurn(topic: string, selected: PlanProposal): Promise<PlanTurnResult> {
    // 빈 선택이면 AI가 알아서 정하고 넘어간다 (IA 2.1-②)
    const audiences =
      selected.audiences.length > 0 ? selected.audiences : [DEFAULT_AUDIENCE_LABEL];
    // 목적은 대상에 딸려온다 (08-28 확정) — 기획안 카드에서 수정 가능
    const purposes = purposesFor(audiences);
    const picked = selected.audiences.length === 0;
    const intent = `「${topic}」${suffix을(topic)} ${audiences[0]}의 눈높이에서 ${purposes[0]} 중심으로 풀어내는 시리즈`;

    return {
      reply: [
        picked
          ? `제가 이렇게 골랐어요 — ${audiences.join(" · ")}에게, ${purposes.join(" · ")}. 바꾸고 싶으면 기획안 카드에서 고칠 수 있어요.`
          : `${audiences.join(" · ")}에게 ${purposes.join(" · ")} 방향으로 정리했어요.`,
        "",
        "마음에 들면 아래 「이대로 카드 만들기」를 눌러주세요.",
      ].join("\n"),
      topic,
      audiences,
      purposes,
      intent,
      seriesTitle: topic,
      readyToConfirm: true,
    };
  },

  async generateCard({ topic, audience }): Promise<CardDraft> {
    // 대상 하나당 카드 하나 — 대상별로 독립 생성된다 (08-28).
    // 진짜 AI는 AUDIENCES의 prompt를 지시문으로 받아 말투·도입부를 대상에 맞춘다
    const short = topic.length > 7 ? `${topic.slice(0, 7)}…` : topic;
    const meta = AUDIENCES.find((a) => a.label === audience);
    const suffix: Record<string, string> = {
      knows_me: "근황",
      stranger: "소개",
      seeker: "정보",
    };
    return {
      // 표기 규칙 — label을 변형하지 않고 조사는 「에게」 하나만 (08-28)
      title: `${topic} — ${audience}에게`,
      shortTitle: `${short}·${meta ? suffix[meta.id] : "이야기"}`,
      audience,
      // 기본 3종·커스텀 대상 모두 audiencePrompt 한 경로 — 커스텀도 지시 없이 만들지 않는다 (08-28)
      intent: `「${topic}」${suffix을(topic)} ${audience}에게. ${audiencePrompt(audience)}`,
    };
  },
};
