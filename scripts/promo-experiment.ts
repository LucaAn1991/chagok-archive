/**
 * 세 번째 시안(그라데이션 캠페인형) 실험.
 * 실행: npx tsx scripts/promo-experiment.ts [출력폴더]
 *
 * 이 템플릿은 레이아웃 6종 밖이라 자유 배치(elements) 경로로 짠다.
 * 그라데이션·글자 그림자는 렌더러에 개념이 없어 여기서 직접 넣고,
 * satori가 실제로 그려내는지 확인한다.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import satori from "satori";
import sharp from "sharp";
import type { ReactNode } from "react";

const FONT_DIR = path.join(process.cwd(), "src/lib/render/fonts");
const W = 1080, H = 1350; // 4:5 — 시안이 세로형이다

const C = {
  gradTop: "#A9C5F2", gradBot: "#C8B4E8",
  sub: "#5B4B8A", white: "#FFFFFF",
  panel: "#F3F4F8", pillA: "#B49BD4", pillB: "#8B72B0",
  btn: "#6B4FA8", ink: "#3D3550", muted: "#9AA0B4",
};

type N = { type: string; props: Record<string, unknown> };
const el = (style: Record<string, unknown>, children?: unknown): N =>
  ({ type: "div", props: { style: { display: "flex", ...style }, children } });

/** 떠 있는 알약 태그 — freeform의 shape+text와 같은 구조 */
const pill = (text: string, x: number, y: number, bg: string): N =>
  el({
    position: "absolute", left: x, top: y, backgroundColor: bg, borderRadius: 999,
    paddingLeft: 40, paddingRight: 40, paddingTop: 22, paddingBottom: 22,
    color: C.white, fontSize: 34, fontWeight: 700, alignItems: "center",
  }, text);

function slide(opts: {
  sub: string; title: string; tags?: [string, string, string, string];
  bodyTitle?: string; bodyLines?: string[]; btn1: string; btn2: string;
}): N {
  const inner: unknown[] = [];
  if (opts.tags) {
    inner.push(el({
      position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
      alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 22,
    }, [
      el({ width: 190, height: 150, backgroundColor: "#AEB4C6", borderRadius: 16 }),
      el({ fontSize: 34, color: C.ink, fontWeight: 700 }, "사진이 들어갑니다"),
      el({ fontSize: 27, color: C.muted }, "고른 사진 · 스톡 · 없으면 글자만"),
    ]));
    inner.push(pill(opts.tags[0], 40, 150, C.pillA));
    inner.push(pill(opts.tags[1], 10, 320, C.pillB));
    inner.push(pill(opts.tags[2], 470, 300, C.pillB));
    inner.push(pill(opts.tags[3], 540, 470, C.pillA));
  } else {
    inner.push(el({
      position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
      flexDirection: "column", justifyContent: "center", paddingLeft: 64, paddingRight: 64, gap: 34,
    }, [
      el({ fontSize: 46, fontWeight: 700, color: C.btn }, opts.bodyTitle ?? ""),
      ...(opts.bodyLines ?? []).map((l) =>
        el({ fontSize: 36, color: C.ink, lineHeight: 1.55 }, l)),
    ]));
  }

  return el({
    width: W, height: H, flexDirection: "column", alignItems: "center",
    backgroundImage: `linear-gradient(160deg, ${C.gradTop}, ${C.gradBot})`,
    paddingTop: 72, paddingLeft: 56, paddingRight: 56, paddingBottom: 56,
  }, [
    el({ fontSize: 42, fontWeight: 700, color: C.sub, marginBottom: 18 }, opts.sub),
    el({
      fontSize: 104, fontWeight: 700, color: C.white, textAlign: "center",
      lineHeight: 1.18, marginBottom: 46, textShadow: "0 6px 0 rgba(94,74,150,0.28)",
      whiteSpace: "pre-wrap", justifyContent: "center", width: "100%",
    }, opts.title),
    el({
      width: "100%", flex: 1, backgroundColor: C.white, borderRadius: 34,
      flexDirection: "column", padding: 26,
    }, [
      el({ width: "100%", flex: 1, backgroundColor: C.panel, borderRadius: 24, position: "relative" }, inner),
      el({ width: "100%", height: 118, alignItems: "center" }, [
        el({ flex: 1, justifyContent: "center", fontSize: 40, fontWeight: 700, color: C.btn }, opts.btn1),
        el({ width: 2, height: 74, backgroundColor: "#E6E4EE" }),
        el({ flex: 1, justifyContent: "center", fontSize: 40, fontWeight: 700, color: C.btn }, opts.btn2),
      ]),
    ]),
  ]);
}

const SLIDES = [
  slide({
    sub: "퇴근 후 30분", title: "집에서 하는\n하체 루틴",
    tags: ["매트 한 장", "장비 0원", "30분", "무릎 안전"],
    btn1: "루틴 보기", btn2: "저장하기",
  }),
  slide({
    sub: "왜 하체부터", title: "가장 큰 근육",
    bodyTitle: "같은 시간에 더 많이 씁니다",
    bodyLines: [
      "하체는 몸에서 가장 큰 근육입니다.",
      "퇴근 후처럼 시간이 짧을 때 효율이 가장 잘 나와요.",
      "장비도 거의 필요 없습니다 — 매트 한 장이면 됩니다.",
    ],
    btn1: "다음", btn2: "저장하기",
  }),
  slide({
    sub: "동작 3개", title: "이것만 하세요",
    bodyTitle: "30분 안에 끝나는 구성",
    bodyLines: ["1  스쿼트 — 15회 3세트", "2  런지 — 좌우 10회 3세트", "3  힙브릿지 — 20회 3세트"],
    btn1: "루틴 보기", btn2: "공유하기",
  }),
];

async function main() {
  const outDir = process.argv[2] ?? "promo-out";
  await mkdir(outDir, { recursive: true });
  const fonts = [
    { name: "pretendard", data: await readFile(path.join(FONT_DIR, "Pretendard-Regular.ttf")), weight: 400 as const, style: "normal" as const },
    { name: "pretendard", data: await readFile(path.join(FONT_DIR, "Pretendard-Bold.ttf")), weight: 700 as const, style: "normal" as const },
  ];
  for (const [i, node] of SLIDES.entries()) {
    const svg = await satori(node as unknown as ReactNode, { width: W, height: H, fonts, embedFont: true });
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const file = path.join(outDir, `promo-${i + 1}.png`);
    await writeFile(file, png);
    console.log(`promo ${i + 1}  ${file}`);
  }
}
main().catch((e) => { console.error("실패:", e); process.exit(1); });
