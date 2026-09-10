/**
 * 새 기획 첫 인사 — 고정 문구 (09-09 확정).
 *
 * 예전에는 서버가 Claude에게 첫 인사를 쓰게 하고(`ai.greeting`) 그 문장을 plan 문서의
 * 첫 메시지로 저장했다. 그래서 화면에서 안내 문구를 바꿔도 칩을 고른 뒤에는 저장된
 * AI 인사(«안녕하세요, 오늘 올릴 거리…»)가 대화 기록으로 되돌아왔다.
 * 지금은 **서버가 이 문구를 그대로 첫 메시지로 저장**하고, 화면은 저장된 첫 메시지가
 * 이 문구와 같을 때만 앞 문장을 살짝 굵게 그린다. 옛 세션의 AI 인사는 보통 말풍선으로
 * 그대로 보인다 — 저장 데이터를 바꾸지 않는다.
 *
 * 클라이언트·서버가 함께 읽는다. 비밀이 아니므로 server-only를 걸지 않는다.
 * 온보딩 분야 컨텍스트는 여기와 무관하다 — 주제를 다듬는 턴(`ideaTurn`)이 계속 쓴다.
 */
export const PLAN_INTRO_LEAD = "올릴 게 없는 게 아니라, 정리가 안 된 거예요.";
export const PLAN_INTRO_REST = "떠오른 이야기 하나만 골라주세요.";
/** 저장·비교에 쓰는 한 줄 전체 */
export const PLAN_INTRO_TEXT = `${PLAN_INTRO_LEAD} ${PLAN_INTRO_REST}`;

/**
 * 첫 화면 칩을 띄우라는 신호.
 *
 * 화면은 `topicSuggestions`가 null이 아닐 때 ① 주제 칩을 그린다. 칩 문구는 화면에
 * 고정돼 있어(4개) 서버가 후보를 만들 필요가 없고, **빈 배열**이 그 신호 역할만 한다.
 */
export const PLAN_INTRO_TOPIC_SUGGESTIONS: string[] = [];

/**
 * 첫 화면 칩 4개 (09-09 확정 문구).
 *
 * **칩은 AI를 부르지 않는다.** 누르면 입력창의 안내 문구(`hint`)만 바뀌고 커서가
 * 입력창으로 간다. 주제는 사용자가 직접 적은 원문이 된다(`lib/plan/topic.ts`).
 * 예전에는 칩 문구가 곧바로 전송돼 AI가 온보딩 분야로 주제를 지어냈다.
 */
export const TOPIC_STARTERS: readonly { label: string; hint: string }[] = [
  { label: "최근 사진", hint: "최근 사진에 대해 적어주세요" },
  { label: "요즘 생각", hint: "요즘 드는 생각을 적어주세요" },
  { label: "소개할 것", hint: "소개하고 싶은 내용을 적어주세요" },
  { label: "직접 입력", hint: "자유롭게 적어주세요" },
];
