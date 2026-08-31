import { NextResponse } from "next/server";
import { availableFontIds } from "@/lib/render/fonts";

/**
 * GET /api/fonts — 실제로 파일이 있는 내장 폰트 목록 (08-31).
 *
 * 폰트 파일은 서버에만 있어서(`src/lib/render/fonts/`) 화면이 직접 알 수 없다.
 * **고를 수 없는 폰트를 목록에 띄우지 않으려고** 물어본다 —
 * 골랐는데 기본 폰트로 나오면 «왜 안 바뀌지»가 된다.
 *
 * 로그인 검사를 하지 않는다. 어떤 폰트를 쓸 수 있는지는 비밀이 아니다.
 */
export async function GET() {
  return NextResponse.json({ fontIds: await availableFontIds() });
}
