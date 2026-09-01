import { readFileSync, writeFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { renderSlidePng } from "../src/lib/render/render-slide";
const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const t = line.trim(); if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("="); if (eq === -1) continue;
  env[t.slice(0, eq)] = t.slice(eq + 1);
}
if (getApps().length === 0) initializeApp({ credential: cert({
  projectId: env.FIREBASE_ADMIN_PROJECT_ID, clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n") }) });
async function main() {
  const c = (await getFirestore().doc("cards/dev-cal-4").get()).data()!;
  const picks = [0, 2, 4]; // 표지 · 사진 · 목록
  for (let i = 0; i < picks.length; i++) {
    const s = c.slides.find((x: { order: number }) => x.order === picks[i]);
    const png = await renderSlidePng({ layoutId: s.layoutId, texts: s.texts, imageUrl: s.imageUrl });
    writeFileSync(`public/landing/sample-${i + 1}.png`, png);
    console.log(`sample-${i + 1}.png`, s.layoutId, png.length, "bytes");
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
