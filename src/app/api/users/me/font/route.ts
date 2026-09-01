import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";
import { getAdminApp } from "@/lib/firebase/admin";
import { verifyRequest } from "@/lib/server/request-auth";

/**
 * POST /api/users/me/font — 「내 스타일」에 쓸 폰트 파일 업로드 (08-31).
 *
 * **파일 본체가 서버를 거친다.** 사진(F13)은 서명 URL로 브라우저 → Storage 직행인데
 * 폰트는 다르다 — 올라온 게 진짜 폰트인지, **한글이 들어 있는지** 서버가 봐야 한다.
 * 라틴 전용 폰트를 그냥 받으면 카드가 네모(□)로 도배된다. 8MB 한 번이라 부담도 적다.
 *
 * **satori는 `.ttf`·`.otf`만 읽는다.** `.woff2`는 못 읽어서 아예 거절한다 —
 * 받아놓고 나중에 「왜 안 나오지」가 되는 것보다 낫다.
 */

/** 폰트 1개 상한. 한글 폰트는 글자 수가 많아 5~8MB가 흔하다 */
const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await verifyRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("font");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "폰트 파일을 선택해주세요." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `폰트 파일은 ${MAX_BYTES / 1024 / 1024}MB까지 올릴 수 있어요.` },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  const kind = sniffFont(bytes);
  if (!kind) {
    return NextResponse.json(
      { error: "TTF 또는 OTF 파일만 올릴 수 있어요. (woff·woff2는 지원하지 않아요)" },
      { status: 400 },
    );
  }
  if (!hasHangul(bytes)) {
    return NextResponse.json(
      { error: "한글이 들어 있지 않은 폰트예요. 한글을 지원하는 폰트를 올려주세요." },
      { status: 400 },
    );
  }

  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    return NextResponse.json({ error: "지금은 폰트를 올릴 수 없어요." }, { status: 503 });
  }

  // 사용자당 한 벌만 둔다 — 새로 올리면 덮어쓴다. 여러 벌을 쌓아둘 이유가 없다
  const path = `users/${session.uid}/fonts/card-font.${kind}`;
  const token = randomUUID();

  try {
    const bucket = getStorage(getAdminApp()).bucket(bucketName);
    const [exists] = await bucket.exists();
    if (!exists) {
      return NextResponse.json({ error: "지금은 폰트를 올릴 수 없어요." }, { status: 503 });
    }
    await bucket.file(path).save(bytes, {
      contentType: kind === "ttf" ? "font/ttf" : "font/otf",
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });

    const url =
      `https://firebasestorage.googleapis.com/v0/b/${bucketName}` +
      `/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

    // 주소만 돌려준다. users.brand에 넣는 건 PATCH /api/users/me가 한다
    return NextResponse.json({ url, name: file.name, kind });
  } catch (e) {
    console.error("[font-upload]", e);
    return NextResponse.json({ error: "폰트를 올리지 못했어요." }, { status: 500 });
  }
}

/**
 * 진짜 폰트인지 앞머리 4바이트로 본다.
 *
 * `00 01 00 00` 또는 `true` — TrueType(.ttf)
 * `OTTO` — CFF 기반 OpenType(.otf)
 * `wOFF`·`wOF2` — satori가 못 읽으므로 여기서 걸러진다
 */
function sniffFont(b: Buffer): "ttf" | "otf" | null {
  if (b.length < 4) return null;
  const tag = b.subarray(0, 4);
  if (tag.equals(Buffer.from([0x00, 0x01, 0x00, 0x00]))) return "ttf";
  if (tag.toString("latin1") === "true") return "ttf";
  if (tag.toString("latin1") === "OTTO") return "otf";
  return null;
}

/**
 * 한글 글자가 실제로 들어 있는지 `cmap` 테이블에서 확인한다.
 *
 * 라틴 전용 폰트를 받으면 카드가 통째로 네모(□)가 되는데, 그건 만들고 나서야
 * 보인다. 올리는 순간 막는 편이 낫다.
 *
 * 완성형 한글 「가」(U+AC00) 하나만 본다 — 한글 폰트라면 반드시 있고,
 * 없으면 한글 폰트가 아니다. 형식 4(대부분의 한글 폰트)와 12만 읽는다.
 */
function hasHangul(b: Buffer): boolean {
  try {
    const numTables = b.readUInt16BE(4);
    let cmapOffset = 0;
    for (let i = 0; i < numTables; i++) {
      const p = 12 + i * 16;
      if (b.subarray(p, p + 4).toString("latin1") === "cmap") {
        cmapOffset = b.readUInt32BE(p + 8);
        break;
      }
    }
    if (!cmapOffset) return false;

    const numSub = b.readUInt16BE(cmapOffset + 2);
    for (let i = 0; i < numSub; i++) {
      const rec = cmapOffset + 4 + i * 8;
      const sub = cmapOffset + b.readUInt32BE(rec + 4);
      const format = b.readUInt16BE(sub);
      if (format === 4 && lookupFormat4(b, sub, 0xac00)) return true;
      if (format === 12 && lookupFormat12(b, sub, 0xac00)) return true;
    }
    return false;
  } catch {
    // 표를 못 읽으면 판단을 포기하고 통과시킨다 — 멀쩡한 폰트를 막는 쪽이 더 나쁘다
    return true;
  }
}

function lookupFormat4(b: Buffer, sub: number, cp: number): boolean {
  const segX2 = b.readUInt16BE(sub + 6);
  const endBase = sub + 14;
  const startBase = endBase + segX2 + 2;
  for (let s = 0; s < segX2; s += 2) {
    const end = b.readUInt16BE(endBase + s);
    if (cp <= end) return cp >= b.readUInt16BE(startBase + s);
  }
  return false;
}

function lookupFormat12(b: Buffer, sub: number, cp: number): boolean {
  const nGroups = b.readUInt32BE(sub + 12);
  for (let i = 0; i < nGroups; i++) {
    const g = sub + 16 + i * 12;
    if (cp >= b.readUInt32BE(g) && cp <= b.readUInt32BE(g + 4)) return true;
  }
  return false;
}
