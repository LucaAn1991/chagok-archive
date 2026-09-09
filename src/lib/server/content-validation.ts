import "server-only";

/** 공지·FAQ 입력 검증 (백오피스 기획 §2-① 편집 규칙) — 생성·수정 라우트 공용 */

export function validateNotice(body: { title?: unknown; body?: unknown; level?: unknown }) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const level = body.level === "banner" ? "banner" : "normal";
  if (!title || title.length > 80) return { error: "제목은 1~80자로 적어주세요." } as const;
  if (!text) return { error: "본문을 적어주세요." } as const;
  return { title, body: text, level } as const;
}

export function validateFaq(body: { question?: unknown; answer?: unknown }) {
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!question || question.length > 100) return { error: "질문은 1~100자로 적어주세요." } as const;
  if (!answer) return { error: "답변을 적어주세요." } as const;
  return { question, answer } as const;
}
