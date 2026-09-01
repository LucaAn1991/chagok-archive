import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { legalFileName } from "@/lib/legal/versions";
import ConsentScreen from "./consent-screen";

export const metadata: Metadata = { title: "약관 동의 — 차곡" };

/**
 * 약관 동의 (09-01) — 회원가입 완료 → **[약관 동의]** → 온보딩 4문항 → 홈.
 *
 * 가입 폼에 끼워 넣지 않고 별도 스텝으로 둔다 (가영 님 폼을 건드리지 않기 위해).
 * 진입은 온보딩 가드(src/app/onboarding/layout.tsx)와 홈 가드가 강제한다 —
 * 동의 없이 온보딩·홈으로 들어가면 이리로 돌려보낸다.
 *
 * 서버 컴포넌트 — 아코디언에 넣을 약관 본문(md 원문)을 읽어 클라이언트에 넘긴다.
 * 본문을 컴포넌트에 문자열로 옮겨 적지 않는다.
 */
export default function ConsentPage() {
  const read = (file: string) =>
    readFileSync(path.join(process.cwd(), "content", "legal", file), "utf8");

  return (
    <ConsentScreen termsMd={read(legalFileName("terms"))} privacyMd={read(legalFileName("privacy"))} />
  );
}
