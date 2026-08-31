import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SatoriOptions } from "satori";
import { BUILT_IN_FONTS, DEFAULT_FONT_ID, findFont } from "./font-registry";
import type { Brand, FontId } from "../../types/user";

/**
 * 카드뉴스 렌더러용 폰트 로더.
 *
 * satori는 CSS·시스템 폰트를 읽지 못하고 **폰트 파일 버퍼를 직접 받아야 한다**
 * (PLAN.md §8 — UI는 woff2 CDN·자체 서빙, 렌더러는 `.ttf` 직접 포함).
 * `.woff2`는 못 읽으므로 같은 폰트라도 렌더러용 `.ttf`가 따로 있어야 한다.
 *
 * **파일이 없어도 던지지 않는다.** 폰트는 나중에 채워 넣을 수 있고,
 * 하나 없다고 카드 제작 전체가 죽으면 안 된다 — 기본 폰트로 내려앉는다.
 */

type FontEntry = SatoriOptions["fonts"][number];

// @TODO: App Hosting(standalone) 배포 시 이 경로가 번들에 포함되는지 확인 필요
const FONT_DIR = path.join(process.cwd(), "src/lib/render/fonts");

/** satori에 넘기는 이름은 하나로 고정한다 — 레이아웃이 폰트마다 달라지지 않게 */
export const FONT_FAMILY = "CardFont";

/** 파일별 캐시. 한 번 읽으면 프로세스가 사는 동안 재사용한다 */
const cache = new Map<string, Buffer>();

async function readFont(file: string): Promise<Buffer | null> {
  const hit = cache.get(file);
  if (hit) return hit;
  try {
    const buf = await readFile(path.join(FONT_DIR, file));
    cache.set(file, buf);
    return buf;
  } catch {
    return null; // 아직 안 넣은 폰트
  }
}

/** 어느 내장 폰트가 실제로 파일까지 갖췄는지 — 설정 화면이 고를 수 있는 목록 */
export async function availableFontIds(): Promise<FontId[]> {
  const checked = await Promise.all(
    BUILT_IN_FONTS.map(async (f) => {
      const files = await Promise.all(f.files.map((x) => readFont(x.file)));
      return files.every(Boolean) ? f.id : null;
    }),
  );
  return checked.filter((v): v is FontId => v !== null);
}

/** 업로드 폰트는 Storage에 있다 — 받아서 쓴다. 실패하면 null */
async function fetchCustomFont(url: string): Promise<Buffer | null> {
  const hit = cache.get(url);
  if (hit) return hit;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    cache.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

/**
 * 이 브랜드로 그릴 때 쓸 폰트를 준비한다.
 *
 * 고른 폰트의 파일이 없으면 **기본 폰트로 내려앉는다.** 업로드 폰트도 마찬가지다 —
 * 사용자가 파일을 지웠거나 Storage가 막혔을 수 있다.
 */
export async function loadCardFonts(brand?: Brand | null): Promise<FontEntry[]> {
  if (brand?.fontId === "custom" && brand.customFontUrl) {
    const data = await fetchCustomFont(brand.customFontUrl);
    // 올린 폰트는 굵기가 한 벌뿐이라 400·700에 같은 파일을 물린다.
    // 없는 굵기를 satori가 요구하면 글자가 아예 안 그려진다.
    if (data) {
      return [
        { name: FONT_FAMILY, data, weight: 400, style: "normal" },
        { name: FONT_FAMILY, data, weight: 700, style: "normal" },
      ];
    }
  }

  const wanted = findFont(brand?.fontId);
  const loaded = await loadFamily(wanted.files);
  if (loaded) return loaded;

  // 고른 폰트 파일이 아직 없다 — 기본으로
  const fallback = await loadFamily(findFont(DEFAULT_FONT_ID).files);
  if (fallback) return fallback;

  throw new Error("카드뉴스 폰트 파일을 하나도 찾지 못했습니다.");
}

async function loadFamily(
  files: { file: string; weight: 400 | 700 }[],
): Promise<FontEntry[] | null> {
  const bufs = await Promise.all(files.map((f) => readFont(f.file)));
  if (bufs.some((b) => b === null)) return null;
  return files.map((f, i) => ({
    name: FONT_FAMILY,
    data: bufs[i]!,
    weight: f.weight,
    style: "normal" as const,
  }));
}
