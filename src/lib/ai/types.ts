/**
 * AI 기획 대화(F2)의 추상화 — 화면·API는 이 인터페이스만 안다.
 *
 * 흐름은 IA 2.1의 3단계다 (08-27 IA 원안 확정):
 *   ① 주제 확인 — 주제가 전혀 없을 때만. **후보 4개 제시 · 열린 질문 금지**
 *   ② 대상·목적 선택 — 후보 4~5개 + 기타 입력 · 멀티 선택. **안 고르면 AI가 알아서 정한다**
 *   ③ 카드 생성 — 주제 × 대상 · 하한 1 · 상한 없음
 *
 * 구현이 둘이다:
 * - mock.ts  : 대본형 모의 응답. ANTHROPIC_API_KEY가 없을 때 (지금)
 * - @TODO    : Anthropic Claude 실구현 — 키 발급 후 @anthropic-ai/sdk 설치와 함께
 */

/** ② 단계 후보 — 대상 4~5개 + 목적 (PLAN §3-1 F2) */
export type PlanProposal = {
  audiences: string[];
  purposes: string[];
};

/** 대화 1턴의 결과 */
export type PlanTurnResult = {
  reply: string; // AI 말풍선에 그대로 들어간다
  topicSuggestions?: string[]; // ① 단계 — 주제가 없을 때 제시하는 후보 4개
  topic?: string;
  proposal?: PlanProposal; // ② 단계 후보를 제시하는 턴이면 채워진다
  audiences?: string[]; // 선택이 끝나 확정된 값
  purposes?: string[];
  intent?: string;
  seriesTitle?: string;
  readyToConfirm?: boolean; // true면 ③ 카드 생성으로 넘어갈 수 있다
};

/** 대화에 필요한 맥락 — user 문서의 온보딩 값 일부 (PLAN §2-1) */
export type PlanningContext = {
  field: string; // 활동 분야
  tone: string; // 말투
};

/** F3 — 시리즈 분해 결과. 주제 × 대상 → 카드 N장 (하한 1) */
export type CardDraft = {
  title: string;
  shortTitle: string; // 12자 내외 — 캘린더 월간 칸용 (DESIGN §8)
  audience: string; // plan.audiences 중 하나
  intent: string;
};

/**
 * ⑤ 다듬기 한 턴 (09-02).
 *
 * ③에서 만든 기획안 하나를 사용자와 주고받으며 고친다. 고칠 수 있는 것은 넷:
 * **세부 내용 · 카드 장수 · 제목 · 기획의도.** 말투와 피할 표현은 여기서 다루지 않는다 —
 * 그건 기획 하나가 아니라 계정 전체의 성격이라 설정에 있다.
 */
export type RefineDraftInput = {
  topic: string;
  /** 지금까지의 기획안 — 사용자가 고쳐온 결과가 누적돼 있다 */
  draft: {
    audience: string;
    title: string;
    shortTitle: string;
    intent: string;
    extraNote: string;
    slideCount: number | null;
    /** ⑤에서 좁힌 대상 (09-03). 비어 있을 수 있다 */
    targeting?: import("../../types/plan").Targeting;
  };
  /** 이 기획안에 대해 지금까지 주고받은 말 (이 기획안 것만) */
  history: { role: "user" | "assistant"; text: string }[];
  /** 사용자가 방금 한 말 */
  message: string;
};

export type { DraftVariant } from "../../types/plan";
import type { DraftVariant } from "../../types/plan";

export type RefineDraftResult = {
  /** 말풍선에 들어갈 답 */
  reply: string;
  /** 고쳐진 기획안. 안 바뀐 값은 들어온 값 그대로 돌아온다 */
  draft: {
    title: string;
    shortTitle: string;
    intent: string;
    extraNote: string;
    slideCount: number | null;
  };
};

/**
 * 답이 만들어지는 동안 말풍선에 글자를 흘려보내는 콜백.
 *
 * 실측(08-31): 전체 응답은 11초가 걸리는데 **첫 글자는 1.2초**에 온다.
 * 다 만들어질 때까지 기다렸다 한 번에 보여주면 그 차이가 통째로 대기 시간이 된다.
 *
 * 넘기지 않아도 되고(그때는 완성본만 돌아온다), 모의 AI는 무시한다.
 */
export type OnText = (delta: string) => void;

export type PlanningAI = {
  /** ① 주제 확인 — 주제가 전혀 없을 때만. 후보 4개를 제시한다 (열린 질문 금지) */
  greeting(ctx: PlanningContext, onText?: OnText): Promise<PlanTurnResult>;

  /** 사용자의 아이디어로 주제를 확정하고 ② 단계 후보(대상 4~5 + 목적)를 제시한다 */
  ideaTurn(idea: string, ctx: PlanningContext, onText?: OnText): Promise<PlanTurnResult>;

  /** ② 선택 반영 — 빈 배열이면 AI가 알아서 정하고 넘어간다 */
  selectionTurn(
    topic: string,
    selected: PlanProposal,
    ctx: PlanningContext,
    onText?: OnText,
  ): Promise<PlanTurnResult>;

  /**
   * ③ 카드 생성 — **대상 하나당 독립 호출** (08-28 확정).
   * «나를 아는 사람»(자기소개 금지)과 «나를 모르는 사람»(자기소개 필수)은 지시가
   * 정반대라, 여러 대상을 한 프롬프트에 섞으면 어중간한 글 하나가 나온다.
   * 호출 측(confirm API)이 Promise.all로 대상별로 부른다.
   */
  generateCard(input: {
    topic: string;
    audience: string;
    purposes: string[];
    intent: string; // plan 수준 기획의도 — 참고 맥락. 카드의 기획의도는 대상별로 만든다
    // 기획 단계(②)에서 받은 세부 대상 — 연령·성별·말투·시간대. 기획안 문구를 그 사람에 맞춘다 (09-03)
    targeting?: import("../../types/plan").Targeting;
  }): Promise<CardDraft>;

  /**
   * ⑤ 기획안 다듬기 — 고른 기획안 하나를 대화로 고친다 (09-02).
   *
   * **건너뛸 수 있는 단계다.** 대상을 셋 고르면 다듬기도 세 번이라, 매번 강제하면
   * 그 자리가 이탈 구간이 된다. 안 부르면 ③에서 만든 값이 그대로 카드가 된다.
   */
  refineDraft(input: RefineDraftInput, onText?: OnText): Promise<RefineDraftResult>;

  /**
   * ⑤ 다듬기 후보 — 같은 기획안을 다른 각도로 2~3개 다시 잡는다 (09-02).
   *
   * 다듬기 화면을 열 때 한 번만 부른다. 열지 않은 기획안에는 부르지 않는다 —
   * 셋을 만들면 셋 다 후보를 뽑는 셈이라, 쓰지도 않을 값에 시간과 비용이 든다.
   */
  draftVariants(input: {
    topic: string;
    audience: string;
    title: string;
    intent: string;
  }): Promise<DraftVariant[]>;
};
