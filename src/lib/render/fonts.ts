import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SatoriOptions } from "satori";

/**
 * 카드뉴스 렌더러용 Pretendard 폰트 로더.
 *
 * satori는 CSS·시스템 폰트를 읽지 못하고 폰트 파일 버퍼를 직접 받아야 한다
 * (PLAN.md §8 — UI는 dynamic-subset CDN, 렌더러는 .ttf 직접 포함).
 * 파일은 이 폴더에 함께 들어 있다. 라이선스: SIL Open Font License 1.1.
 */

type FontEntry = SatoriOptions["fonts"][number];

// @TODO: App Hosting(standalone) 배포 시 이 경로가 번들에 포함되는지 확인 필요
const FONT_DIR = path.join(process.cwd(), "src/lib/render/fonts");

let cached: FontEntry[] | null = null;

/** 첫 호출에서 파일을 읽고 이후에는 메모리 캐시를 재사용한다 */
export async function loadPretendardFonts(): Promise<FontEntry[]> {
  if (cached) return cached;

  const [regular, semiBold, bold] = await Promise.all([
    readFile(path.join(FONT_DIR, "Pretendard-Regular.ttf")),
    readFile(path.join(FONT_DIR, "Pretendard-SemiBold.ttf")),
    readFile(path.join(FONT_DIR, "Pretendard-Bold.ttf")),
  ]);

  cached = [
    { name: "Pretendard", data: regular, weight: 400, style: "normal" },
    { name: "Pretendard", data: semiBold, weight: 600, style: "normal" },
    { name: "Pretendard", data: bold, weight: 700, style: "normal" },
  ];
  return cached;
}
