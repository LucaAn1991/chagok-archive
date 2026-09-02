/**
 * 껍데기 실험 — 「명조 + 회색 + 여백」이 satori에서 성립하는지 확인한다.
 *
 * 실행: npx tsx scripts/theme-experiment.ts [출력폴더]
 *
 * **제품 코드를 고치지 않는다.** 테마 값은 이 프로세스 안에서만 바꾸고,
 * 색·폰트는 이미 있는 「내 스타일」(Brand) 경로로 넣는다.
 * 레이아웃은 하나도 건드리지 않았다 — 같은 6종 그대로다.
 *
 * 나오는 파일: before-*.png (지금) · after-*.png (시안) · ratio-*.png (4:3)
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import sharp from "sharp";
import type { ReactNode } from "react";
import { buildLayout, SLIDE_SIZE, type SlideContent } from "../src/lib/render/layouts";
import { loadCardFonts } from "../src/lib/render/fonts";
import { THEMES } from "../src/lib/render/themes";
import type { Brand } from "../src/types/user";

/** 시안이 바꾼 값은 이 넷뿐이다 */
const PROPOSED_BRAND: Brand = {
  bg: "#E7E5E1", // 따뜻한 회색
  accent: "#8A857D",
  fontId: "nanum-myeongjo", // 명조
};
const PROPOSED_PAD = 136; // 지금 warm은 112
const PROPOSED_SCALE = 1.02; // 지금 warm은 0.95

/** 시안 문구 — 앞서 만든 3장과 같은 주제 */
const SAMPLES: SlideContent[] = [
  {
    layoutId: "cover",
    texts: { title: "퇴근하고 30분,\n하체만", subtitle: "매트 한 장이면 끝나는 홈트 루틴" },
    imageUrl: null,
  },
  {
    layoutId: "text-only",
    texts: {
      title: "왜 하체부터인가",
      body: "하체는 몸에서 가장 큰 근육이라 같은 시간을 써도 소모가 큽니다. 퇴근 후처럼 시간이 짧을 때 효율이 가장 잘 나오는 부위예요.",
    },
    imageUrl: null,
  },
  {
    layoutId: "list",
    texts: {
      title: "30분에 넣을 동작",
      item1: "스쿼트 — 15회 3세트. 무릎이 발끝을 넘지 않게",
      item2: "런지 — 좌우 10회 3세트. 뒤 무릎을 바닥 가까이",
      item3: "힙브릿지 — 20회 3세트. 엉덩이에 힘이 들어가는지 확인",
    },
    imageUrl: null,
  },
  {
    layoutId: "closing",
    texts: { message: "내일 퇴근하고\n30분만 같이 해요", cta: "저장해두고 퇴근길에 다시 보기" },
    imageUrl: null,
  },
];

async function render(content: SlideContent, w: number, h: number): Promise<Buffer> {
  const fonts = await loadCardFonts(content.brand ?? null);
  const svg = await satori(buildLayout(content) as unknown as ReactNode, { width: w, height: h, fonts });
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  const outDir = process.argv[2] ?? "theme-experiment-out";
  await mkdir(outDir, { recursive: true });

  const rows: string[] = [];

  // ① 지금 — 손대지 않은 상태
  for (const s of SAMPLES) {
    const png = await render({ ...s, themeId: "warm" }, SLIDE_SIZE, SLIDE_SIZE);
    const file = path.join(outDir, `before-${s.layoutId}.png`);
    await writeFile(file, png);
    rows.push(`before  ${s.layoutId.padEnd(10)} ${file}`);
  }

  // ② 시안 — 여백·글자 비율만 이 프로세스에서 바꾼다
  const warm = THEMES.warm;
  const keep = { pad: warm.type.pad, scale: warm.type.scale };
  warm.type.pad = PROPOSED_PAD;
  warm.type.scale = PROPOSED_SCALE;

  for (const s of SAMPLES) {
    const content = { ...s, themeId: "warm", brand: PROPOSED_BRAND };
    const png = await render(content, SLIDE_SIZE, SLIDE_SIZE);
    const file = path.join(outDir, `after-${s.layoutId}.png`);
    await writeFile(file, png);
    rows.push(`after   ${s.layoutId.padEnd(10)} ${file}`);
  }

  // ③ 같은 시안을 4:3으로 — 비율만 다르다
  for (const s of SAMPLES.slice(0, 2)) {
    const content = { ...s, themeId: "warm", brand: PROPOSED_BRAND };
    const png = await render(content, SLIDE_SIZE, Math.round((SLIDE_SIZE * 3) / 4));
    const file = path.join(outDir, `ratio-${s.layoutId}.png`);
    await writeFile(file, png);
    rows.push(`ratio   ${s.layoutId.padEnd(10)} ${file}`);
  }

  warm.type.pad = keep.pad;
  warm.type.scale = keep.scale;

  console.log(rows.join("\n"));
  console.log(`\n${rows.length}장 저장 — ${outDir}`);
}

main().catch((err) => {
  console.error("실패:", err);
  process.exit(1);
});
