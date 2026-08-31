import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * 슬라이드에 들어갈 원격 이미지를 **data URI로 바꿔** satori에 넘긴다.
 *
 * satori는 원격 URL을 받아오지 못한다 — 넣으면
 * 「Image size cannot be determined」로 렌더링 자체가 실패한다
 * (`lib/render/layouts.ts`의 «원격 URL 페치는 render API에서 처리» 주석).
 *
 * **아무 주소나 받아오지 않는다.** 서버가 시키는 대로 외부에 요청을 보내는 코드는
 * 사내망을 훑는 통로가 될 수 있다(SSRF). 그래서 우리 Storage 버킷 호스트만 허용한다.
 */

/** 사용자 사진이 사는 곳. 여기가 아니면 받아오지 않는다 */
const ALLOWED_HOSTS = new Set(["firebasestorage.googleapis.com"]);

/** 슬라이드 한 장에 넣을 사진의 상한. 넘으면 렌더링이 느려지고 메모리를 먹는다 */
const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * 같은 카드를 다시 그릴 때마다 내려받지 않도록 프로세스 안에 담아둔다.
 * 서버가 재시작되면 사라지는 정도로 충분하다 — 완성 PNG는 어차피 저장하지 않는다(PLAN §6).
 */
const cache = new Map<string, string>();
const MAX_CACHE = 32;

/**
 * 원격 이미지를 data URI로. 받아오지 못하면 **null** —
 * 부르는 쪽이 사진 없이 그리도록 한다. 사진 하나 때문에 카드 전체가 안 나오면 안 된다.
 */
export async function toDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url; // 이미 data URI

  const cached = cache.get(url);
  if (cached) return cached;

  // 앱이 들고 있는 이미지(`/…` = public/) — 시드 데이터와 앞으로의 스톡 이미지가 여기 온다
  if (url.startsWith("/")) {
    const local = await readPublicImage(url);
    if (local) remember(url, local);
    return local;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) return null;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const type = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!ALLOWED_TYPES.has(type)) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return null;

    const dataUri = `data:${type};base64,${buf.toString("base64")}`;
    remember(url, dataUri);
    return dataUri;
  } catch {
    return null;
  }
}

/** 오래된 것부터 버린다 — 무한히 쌓이면 메모리를 먹는다 */
function remember(url: string, dataUri: string): void {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(url, dataUri);
}

const EXT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * `public/` 아래 파일을 읽어 data URI로.
 *
 * **경로를 벗어나지 못하게 막는다.** `/../../.env.local` 같은 값이 오면
 * 서버 파일을 그대로 이미지에 실어 내보내게 된다.
 */
async function readPublicImage(urlPath: string): Promise<string | null> {
  const root = path.join(process.cwd(), "public");
  const target = path.resolve(root, `.${decodeURIComponent(urlPath)}`);

  // resolve 결과가 public/ 밖이면 거부 (경로 탈출)
  if (target !== root && !target.startsWith(root + path.sep)) return null;

  const type = EXT_TYPE[path.extname(target).toLowerCase()];
  if (!type) return null;

  try {
    const buf = await readFile(target);
    if (buf.byteLength > MAX_BYTES) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null; // 없는 파일 — 사진 없이 그린다
  }
}
