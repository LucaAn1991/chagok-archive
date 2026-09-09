import { NextResponse } from "next/server";
import { ensureDailyMetrics } from "@/lib/server/metrics-daily";

/**
 * 매일 아침 정기 작업 (백오피스 기획 §4 공통 기반 «정기 실행»).
 * Cloud Scheduler가 매일 KST 05:00에 부른다 —
 *   POST https://<도메인>/api/cron/daily  (헤더 x-cron-secret: $CRON_SECRET)
 *
 * 인증: 스케줄러만 아는 비밀 헤더. 값이 없거나 틀리면 404처럼 조용히 거절 —
 * 이 주소가 열려 있으면 아무나 집계를 반복 실행시켜 읽기 비용을 태울 수 있다.
 *
 * 지금 하는 일: metrics_daily 채우기.
 * @TODO: 5단계에서 추가 — 발행일 리마인드 발송 · 잔고 소진 알림 · 로그 보존 삭제(1년)
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const filled = await ensureDailyMetrics();
    return NextResponse.json({ ok: true, filled });
  } catch (e) {
    console.error("[cron/daily]", e);
    return NextResponse.json({ error: "집계에 실패했어요." }, { status: 500 });
  }
}
