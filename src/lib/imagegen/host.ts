import { readFile } from "node:fs/promises";
import path from "node:path";
import { getStorage } from "firebase-admin/storage";
import { getAdminApp } from "../firebase/admin";
import type { StyleId } from "../../types/card";

/**
 * 시안 템플릿을 **공개적으로 내려받을 수 있는 주소**로 만든다 (09-02).
 *
 * **왜 필요한가** — `gpt-image-2`의 image-edit은 `data:` URI를 받지 않는다.
 * 실제로 넣어보면 *"wrong image url, cause=image url download error"*로 거절한다.
 * 원본이 저장소 안 파일이라 어딘가에 올려서 주소를 줘야 한다.
 *
 * **토큰을 파일 경로에서 만든다.** 무작위로 만들면 올릴 때마다 주소가 달라져
 * 같은 템플릿을 몇 번이고 다시 올리게 된다. 경로가 같으면 주소도 같아야
 * 두 번째부터는 그냥 재사용된다.
 *
 * 담기는 건 우리 디자인 시안이라 비밀이 아니다 — 토큰은 «아무나 못 찾게» 하는
 * 정도의 역할이고, 사용자 데이터가 아니다.
 */

const TEMPLATE_DIR = path.join(process.cwd(), "src/lib/render/templates");

/** 이미 올린 것 — 프로세스가 사는 동안 재사용한다 */
const cache = new Map<string, string>();

function bucketName(): string | null {
  return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? null;
}

/**
 * 경로에서 만드는 고정 토큰.
 *
 * UUID 모양이어야 Firebase가 받아들인다. 경로 글자를 해시해서 16바이트를 채운다 —
 * 암호학적 강도가 필요한 자리가 아니라 «같은 입력이면 같은 값»이면 된다.
 */
function stableToken(key: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < key.length; i++) {
    h1 = Math.imul(h1 ^ key.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + key.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, "0");
  const raw = `${hex(h1)}${hex(h2)}${hex(h1 ^ 0x9e3779b9)}${hex(h2 ^ 0x7f4a7c15)}`;
  return [raw.slice(0, 8), raw.slice(8, 12), raw.slice(12, 16), raw.slice(16, 20), raw.slice(20, 32)].join("-");
}

export type HostResult = { ok: true; url: string } | { ok: false; reason: string };

/**
 * 템플릿 한 장을 올리고 주소를 돌려준다.
 *
 * 이미 올라가 있으면 다시 올리지 않는다 — 템플릿은 바뀌지 않는 파일이라
 * 카드를 만들 때마다 6장을 올릴 이유가 없다.
 */
export async function templateUrl(styleId: StyleId, file: string): Promise<HostResult> {
  const key = `${styleId}/${file}`;
  const hit = cache.get(key);
  if (hit) return { ok: true, url: hit };

  const bucket = bucketName();
  if (!bucket) return { ok: false, reason: "Storage 버킷이 설정되지 않았습니다." };

  // 파일 이름만 받는다 — `..`가 섞인 경로로 저장소 밖 파일을 올리지 못하게 한다
  if (file.includes("/") || file.includes("..")) {
    return { ok: false, reason: "잘못된 파일 이름입니다." };
  }

  const storagePath = `templates/${styleId}/${file}`;
  const token = stableToken(storagePath);
  const url =
    `https://firebasestorage.googleapis.com/v0/b/${bucket}` +
    `/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;

  try {
    const ref = getStorage(getAdminApp()).bucket(bucket).file(storagePath);
    const [exists] = await ref.exists();
    if (!exists) {
      const png = await readFile(path.join(TEMPLATE_DIR, styleId, file));
      await ref.save(png, {
        contentType: "image/png",
        metadata: { metadata: { firebaseStorageDownloadTokens: token } },
      });
    }
    cache.set(key, url);
    return { ok: true, url };
  } catch (e) {
    return { ok: false, reason: `템플릿을 올리지 못했습니다: ${e instanceof Error ? e.message : e}` };
  }
}
