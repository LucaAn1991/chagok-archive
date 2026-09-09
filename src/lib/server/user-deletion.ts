import "server-only";

import { getStorage } from "firebase-admin/storage";
import { adminAuth, adminDb, getAdminApp } from "@/lib/firebase/admin";

/**
 * 회원 데이터 파기의 공용 본체 (09-08 · 백오피스 기획 §2-②) — 세 곳이 함께 쓴다:
 *   ① 본인 탈퇴  POST /api/users/me/delete
 *   ② 탈퇴 대행  POST /api/admin/members/[uid]/delete (CS — «탈퇴가 안 돼요»)
 *   ③ 잔여물 재실행  POST /api/admin/deletions/[id]/retry
 *
 * 파기 순서·범위는 처리방침 3항 그대로 (원래 ①에 있던 로직을 추출).
 * 시도 기록(deletion_attempts)의 수명도 여기서 관리한다 — 시작 시 쓰고
 * **전부 성공하면 지운다.** 남아 있는 문서 = 확인 필요 건.
 */

export type DeletionResult =
  | { ok: true; storageFailures: string[] }
  | {
      ok: false;
      failedStep: "storage" | "firestore" | "auth";
      error: string;
      storageFailures: string[];
    };

export async function destroyUser(uid: string): Promise<DeletionResult> {
  const attemptRef = adminDb.collection("deletion_attempts").doc();
  let step: "storage" | "firestore" | "auth" = "storage";
  const storageFailures: string[] = [];
  // 기록 실패가 파기를 막지는 않는다 — 파기가 우선이다
  await attemptRef
    .set({ uid, status: "running", startedAt: new Date().toISOString() })
    .catch((e) => console.error("[user-deletion] 시도 기록 실패", e));

  try {
    // 1. 파기 대상 수집 — 이 사용자의 기획·카드 전부 (버린 카드 포함)
    const [plansSnap, cardsSnap, consentsSnap] = await Promise.all([
      adminDb.collection("plans").where("userId", "==", uid).get(),
      adminDb.collection("cards").where("userId", "==", uid).get(),
      adminDb.collection("consents").where("userId", "==", uid).get(),
    ]);

    // 2. Storage 파일 파기 — 실패해도 나머지는 계속 지우되, 실패 prefix는 기록한다
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (bucketName) {
      const bucket = getStorage(getAdminApp()).bucket(bucketName);
      const prefixes = [
        `users/${uid}/`,
        ...plansSnap.docs.map((d) => `plans/${d.id}/`),
        ...cardsSnap.docs.map((d) => `cards/${d.id}/`),
      ];
      await Promise.all(
        prefixes.map((prefix) =>
          bucket.deleteFiles({ prefix }).catch(() => {
            storageFailures.push(prefix);
          }),
        ),
      );
    }

    // 3. Firestore 문서 파기 — 배치 상한(500) 아래로 끊어서
    step = "firestore";
    const refs = [
      ...plansSnap.docs.map((d) => d.ref),
      ...cardsSnap.docs.map((d) => d.ref),
      ...consentsSnap.docs.map((d) => d.ref),
      adminDb.collection("users").doc(uid),
    ];
    for (let i = 0; i < refs.length; i += 450) {
      const batch = adminDb.batch();
      refs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    // 4. Auth 계정 삭제 — 이메일이 여기서 지워진다. 마지막이어야 앞 단계가 인증으로 보호된다.
    //    계정이 이미 없으면(재실행) 성공으로 본다
    step = "auth";
    await adminAuth.deleteUser(uid).catch((e) => {
      if ((e as { code?: string })?.code === "auth/user-not-found") return;
      throw e;
    });

    if (storageFailures.length > 0) {
      await attemptRef
        .set({
          uid,
          status: "partial",
          failedStep: "storage",
          storageFailures,
          finishedAt: new Date().toISOString(),
        })
        .catch((e) => console.error("[user-deletion] 시도 기록 실패", e));
    } else {
      await attemptRef
        .delete()
        .catch((e) => console.error("[user-deletion] 시도 기록 정리 실패", e));
    }
    return { ok: true, storageFailures };
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300);
    await attemptRef
      .set({
        uid,
        status: "failed",
        failedStep: step,
        storageFailures,
        error,
        finishedAt: new Date().toISOString(),
      })
      .catch((logErr) => console.error("[user-deletion] 시도 기록 실패", logErr));
    return { ok: false, failedStep: step, error, storageFailures };
  }
}
