"use client";

import type { User } from "firebase/auth";

/** admin 화면 공용 fetch — Bearer 토큰을 붙이고, 실패면 서버 메시지로 throw */
export async function adminFetch(
  user: User,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new Error((data?.error as string) ?? `요청 실패 (${res.status})`);
  return data ?? {};
}

/** CSV 다운로드 — 인증 헤더를 붙여 받아서 파일로 저장한다 */
export async function downloadCsv(user: User, path: string, filename: string): Promise<void> {
  const token = await user.getIdToken();
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `다운로드 실패 (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 셀에 쉼표·따옴표·줄바꿈이 있어도 깨지지 않게 감싼다 */
export function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
