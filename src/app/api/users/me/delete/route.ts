import { NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { adminAuth, adminDb, getAdminApp } from "@/lib/firebase/admin";
import { verifyRequest } from "@/lib/server/request-auth";

/**
 * POST /api/users/me/delete — 회원 탈퇴 시 개인정보 파기 (09-02 · 처리방침 3항).
 *
 * 방침이 약속한 것을 그대로 실행한다:
 *   - 아이디어 카드(plans·cards), 생성물, 업로드한 이미지: 탈퇴 시 지체 없이 삭제
 *   - 이메일 등 계정 정보(users 문서 · Auth 계정): 지체 없이 삭제
 *   - 동의 기록(consents): 방침 3항 보유 목록에 없어 함께 파기
 *
 * 🔴 소프트 삭제 금지 — isDeleted 플래그가 아니라 문서·파일을 실제로 지운다.
 * 🔴 업로드 이미지는 DB 레코드만 지우면 Storage에 파일이 남는다 — prefix로 파일까지 지운다.
 *
 * 방침 3항의 «남기는 항목»(부정 이용 기록 1년 · 이메일 해시 1년 · 결제 기록 5년)은
 * 현재 해당 데이터를 수집·저장하지 않아 처리할 것이 없다. 수집을 시작하면
 * 별도 저장소로 분리해 여기서 예외 처리해야 한다.
 *
 * 인스타그램 접근 토큰: 연동 기능 미구현 — 저장된 토큰이 없다. 구현 시 여기에
 * «즉시 삭제»를 추가해야 한다.
 *
 * 설정 화면 UI(창현 님)에서는 lib/legal/consent-client.ts의 deleteMyAccount()를 호출한다.
 */
export async function POST(request: Request) {
  const session = await verifyRequest(request);
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const uid = session.uid;

  try {
    // 1. 파기 대상 수집 — 이 사용자의 기획·카드 전부 (버린 카드 포함)
    const [plansSnap, cardsSnap, consentsSnap] = await Promise.all([
      adminDb.collection("plans").where("userId", "==", uid).get(),
      adminDb.collection("cards").where("userId", "==", uid).get(),
      adminDb.collection("consents").where("userId", "==", uid).get(),
    ]);

    // 2. Storage 파일 파기 — 업로드 사진(plans/·cards/ prefix)과 폰트(users/ prefix)
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (bucketName) {
      const bucket = getStorage(getAdminApp()).bucket(bucketName);
      const prefixes = [
        `users/${uid}/`,
        ...plansSnap.docs.map((d) => `plans/${d.id}/`),
        ...cardsSnap.docs.map((d) => `cards/${d.id}/`),
      ];
      // 파일 삭제 실패가 하나 있어도 나머지는 계속 지운다 — 남는 쪽이 더 나쁘다
      await Promise.all(
        prefixes.map((prefix) => bucket.deleteFiles({ prefix }).catch(() => {})),
      );
    }

    // 3. Firestore 문서 파기 — 배치 상한(500) 아래로 끊어서
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

    // 4. Auth 계정 삭제 — 이메일이 여기서 지워진다. 마지막에 지워야 위 단계가 인증으로 보호된다
    await adminAuth.deleteUser(uid);

    return NextResponse.json({ deleted: true });
  } catch {
    // 어디까지 지웠든 다시 호출하면 이어서 지워진다 (멱등에 가깝게)
    return NextResponse.json(
      { error: "탈퇴를 완료하지 못했어요. 한 번 더 시도해주세요." },
      { status: 500 },
    );
  }
}
