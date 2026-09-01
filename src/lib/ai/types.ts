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
  }): Promise<CardDraft>;
};
