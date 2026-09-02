/**
 * 시트 한 장을 낱장으로 자른다 (09-02).
 *
 * 실행: npx tsx scripts/slice-assets.ts [파일이름 …]
 *   `mascot-poses.png` → `mascot-wave.png` · `mascot-point.png` · `mascot-thumbsup.png`
 *
 * **격자로 자르지 않는다.** 모델이 칸을 정확히 나눠 그리지 않아서, 「가로 3등분」으로
 * 자르면 마스코트의 꼬리가 옆 칸으로 넘어가거나 팔이 잘린다. 대신 **배경이 투명해진
 * 상태를 이용해 «붙어 있는 덩어리»를 찾아** 각각의 실제 경계로 자른다.
 * (그래서 `cutout-assets.ts`를 먼저 돌려야 한다.)
 *
 * 덩어리가 칸 수와 다르면 **자르지 않고 멈춘다.** 잘못 자른 파일이 조용히 생기는 것보다
 * 사람이 원본을 보고 판단하는 편이 낫다.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { STYLE_ASSETS, type AssetSpec } from "../src/lib/render/style-assets";

const DIR = path.join(process.cwd(), "src/lib/render/assets");

/** 이 값보다 진하면 «그림»으로 본다. 반투명 가장자리를 살리려고 낮게 잡았다 */
const ALPHA_MIN = 40;
/**
 * 이 넓이보다 작은 덩어리는 버린다 — 지우다 남은 부스러기·점 하나가
 * 칸으로 세어지면 개수가 안 맞는다.
 */
const MIN_AREA = 1500;

type Box = { x0: number; y0: number; x1: number; y1: number; area: number };

/**
 * 알파가 있는 픽셀들이 이루는 덩어리를 전부 찾는다.
 *
 * 재귀 대신 스택 — 150만 픽셀에서 재귀는 스택이 넘친다.
 * 8방향으로 잇는다: 픽셀 아트의 대각선 계단이 4방향에서는 끊겨 보인다.
 */
function findBlobs(data: Buffer, W: number, H: number, C: number): Box[] {
  const seen = new Uint8Array(W * H);
  const boxes: Box[] = [];

  for (let start = 0; start < W * H; start++) {
    if (seen[start] || data[start * C + 3] < ALPHA_MIN) continue;

    const stack = [start];
    seen[start] = 1;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, area = 0;

    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % W;
      const y = (i / W) | 0;
      area++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (seen[ni] || data[ni * C + 3] < ALPHA_MIN) continue;
          seen[ni] = 1;
          stack.push(ni);
        }
      }
    }

    if (area >= MIN_AREA) boxes.push({ x0, y0, x1, y1, area });
  }
  return boxes;
}

/**
 * **상자가 겹치는 덩어리는 하나로 합친다.**
 *
 * `%`는 위 원·빗금·아래 원이 서로 떨어져 있어서 세 덩어리로 잡힌다 —
 * 그대로 두면 11칸짜리 시트가 13개로 세어진다. 획이 나뉜 글자·기호는
 * 전부 같은 문제를 겪으므로 «겹치면 한 칸»으로 일반화한다.
 *
 * 한 번 합치면 상자가 커져 또 다른 것과 겹칠 수 있어 변화가 없을 때까지 돈다.
 */
function mergeOverlapping(boxes: Box[]): Box[] {
  const out = [...boxes];
  for (let changed = true; changed; ) {
    changed = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        const apart = a.x1 < b.x0 || b.x1 < a.x0 || a.y1 < b.y0 || b.y1 < a.y0;
        if (apart) continue;
        out[i] = {
          x0: Math.min(a.x0, b.x0),
          y0: Math.min(a.y0, b.y0),
          x1: Math.max(a.x1, b.x1),
          y1: Math.max(a.y1, b.y1),
          area: a.area + b.area,
        };
        out.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return out;
}

/**
 * 읽는 순서로 줄 세운다 — 위에서 아래, 같은 줄 안에서는 왼쪽에서 오른쪽.
 *
 * 「같은 줄」은 세로로 절반 넘게 겹치는지로 본다. y좌표만 비교하면 조금 위로 뜬
 * 글자가 앞줄로 올라가버린다 (숫자 시트가 정확히 그렇다).
 */
function inReadingOrder(boxes: Box[]): Box[] {
  const rows: Box[][] = [];
  for (const b of [...boxes].sort((p, q) => p.y0 - q.y0)) {
    const h = b.y1 - b.y0;
    const row = rows.find((r) => {
      const ref = r[0];
      const overlap = Math.min(ref.y1, b.y1) - Math.max(ref.y0, b.y0);
      return overlap > h * 0.5;
    });
    if (row) row.push(b);
    else rows.push([b]);
  }
  return rows.flatMap((r) => r.sort((p, q) => p.x0 - q.x0));
}

async function slice(spec: AssetSpec): Promise<void> {
  const src = path.join(DIR, spec.file);
  let input: Buffer;
  try {
    input = await readFile(src);
  } catch {
    console.log(`건너뜀 (파일 없음): ${spec.file}`);
    return;
  }

  if (spec.sliceNames.length !== spec.cells) {
    console.error(`${spec.file}: 명세가 어긋납니다 — cells=${spec.cells}인데 이름은 ${spec.sliceNames.length}개`);
    return;
  }

  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const boxes = inReadingOrder(mergeOverlapping(findBlobs(data, info.width, info.height, info.channels)));

  if (boxes.length !== spec.cells) {
    console.error(
      `${spec.file}: 덩어리가 ${boxes.length}개인데 칸은 ${spec.cells}개입니다 — 자르지 않았습니다.\n` +
        `  원본을 열어보고, 붙어 있거나 부스러기가 남았으면 다시 생성하세요.`,
    );
    return;
  }

  const prefix = spec.file.replace(/-[^-]+\.png$/, ""); // mascot-poses.png → mascot
  for (const [i, b] of boxes.entries()) {
    const name = `${prefix}-${spec.sliceNames[i]}.png`;
    const png = await sharp(input)
      .extract({ left: b.x0, top: b.y0, width: b.x1 - b.x0 + 1, height: b.y1 - b.y0 + 1 })
      .png()
      .toBuffer();
    await writeFile(path.join(DIR, name), png);
    console.log(`  ${name}  ${b.x1 - b.x0 + 1}×${b.y1 - b.y0 + 1}`);
  }
}

async function main() {
  const only = process.argv.slice(2);
  const targets = only.length > 0 ? STYLE_ASSETS.filter((a) => only.includes(a.file)) : STYLE_ASSETS;

  for (const spec of targets) {
    console.log(`${spec.file} — ${spec.cells}칸`);
    await slice(spec);
  }
}

main().catch((err) => {
  console.error("실패:", err instanceof Error ? err.message : err);
  process.exit(1);
});
