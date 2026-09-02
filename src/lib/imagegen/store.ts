import { getStorage } from "firebase-admin/storage";
import { getAdminApp } from "../firebase/admin";

/**
 * 완성된 카드 이미지를 Storage에 둔다 (09-02).
 *
 * **왜 저장하는가** — 지금까지 카드뉴스는 **저장하지 않고 요청 시 즉석 렌더링**했다
 * (PLAN §6, 08-27 확정). 렌더러는 장당 5~10ms라 그래도 됐다.
 * 그림 생성은 **장당 2분**이라 그럴 수 없다. 한 번 만든 것을 파일로 남겨야 한다.
 *
 * **경로에 순서를 쓴다** — `cards/{cardId}/slides/{order}.png`.
 * 같은 장을 다시 만들면 같은 경로에 덮어쓴다. 그러면 옛 파일이 쌓이지 않고,
 * 「이 장만 다시 만들기」를 눌러도 주소가 그대로라 화면이 알아서 새 그림을 받는다.
 *
 * ⚠️ **덮어쓰면 브라우저 캐시가 옛 그림을 계속 보여준다.** 그래서 다시 만들 때마다
 * 토큰을 새로 발급한다 — 주소가 달라지므로 캐시를 타지 않는다.
 * (미리보기에서 같은 실수를 한 번 했다. `PREVIEW_VERSION` 참조)
 */

function bucketName(): string | null {
  return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? null;
}

export type StoreResult = { ok: true; url: string } | { ok: false; reason: string };

/**
 * 한 장을 저장하고 영구 주소를 돌려준다.
 *
 * 서명된 읽기 URL은 최대 7일이라 카드에 저장할 수 없다. 대신 업로드 시점에
 * **다운로드 토큰을 심어** 토큰이 붙은 영구 주소를 만든다 —
 * 사용자 사진(`lib/storage/photos.ts`)이 쓰는 방식과 같다.
 */
export async function storeSlideImage(input: {
  cardId: string;
  order: number;
  png: Buffer;
}): Promise<StoreResult> {
  const bucket = bucketName();
  if (!bucket) return { ok: false, reason: "Storage 버킷이 설정되지 않았습니다." };

  const path = `cards/${input.cardId}/slides/${input.order}.png`;
  // 다시 만들 때마다 새 토큰 — 주소가 바뀌어야 브라우저가 새 그림을 받는다
  const token = crypto.randomUUID();

  try {
    await getStorage(getAdminApp())
      .bucket(bucket)
      .file(path)
      .save(input.png, {
        contentType: "image/png",
        metadata: { metadata: { firebaseStorageDownloadTokens: token } },
      });

    return {
      ok: true,
      url:
        `https://firebasestorage.googleapis.com/v0/b/${bucket}` +
        `/o/${encodeURIComponent(path)}?alt=media&token=${token}`,
    };
  } catch (e) {
    // 원인은 서버 로그로, 사용자에겐 «그 장만 렌더러로» 물러선다
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
