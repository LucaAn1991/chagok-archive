/**
 * 분위기별 그림 에셋 생성 — GPTProto 경유 `gpt-image-2` (09-02).
 *
 * 실행: npx tsx scripts/generate-style-assets.ts [파일이름 …] [--force]
 *   인자를 주면 그것만, 안 주면 아직 없는 것만 만든다.
 *
 * **사람이 필요할 때만 돌리는 스크립트다.** 앱이 카드를 만들 때 부르지 않는다 —
 * 결과 PNG를 저장소에 커밋해두고 렌더러는 파일을 읽기만 한다.
 * 그래야 카드당 비용이 0이고, 마스코트가 장마다 달라지지 않는다
 * (08-31에 F15를 되돌린 이유 — `PLAN.md` 변경 이력).
 *
 * 명세와 프롬프트는 `src/lib/render/style-assets.ts`에 있다. 여기는 부르는 일만 한다.
 *
 * ⚠️ **결과를 눈으로 보고 커밋할 것.** 그림 모델은 같은 프롬프트로도 매번 다르게
 * 그린다. 마음에 안 들면 지우고 다시 돌리면 된다 — 그러라고 스크립트로 뺐다.
 */
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { STYLE_ASSETS, type AssetSpec } from "../src/lib/render/style-assets";

const OUT_DIR = path.join(process.cwd(), "src/lib/render/assets");
const SUBMIT_URL = "https://gptproto.com/api/v3/openai/gpt-image-2/text-to-image";

/** 폴링 — 1~3초 간격 권장(문서). 너무 조이면 429가 난다 */
const POLL_MS = 2500;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

/** .env.local을 직접 읽는다 — 스크립트는 Next.js 밖이라 자동 로드가 없다 */
function loadEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(".env.local", "utf8");
  } catch {
    return env;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
  }
  return env;
}

type Envelope = {
  data?: {
    id?: string;
    status?: "created" | "running" | "completed" | "failed";
    outputs?: string[];
    urls?: { get?: string };
    error?: string | null;
  };
  message?: string;
  code?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 그림 한 장을 만든다 — **비동기 2단계**다 (GPTProto 문서).
 * ① POST로 작업을 접수하고 ② `urls.get`을 결과가 나올 때까지 두드린다.
 *
 * 폴링 주소는 **응답이 준 `urls.get`을 쓴다.** 우리가 조립하지 말라고 문서가 못박았다 —
 * 경로가 바뀌면 조립한 쪽만 조용히 깨진다.
 */
async function generate(spec: AssetSpec, apiKey: string): Promise<Buffer> {
  const submit = await fetch(SUBMIT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: spec.prompt,
      n: 1,
      // 한 번 만들어 두고두고 쓰는 그림이라 품질을 아끼지 않는다
      quality: "high",
      size: spec.size,
      response_format: "url",
    }),
  });

  if (!submit.ok) {
    const detail = await submit.text().catch(() => "");
    // 상태 코드만으로는 원인을 못 찾는다 — 본문을 그대로 남긴다 (08-31에 같은 교훈)
    throw new Error(`접수 실패 HTTP ${submit.status} — ${detail.slice(0, 300)}`);
  }

  const accepted = (await submit.json()) as Envelope;
  const pollUrl = accepted.data?.urls?.get;
  if (!pollUrl) {
    throw new Error(`결과 주소가 없습니다 — ${JSON.stringify(accepted).slice(0, 300)}`);
  }

  const started = Date.now();
  for (;;) {
    if (Date.now() - started > POLL_TIMEOUT_MS) {
      throw new Error("5분 안에 끝나지 않았습니다.");
    }
    await sleep(POLL_MS);

    const res = await fetch(pollUrl, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`조회 실패 HTTP ${res.status} — ${detail.slice(0, 300)}`);
    }
    const body = (await res.json()) as Envelope;
    const status = body.data?.status;

    if (status === "failed") {
      throw new Error(body.data?.error ?? "생성에 실패했습니다.");
    }
    if (status !== "completed") {
      process.stdout.write(".");
      continue;
    }

    const out = body.data?.outputs?.[0];
    if (!out) throw new Error("완료됐다는데 결과가 비어 있습니다.");
    process.stdout.write("\n");

    // `response_format: "url"`이라 주소가 온다. 혹시 base64가 오면 그것도 받는다
    if (!out.startsWith("http")) return Buffer.from(out, "base64");

    const img = await fetch(out);
    if (!img.ok) throw new Error(`그림을 받지 못했습니다 (HTTP ${img.status}).`);
    return Buffer.from(await img.arrayBuffer());
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * 배경이 정말 투명한지 본다.
 *
 * GPTProto의 이 경로에는 `background: "transparent"` 파라미터가 **없어서**
 * 투명 배경을 프롬프트로만 요구할 수 있다. 흰 사각형이 딸려오면 카드 위에
 * 못 얹는데, 그건 열어보기 전에는 모른다 — 그래서 여기서 확인해 알려준다.
 */
async function alphaReport(png: Buffer): Promise<string> {
  const meta = await sharp(png).metadata();
  if (!meta.hasAlpha) return "⚠️ 배경이 불투명합니다 — 카드 위에 얹으면 사각형이 보입니다";

  // 알파 채널이 있어도 전부 불투명할 수 있다. 실제로 투명한 픽셀이 있는지 센다
  const { data, info } = await sharp(png)
    .resize(64, 64, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let clear = 0;
  for (let i = info.channels - 1; i < data.length; i += info.channels) {
    if (data[i] < 16) clear++;
  }
  const pct = Math.round((clear / (64 * 64)) * 100);
  return pct < 5
    ? `⚠️ 투명한 부분이 ${pct}%뿐입니다 — 배경이 채워져 나왔을 수 있습니다`
    : `투명 배경 확인 (${pct}%)`;
}

async function main() {
  const env = { ...loadEnvLocal(), ...process.env };
  const apiKey = env.GPTPROTO_API_KEY;
  if (!apiKey) {
    throw new Error(".env.local에 GPTPROTO_API_KEY를 먼저 채워주세요.");
  }

  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.filter((a) => !a.startsWith("--"));

  await mkdir(OUT_DIR, { recursive: true });

  const targets =
    only.length > 0 ? STYLE_ASSETS.filter((a) => only.includes(a.file)) : STYLE_ASSETS;

  if (targets.length === 0) {
    console.log("만들 대상이 없습니다. 파일 이름을 확인해주세요:");
    STYLE_ASSETS.forEach((a) => console.log(`  ${a.file}`));
    return;
  }

  for (const spec of targets) {
    const out = path.join(OUT_DIR, spec.file);
    if (!force && (await exists(out))) {
      console.log(`건너뜀 (이미 있음): ${spec.file}  — 다시 만들려면 --force`);
      continue;
    }

    process.stdout.write(`만드는 중: ${spec.file} — ${spec.purpose} `);
    try {
      const png = await generate(spec, apiKey);
      await writeFile(out, png);
      console.log(`  저장: ${spec.file} (${Math.round(png.length / 1024)}KB · ${spec.cells}칸)`);
      console.log(`  ${await alphaReport(png)}`);
    } catch (err) {
      // 한 장이 실패해도 나머지는 만든다 — 다시 돌리면 된 것은 건너뛴다
      console.error(`\n  실패: ${spec.file} — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("\n끝났습니다. **결과를 눈으로 확인한 뒤** 커밋하세요.");
  console.log("마음에 안 들면 파일을 지우고 다시 실행하면 됩니다.");
}

main().catch((err) => {
  console.error("실패:", err instanceof Error ? err.message : err);
  process.exit(1);
});
