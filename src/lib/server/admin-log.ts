import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

/**
 * 감사 로그 `admin_logs` (백오피스 기획 §2-⑥) — append-only.
 *
 * - 수정·삭제 API를 만들지 않는다. 고칠 수 있는 감사 로그는 감사 로그가 아니다.
 * - 클라이언트 쓰기는 firestore.rules 기본 차단에 걸린다 (규칙에 안 열었음).
 * - before/after에 **사용자 개인정보 값을 담지 않는다** — 로그가 제2의
 *   개인정보 저장소가 되면 안 된다. 설정·콘텐츠류의 변경만 담는다.
 */

/** 기록하는 행위. 새 admin 기능을 만들면 여기에 먼저 추가한다 */
export type AdminAction =
  | "admin.login"
  | "admin.logout"
  | "admin.grant"
  | "admin.revoke"
  | "flags.toggle"
  | "config.update"
  | "user.suspend"
  | "user.unsuspend"
  | "user.delete_account" // 탈퇴 대행 + 잔여물 재실행
  | "user.view_private" // 대화 내용·업로드 사진 열람 — «봤다»는 사실만 남긴다
  | "inquiry.answer"
  | "notice.create"
  | "notice.update"
  | "notice.delete"
  | "faq.create"
  | "faq.update"
  | "faq.delete"
  | "template.update" // 진열 변경 — 노출/숨김·순서·표시 이름
  | "user.export" // 회원 목록 CSV 반출 — 개인정보 반출이라 사유 필수
  | "log.export"; // 감사 로그 CSV 반출
// @TODO: 설정 확장·5단계에서 추가 — legal.publish · notification.* (백오피스 기획 §2-⑥ 표)

/** reason 없이는 기록을 거부하는 행위 (기획 §2-⑥) */
const REASON_REQUIRED: ReadonlySet<AdminAction> = new Set([
  "admin.grant",
  "admin.revoke",
  "flags.toggle",
  "user.suspend",
  "user.unsuspend",
  "user.delete_account",
  "user.view_private",
  "user.export",
]);

export type AdminLogInput = {
  actorUid: string;
  /** 관리자 계정이 사라져도 로그는 읽혀야 해서 이메일을 복사 저장한다 */
  actorEmail: string;
  action: AdminAction;
  targetType: "user" | "config" | "flags" | "admin" | "notice" | "faq" | "template";
  targetId: string;
  reason?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
};

/**
 * 한 건 기록. 실패하면 던진다 — 기록 없이 행위만 성공하는 것을 허용하지 않는다.
 * (호출 측은 행위 «성공 후» 기록하고, 기록 실패면 500으로 답한다)
 */
export async function logAdminAction(input: AdminLogInput): Promise<void> {
  if (REASON_REQUIRED.has(input.action) && !input.reason?.trim()) {
    throw new Error(`${input.action}에는 사유(reason)가 필요합니다.`);
  }
  await adminDb.collection("admin_logs").add({
    ...input,
    reason: input.reason?.trim() || null,
    before: input.before ?? null,
    after: input.after ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    at: FieldValue.serverTimestamp(),
  });
}
