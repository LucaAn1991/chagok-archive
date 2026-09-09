import { NextResponse } from "next/server";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";
import { getTrend } from "@/lib/server/metrics-daily";

/**
 * 추이 그래프 데이터 (백오피스 기획 §2-④ ❸층) — 최근 30일 일일 스냅샷.
 * 크론이 놓친 날짜가 있으면 여기서 채워진다(안전망).
 */
export async function GET(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  try {
    return NextResponse.json({ trend: await getTrend(30) });
  } catch (e) {
    console.error("[admin/metrics/trend]", e);
    return NextResponse.json({ error: "추이를 불러오지 못했어요." }, { status: 500 });
  }
}
