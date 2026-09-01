/**
 * ⛔️ 클라이언트 코드에서 import 금지 — Admin SDK를 쓴다.
 *
 * 사용자 사진 업로드(F13)의 서버측 규칙을 한곳에 모은다.
 *
 * **업로드는 서버를 거치지 않는다.** 서버는 「이 경로에 이 형식으로 올려도 좋다」는
 * 서명 URL만 발급하고, 파일 본체는 브라우저 → Storage로 바로 간다 (PLAN.md §6).
 * 덕분에 App Hosting 인스턴스가 사진 용량만큼의 메모리·시간을 쓰지 않는다.
 *
 * 버킷이 아직 없을 수 있다 (PLAN.md §8 TODO — Blaze 업그레이드 대기).
 * 그래서 이 모듈은 **던지는 대신 상태를 돌려준다.** 사진은 «없으면 넘어가는» 재료라
 * (DESIGN.md §12) 버킷이 없다고 재료 추가 화면 전체가 죽으면 안 된다.
 */

import "server-only";

import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";
import { getAdminApp } from "@/lib/firebase/admin";
import type { PhotoContentType } from "./limits";

/** 서명 URL 유효 시간. 업로드를 시작하기에 충분하고, 새어 나가도 금방 죽는 길이 */
const UPLOAD_URL_TTL_MS = 10 * 60 * 1000;

const EXTENSION: Record<PhotoContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * 사진이 붙는 대상 — 기획(plan) 또는 카드(card).
 *
 * 기획 단계에서 올린 사진은 `plans/`에 한 번만 두고, 카드에는 **주소만 물려준다**
 * (08-31). 대상이 여럿이면 카드도 여럿인데 같은 파일을 여러 벌 둘 이유가 없다.
 */
export type PhotoOwner = "plans" | "cards";

/**
 * 저장 경로 — `{plans|cards}/{id}/photos/{uuid}.{ext}`
 *
 * 파일명은 사용자가 준 이름을 쓰지 않고 새로 만든다. 원본 이름에는 경로 문자나
 * 개인정보가 섞일 수 있고, 같은 이름을 다시 올리면 앞의 것을 덮어쓴다.
 */
export function buildPhotoPath(
  owner: PhotoOwner,
  id: string,
  contentType: PhotoContentType,
): string {
  return `${owner}/${id}/photos/${randomUUID()}.${EXTENSION[contentType]}`;
}

/** 버킷 이름은 클라이언트 설정과 같은 값을 본다 — 둘이 갈라지면 찾기 어려운 버그가 된다 */
function bucketName(): string | null {
  return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || null;
}

export type UploadTicket = {
  /** 브라우저가 PUT할 주소 */
  uploadUrl: string;
  /**
   * PUT에 **그대로** 실어야 하는 헤더.
   *
   * 서명은 헤더까지 포함해 계산된다. 하나라도 빠지거나 다르면 Storage가 403으로 거절한다.
   * 클라이언트가 헤더 이름을 외우지 않도록 서버가 완성해서 내려준다.
   */
  headers: Record<string, string>;
  /** 업로드 후 Firestore `photoUrls`에 넣을 영구 주소 */
  readUrl: string;
  /** 저장 경로 — 삭제·재발급에 쓴다 */
  path: string;
};

export type IssueResult =
  | { ok: true; ticket: UploadTicket }
  | { ok: false; reason: "storage_not_configured" | "signing_failed" };

/**
 * 업로드용 서명 URL을 발급한다.
 *
 * 다운로드 토큰(`firebaseStorageDownloadTokens`)을 **업로드 시점에 같이 심는다.**
 * 업로드가 끝나면 추가 왕복 없이 바로 쓸 수 있는 영구 URL이 생긴다 —
 * 서명된 읽기 URL은 최대 7일이라 `photoUrls`에 저장할 수 없다.
 */
export async function issueUploadTicket(
  owner: PhotoOwner,
  id: string,
  contentType: PhotoContentType,
): Promise<IssueResult> {
  const name = bucketName();
  if (!name) return { ok: false, reason: "storage_not_configured" };

  const path = buildPhotoPath(owner, id, contentType);
  const downloadToken = randomUUID();

  try {
    const bucket = getStorage(getAdminApp()).bucket(name);

    // 버킷이 아직 없으면 여기서 걸러진다 — 업로드를 시도하게 두면 원인이 브라우저까지 안 온다
    const [exists] = await bucket.exists();
    if (!exists) return { ok: false, reason: "storage_not_configured" };

    // 이 헤더들까지 포함해 서명한다. 브라우저가 빠뜨리면 업로드가 거부된다
    const extensionHeaders = {
      "x-goog-meta-firebaseStorageDownloadTokens": downloadToken,
    };

    const [uploadUrl] = await bucket.file(path).getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + UPLOAD_URL_TTL_MS,
      contentType,
      extensionHeaders,
    });

    return {
      ok: true,
      ticket: {
        uploadUrl,
        path,
        headers: { "Content-Type": contentType, ...extensionHeaders },
        readUrl: downloadUrl(name, path, downloadToken),
      },
    };
  } catch {
    // 자격증명 없음·권한 부족·네트워크 등. 원인은 서버 로그에 남고 사용자에겐 «준비 중»으로 보인다
    return { ok: false, reason: "signing_failed" };
  }
}

/** 다운로드 토큰이 붙은 영구 URL — 토큰을 모르면 열 수 없다 */
function downloadUrl(bucket: string, path: string, token: string): string {
  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucket}` +
    `/o/${encodeURIComponent(path)}?alt=media&token=${token}`
  );
}
