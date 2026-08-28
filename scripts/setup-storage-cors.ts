/**
 * Storage 버킷 CORS 설정.
 *
 * 실행: npx tsx scripts/setup-storage-cors.ts [--show]
 *   --show 를 주면 현재 설정만 출력하고 끝낸다.
 *
 * 사진 업로드(F13)는 브라우저가 서명 URL로 Storage에 **직접** PUT 한다.
 * 다른 출처(localhost:3000)에서 오는 요청이라 버킷이 CORS로 허용하지 않으면
 * 브라우저가 요청 자체를 막는다 — 서버 로그에는 아무것도 남지 않아 원인을 찾기 어렵다.
 *
 * 허용 목록은 `storage.cors.json`에 있다. 배포 도메인이 생기면 그 파일의
 * origin에 추가하고 이 스크립트를 다시 실행한다.
 *
 * src/lib/firebase/admin.ts는 server-only라 스크립트에서 import할 수 없어
 * 여기서 직접 초기화한다 (scripts/seed-test-data.ts와 같은 방식).
 */
import { readFileSync } from "node:fs";
import { Storage } from "@google-cloud/storage";

/** .env.local을 직접 읽는다 — 스크립트는 Next.js 밖이라 자동 로드가 없다 */
function loadEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      env[trimmed.slice(0, eq)] = trimmed
        .slice(eq + 1)
        .replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

async function main() {
  const env = loadEnvLocal();
  const bucketName = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error(".env.local에 NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET이 없습니다.");
  }

  const storage = new Storage({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    credentials: {
      client_email: env.FIREBASE_ADMIN_CLIENT_EMAIL,
      private_key: (env.FIREBASE_ADMIN_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    },
  });

  const bucket = storage.bucket(bucketName);

  const [exists] = await bucket.exists();
  if (!exists) {
    throw new Error(
      `버킷을 찾을 수 없습니다: ${bucketName}\n` +
        "Firebase 콘솔 > Storage 에서 먼저 버킷을 만드세요 (README 「사진 업로드를 켜려면」).",
    );
  }

  if (process.argv.includes("--show")) {
    const [metadata] = await bucket.getMetadata();
    console.log(`버킷: ${bucketName}`);
    console.log(JSON.stringify(metadata.cors ?? "미설정", null, 2));
    return;
  }

  const cors = JSON.parse(readFileSync("storage.cors.json", "utf8"));
  await bucket.setCorsConfiguration(cors);

  // 실제로 반영됐는지 되읽어 확인한다 — 설정 API는 조용히 성공하는 경우가 있다
  const [metadata] = await bucket.getMetadata();
  console.log(`✔ CORS 설정 완료 — ${bucketName}`);
  console.log(JSON.stringify(metadata.cors, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
