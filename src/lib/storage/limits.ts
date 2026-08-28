/**
 * 사진 업로드 제한값 (F13) — 서버와 화면이 **같은 숫자**를 본다.
 *
 * 이 파일에는 `server-only`를 붙이지 않는다. 클라이언트 컴포넌트도 import하기 때문이다.
 * 비밀은 들어 있지 않고 상한값뿐이라 브라우저에 노출돼도 문제가 없다.
 *
 * 화면의 검사는 «빨리 알려주기»용이고, 진짜 방어는 서버(`photos.ts`)와
 * Storage 보안 규칙(`storage.rules`) 두 곳에서 한다. 셋을 같은 값으로 맞춰야 한다.
 */

/** 렌더러(sharp)가 읽을 수 있는 형식만 */
export const PHOTO_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type PhotoContentType = (typeof PHOTO_CONTENT_TYPES)[number];

/** 장당 용량 상한. 휴대폰 원본 사진(대략 3~8MB)을 받아낼 수 있는 선 */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** 카드 1장에 붙일 수 있는 사진 수 — 슬라이드가 최대 8장이라 그보다 많을 이유가 없다 */
export const MAX_PHOTOS_PER_CARD = 8;

export function isAllowedContentType(v: unknown): v is PhotoContentType {
  return (
    typeof v === "string" &&
    (PHOTO_CONTENT_TYPES as readonly string[]).includes(v)
  );
}
