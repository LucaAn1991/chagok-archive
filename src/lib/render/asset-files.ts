import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * 장식 그림 파일을 satori가 받을 수 있는 형태로 읽는다 (09-02).
 *
 * **satori는 파일 경로도 원격 주소도 못 읽는다.** `<img src>`에 data URI를 직접
 * 넣어줘야 한다 (`lib/render/fetch-image.ts`가 스톡 사진에 하는 일과 같다).
 *
 * 한 번 읽으면 프로세스가 사는 동안 담아둔다. 장식은 카드마다 같은 파일이라
 * 매번 디스크를 두드릴 이유가 없다.
 *
 * **`server-only`를 붙이지 않는다.** 렌더러(`render-slide.ts`)와 같은 경로에 있는데
 * 그 경로는 스크립트(`scripts/render-smoke.ts` 등)에서도 돌아야 하고, `server-only`는
 * Next.js 밖에서 곧바로 터진다. 대신 이 파일은 화면 코드에서 import하지 않는다.
 */

const DIR = path.join(process.cwd(), "src/lib/render/assets");

/** 파일 이름 → data URI. 없는 파일은 null로 담아 다시 안 찾는다 */
const cache = new Map<string, string | null>();

/**
 * **없으면 null이다. 던지지 않는다.**
 * 그림 하나가 없다고 카드 제작 전체가 죽으면 안 된다 — 그 장식만 빠지고
 * 나머지는 그대로 그려진다 (DESIGN.md §12 «어디서 멈춰도 완성된다»).
 */
export async function assetDataUri(file: string): Promise<string | null> {
  const hit = cache.get(file);
  if (hit !== undefined) return hit;

  /*
    파일 이름만 받는다 — `..`가 섞인 경로로 저장소 밖 파일을 읽지 못하게 한다.
    지금은 우리 코드만 부르지만, 나중에 사용자 값이 흘러들어와도 막힌다.
  */
  if (file.includes("/") || file.includes("..")) {
    cache.set(file, null);
    return null;
  }

  try {
    const buf = await readFile(path.join(DIR, file));
    const uri = `data:image/png;base64,${buf.toString("base64")}`;
    cache.set(file, uri);
    return uri;
  } catch {
    cache.set(file, null);
    return null;
  }
}

/** 여러 장을 한 번에 — 없는 것은 빠진 채로 돌아온다 */
export async function assetDataUris(files: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(files)];
  const loaded = await Promise.all(unique.map(async (f) => [f, await assetDataUri(f)] as const));
  return Object.fromEntries(loaded.filter((e): e is [string, string] => e[1] !== null));
}
