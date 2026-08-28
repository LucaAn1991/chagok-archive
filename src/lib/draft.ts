/**
 * AI 기획 대화 초안 — 뒤로가기·새로고침으로 날아가지 않게 localStorage에 저장 (08-28).
 *
 * 진입 시 초안이 있으면 **묻지 않고 복구**하고 상단에 얇은 배너 한 줄만 띄운다.
 * (F11 「이어서 기획하기」와는 다른 기능 — 그 라벨을 여기서 쓰지 않는다)
 *
 * 스펙 타입에 planId를 하나 보탰다 — 대화가 서버(plans 문서)에 쌓이므로
 * 같은 세션을 이어가려면 어떤 문서였는지가 필요하다.
 */
const KEY = "chagok:planning-draft";
const TTL = 1000 * 60 * 60 * 24 * 3; // 3일 지나면 버림

export type PlanningDraft = {
  planId: string;
  topic: string;
  audiences: string[]; // 제출 전 고르는 중이던 대상 칩
  messages: unknown[];
  step: string;
  savedAt: number;
};

export function saveDraft(d: Omit<PlanningDraft, "savedAt">) {
  try {
    if (!d.topic && !d.messages?.length) return; // 빈 초안은 저장하지 않는다
    localStorage.setItem(KEY, JSON.stringify({ ...d, savedAt: Date.now() }));
  } catch {}
}

export function loadDraft(): PlanningDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as PlanningDraft;
    if (!d.savedAt || Date.now() - d.savedAt > TTL) {
      clearDraft();
      return null;
    }
    if (!d.topic && !d.messages?.length) return null;
    if (!d.planId) return null;
    return d;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
