/**
 * 템플릿 2종 실험 — 「시안 이미지 → 값 → 6장 전부에 적용」이 되는지 확인한다.
 *
 * 실행: npx tsx scripts/template-experiment.ts [출력폴더]
 *
 * **제품 코드를 고치지 않는다.** CardTemplate 타입은 아직 없으므로 여기서만 정의하고,
 * 색·폰트·글자 크기는 이미 있는 Brand·styleOverrides 경로로 밀어 넣는다.
 * 껍데기(로고·핸들·하단 라벨)만 buildLayout 결과를 감싸서 얹는다 —
 * satori에서 그려지는지 확인하려는 것이다.
 *
 * 문구는 손으로 썼다. 프롬프트 조립은 아직 코드에 없다 —
 * 각 템플릿의 `copyRules`가 «그 프롬프트에 들어갈 줄»이다.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import sharp from "sharp";
import type { ReactNode } from "react";
import { buildLayout, SLIDE_SIZE, type SlideContent } from "../src/lib/render/layouts";
import { THEMES } from "../src/lib/render/themes";
import type { LayoutId, SlotStyle } from "../src/types/card";

const FONT_DIR = path.join(process.cwd(), "src/lib/render/fonts");

type Node = { type: string; props: Record<string, unknown> };

/** 시안 이미지에서 뽑아낸 값 한 벌 */
type TemplateSpec = {
  id: string;
  label: string;
  hint: string;
  /** 보이는 것 */
  bg: string;
  accent: string;
  pad: number;
  scale: number;
  tracking: number;
  lineHeight: number;
  /** satori에 등록할 폰트 — name은 아무 이름이나 써도 된다 */
  fonts: { name: string; file: string; weight: 400 | 700 }[];
  /** 본문이 쓸 폰트 이름 */
  bodyFamily: string;
  /** 레이아웃별 슬롯 조절 — 제목만 다른 폰트·크기를 쓰는 경우 */
  slots: Partial<Record<LayoutId, Record<string, SlotStyle>>>;
  /** 껍데기. null이면 안 얹는다 */
  chrome: { topLeft: string; topRight?: string; bottom?: string } | null;
  /** 프롬프트에 들어갈 줄 — 이 템플릿이 문구에 거는 제약 */
  copyRules: string[];
};

/* ── A. 조용한 회색 (첫 번째 시안 이미지에서) ───────────────── */
const QUIET: TemplateSpec = {
  id: "quiet",
  label: "조용한",
  hint: "회색 바탕에 명조 — 기록·에세이에 어울려요",
  bg: "#E7E5E1",
  accent: "#8A857D",
  pad: 136,
  scale: 1.02,
  tracking: 0.5,
  lineHeight: 1.7,
  fonts: [
    { name: "myeongjo", file: "NanumMyeongjo-Regular.ttf", weight: 400 },
    { name: "myeongjo", file: "NanumMyeongjo-Bold.ttf", weight: 700 },
  ],
  bodyFamily: "myeongjo",
  slots: {},
  chrome: { topLeft: "브랜드명" },
  copyRules: [
    "제목은 20자 안팎, 두 줄까지.",
    "본문은 3~4줄. 문장으로 쓴다 — 낱말만 던지지 않는다.",
    "담담하게. 느낌표를 쓰지 않는다.",
  ],
};

/* ── B. 외치는 흰색 (두 번째 시안 이미지에서) ───────────────── */
const BOLD: TemplateSpec = {
  id: "bold",
  label: "외치는",
  hint: "흰 바탕에 굵은 제목 — 정보·팁에 어울려요",
  bg: "#FFFFFF",
  accent: "#7FC3E8",
  pad: 96,
  scale: 1.0,
  tracking: -2,
  lineHeight: 1.3,
  fonts: [
    { name: "blackhan", file: "BlackHanSans-Regular.ttf", weight: 400 },
    { name: "blackhan", file: "BlackHanSans-Regular.ttf", weight: 700 },
    { name: "pretendard", file: "Pretendard-Regular.ttf", weight: 400 },
    { name: "pretendard", file: "Pretendard-Bold.ttf", weight: 700 },
  ],
  bodyFamily: "pretendard",
  slots: {
    cover: { title: { fontId: "blackhan" as SlotStyle["fontId"], sizePx: 148 } },
    "text-only": { title: { fontId: "blackhan" as SlotStyle["fontId"], sizePx: 96 } },
    list: { title: { fontId: "blackhan" as SlotStyle["fontId"], sizePx: 86 } },
    closing: { message: { fontId: "blackhan" as SlotStyle["fontId"], sizePx: 110 } },
  },
  chrome: { topLeft: "CardNews", topRight: "@브랜드", bottom: "더 알아보기" },
  copyRules: [
    "제목은 세 줄. 한 줄에 2~5자만 들어간다. 줄바꿈 위치를 네가 정해라.",
    "조사·어미로 줄을 끝내지 마라 — 낱말 단위로 끊는다.",
    "부제는 20자 이내. 느낌표로 끝나도 된다.",
    "맨 아래 링크 유도 문구를 6자 이내로.",
  ],
};

/* ── 같은 주제, 템플릿이 요구하는 대로 다르게 쓴 문구 ────────── */
type Sheet = { layoutId: LayoutId; texts: Record<string, string>; label: string };

const QUIET_SHEET: Sheet[] = [
  { layoutId: "cover", label: "COVER", texts: { title: "퇴근하고 30분,\n하체만", subtitle: "매트 한 장이면 끝나는 홈트 루틴" } },
  { layoutId: "text-only", label: "WHY", texts: { title: "왜 하체부터인가", body: "하체는 몸에서 가장 큰 근육이라 같은 시간을 써도 소모가 큽니다. 퇴근 후처럼 시간이 짧을 때 효율이 가장 잘 나오는 부위예요." } },
  { layoutId: "list", label: "ROUTINE", texts: { title: "30분에 넣을 동작", item1: "스쿼트 — 15회 3세트", item2: "런지 — 좌우 10회 3세트", item3: "힙브릿지 — 20회 3세트" } },
  { layoutId: "text-only", label: "MISTAKE", texts: { title: "가장 흔한 실수", body: "무릎이 발끝을 넘어가는 것입니다. 앉는 느낌으로 엉덩이를 뒤로 빼면 저절로 교정돼요." } },
  { layoutId: "list", label: "CHECK", texts: { title: "시작 전에 확인할 것", item1: "매트나 두꺼운 수건을 깔았나요", item2: "무릎이나 허리가 지금 아프지는 않나요", item3: "끝나고 스트레칭할 5분을 남겨뒀나요" } },
  { layoutId: "closing", label: "CLOSING", texts: { message: "내일 퇴근하고\n30분만 같이 해요", cta: "저장해두고 퇴근길에 다시 보기" } },
];

const BOLD_SHEET: Sheet[] = [
  { layoutId: "cover", label: "COVER", texts: { title: "퇴근 후\n30분\n하체", subtitle: "매트 한 장이면 충분해요!" } },
  { layoutId: "text-only", label: "WHY", texts: { title: "결론\n먼저", body: "동작 3개면 끝납니다. 더 늘리면 안 하게 돼요." } },
  { layoutId: "list", label: "ROUTINE", texts: { title: "동작 3개", item1: "스쿼트 15회", item2: "런지 좌우 10회", item3: "힙브릿지 20회" } },
  { layoutId: "text-only", label: "MISTAKE", texts: { title: "이건\n하지 마세요", body: "무릎이 발끝을 넘어가는 것" } },
  { layoutId: "list", label: "CHECK", texts: { title: "시작 전\n체크", item1: "매트 깔았나요", item2: "무릎 안 아프죠", item3: "물 옆에 뒀나요" } },
  { layoutId: "closing", label: "CLOSING", texts: { message: "내일\n같이 해요", cta: "루틴 보기" } },
];

/* ── 껍데기 — buildLayout 결과를 감싸서 얹는다 ───────────────── */
function chromeText(value: string, style: Record<string, unknown>, family: string, color: string): Node {
  return {
    type: "div",
    props: {
      style: { position: "absolute", display: "flex", fontFamily: family, fontSize: 26, color, letterSpacing: 0.5, ...style },
      children: value,
    },
  };
}

function withChrome(inner: unknown, tpl: TemplateSpec, footer: string, w: number, h: number): Node {
  if (!tpl.chrome) return inner as Node;
  const i = Math.round(tpl.pad * 0.55);
  const kids: unknown[] = [inner];
  kids.push(chromeText(tpl.chrome.topLeft, { top: i, left: i }, tpl.bodyFamily, tpl.accent));
  if (tpl.chrome.topRight) kids.push(chromeText(tpl.chrome.topRight, { top: i, right: i }, tpl.bodyFamily, tpl.accent));
  const bottom = tpl.chrome.bottom ?? footer;
  kids.push(
    chromeText(bottom, { bottom: i, left: 0, width: w, justifyContent: "center", fontSize: 22, letterSpacing: 4 }, tpl.bodyFamily, tpl.accent),
  );
  return { type: "div", props: { style: { position: "relative", display: "flex", width: w, height: h }, children: kids } };
}

async function loadFonts(tpl: TemplateSpec) {
  return Promise.all(
    tpl.fonts.map(async (f) => ({
      name: f.name,
      data: await readFile(path.join(FONT_DIR, f.file)),
      weight: f.weight,
      style: "normal" as const,
    })),
  );
}

async function bake(tpl: TemplateSpec, sheet: Sheet[], outDir: string): Promise<string[]> {
  // 테마 값은 이 프로세스 안에서만 바꾼다
  const warm = THEMES.warm;
  const keep = { ...warm.type };
  const keepColor = { ...warm.color };
  warm.type.pad = tpl.pad;
  warm.type.scale = tpl.scale;
  warm.type.tracking = tpl.tracking;
  warm.type.lineHeight = tpl.lineHeight;

  const fonts = await loadFonts(tpl);
  const made: string[] = [];

  for (const [i, s] of sheet.entries()) {
    const content: SlideContent = {
      layoutId: s.layoutId,
      themeId: "warm",
      brand: { bg: tpl.bg, accent: tpl.accent, fontId: tpl.bodyFamily as never },
      styleOverrides: tpl.slots[s.layoutId],
      texts: s.texts,
      imageUrl: null,
    };
    const node = withChrome(buildLayout(content), tpl, s.label, SLIDE_SIZE, SLIDE_SIZE);
    const svg = await satori(node as unknown as ReactNode, { width: SLIDE_SIZE, height: SLIDE_SIZE, fonts });
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const file = path.join(outDir, `${tpl.id}-${i + 1}-${s.layoutId}.png`);
    await writeFile(file, png);
    made.push(file);
    console.log(`${tpl.id.padEnd(6)} ${String(i + 1).padStart(2)}. ${s.layoutId.padEnd(10)} ${file}`);
  }

  Object.assign(warm.type, keep);
  Object.assign(warm.color, keepColor);
  return made;
}

async function main() {
  const outDir = process.argv[2] ?? "template-experiment-out";
  await mkdir(outDir, { recursive: true });
  await bake(QUIET, QUIET_SHEET, outDir);
  await bake(BOLD, BOLD_SHEET, outDir);
  console.log("\n템플릿 2종 × 6장 = 12장");
}

main().catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});
