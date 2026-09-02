/**
 * 생성된 에셋에서 «가짜 투명 배경»을 진짜 알파로 바꾼다 (09-02).
 *
 * 실행: npx tsx scripts/cutout-assets.ts [파일이름 …]
 *
 * **왜 필요한가** — GPTProto의 `gpt-image-2` 경로에는 `background: "transparent"`
 * 파라미터가 없어서 프롬프트로만 요구할 수 있는데, 모델이 이 요구를 «투명을 나타내는
 * 체크무늬를 그려라»로 알아듣는다. 그래서 그림 파일 자체는 불투명하고,
 * 배경 자리에 회색·흰색 격자가 **그려져** 있다.
 *
 * **테두리에서 번져 나가며 지운다.** 「밝고 무채색인 픽셀을 전부 지운다」로 하면
 * 마스코트의 크림색 배를 뚫고 숫자의 흰 하이라이트에 구멍이 난다.
 * 바깥에서 이어진 부분만 지우면 안쪽 흰색은 남는다.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const DIR = path.join(process.cwd(), "src/lib/render/assets");

/**
 * 체크무늬 칸으로 볼 것인가.
 *
 * 두 조건을 함께 본다 — **밝고**(어두운 그림자는 배경이 아니다)
 * **무채색이어야**(민트색 공룡·분홍 숫자는 채도가 있다) 한다.
 * 체크무늬는 흰색과 옅은 회색 두 톤이라 둘 다 이 조건에 걸린다.
 */
function isBackdrop(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max >= 200 && max - min <= 12;
}

/**
 * 테두리에서 시작해 이어진 배경을 지운다 (flood fill).
 *
 * 재귀 대신 스택을 쓴다 — 1536×1024면 픽셀이 150만 개라 재귀로는 스택이 넘친다.
 */
async function cutout(file: string): Promise<{ before: number; after: number }> {
  const input = await readFile(file);
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  const visited = new Uint8Array(W * H);
  const stack: number[] = [];

  /** 테두리 픽셀 전부를 출발점으로 넣는다 */
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (visited[i]) return;
    const p = i * C;
    if (!isBackdrop(data[p], data[p + 1], data[p + 2])) return;
    visited[i] = 1;
    stack.push(i);
  };

  for (let x = 0; x < W; x++) {
    push(x, 0);
    push(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    push(0, y);
    push(W - 1, y);
  }

  let cleared = 0;
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % W;
    const y = (i / W) | 0;
    data[i * C + 3] = 0; // 알파를 0으로 — 색은 건드리지 않는다
    cleared++;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  /*
    **갇힌 배경도 지운다** — 숫자 `0`·`8`의 구멍처럼 바깥과 이어지지 않은 자리는
    위의 번지기가 닿지 못해 체크무늬가 그대로 남는다.

    남은 배경색 덩어리를 훑되 **두 톤이 섞인 것만** 지운다. 체크무늬는 흰색과
    옅은 회색이 번갈아 있어 밝기 차가 크고, 숫자의 흰 반사광은 한 톤이라 차이가 작다.
    이 구분이 없으면 반사광에 구멍이 뚫린다.
  */
  const seen2 = new Uint8Array(W * H);
  for (let start = 0; start < W * H; start++) {
    if (seen2[start] || data[start * C + 3] === 0) continue;
    const p0 = start * C;
    if (!isBackdrop(data[p0], data[p0 + 1], data[p0 + 2])) continue;

    const region: number[] = [];
    const stack = [start];
    seen2[start] = 1;
    let lo = 255;
    let hi = 0;

    while (stack.length > 0) {
      const i = stack.pop()!;
      region.push(i);
      const p = i * C;
      const lum = (data[p] + data[p + 1] + data[p + 2]) / 3;
      if (lum < lo) lo = lum;
      if (lum > hi) hi = lum;

      const x = i % W;
      const y = (i / W) | 0;
      const near = [
        [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1],
      ] as const;
      for (const [nx, ny] of near) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (seen2[ni] || data[ni * C + 3] === 0) continue;
        const np = ni * C;
        if (!isBackdrop(data[np], data[np + 1], data[np + 2])) continue;
        seen2[ni] = 1;
        stack.push(ni);
      }
    }

    // 두 톤이 섞였고(체크무늬) 부스러기가 아닐 때만 지운다
    if (hi - lo > 8 && region.length > 200) {
      for (const i of region) data[i * C + 3] = 0;
      cleared += region.length;
    }
  }

  const out = await sharp(data, { raw: { width: W, height: H, channels: C } })
    .png()
    .toBuffer();
  await writeFile(file, out);

  return { before: input.length, after: out.length };
}

async function main() {
  const only = process.argv.slice(2);
  const files = (await readdir(DIR))
    .filter((f) => f.endsWith(".png"))
    .filter((f) => only.length === 0 || only.includes(f));

  if (files.length === 0) {
    console.log("대상 파일이 없습니다.");
    return;
  }

  for (const name of files) {
    const file = path.join(DIR, name);
    const { before, after } = await cutout(file);

    // 얼마나 지워졌는지 알려준다 — 0%면 무늬가 안 잡힌 것이고, 90%면 그림까지 지운 것이다
    const { data, info } = await sharp(file)
      .resize(64, 64, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let clear = 0;
    for (let i = info.channels - 1; i < data.length; i += info.channels) {
      if (data[i] < 16) clear++;
    }
    const pct = Math.round((clear / (64 * 64)) * 100);

    const note =
      pct < 5 ? "⚠️ 거의 안 지워졌습니다 — 배경이 체크무늬가 아닐 수 있어요"
      : pct > 92 ? "⚠️ 너무 많이 지워졌습니다 — 그림까지 먹었을 수 있어요"
      : "";
    console.log(
      `${name}: 투명 ${pct}% · ${Math.round(before / 1024)}KB → ${Math.round(after / 1024)}KB ${note}`,
    );
  }
}

main().catch((err) => {
  console.error("실패:", err instanceof Error ? err.message : err);
  process.exit(1);
});
