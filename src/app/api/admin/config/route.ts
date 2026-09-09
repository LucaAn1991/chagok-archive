import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-log";
import { getOpsConfig, invalidateOpsCache, type OpsConfig } from "@/lib/server/ops";
import { getSeoInfo, SEO_CACHE_TAG } from "@/lib/server/seo";

/**
 * 운영 설정 (백오피스 기획 §2-⑤) — 한도·연락처 + 기본 정보(SEO).
 * GET / PATCH { ...바꿀 값, reason? }
 * SEO 필드를 바꾸면 revalidateTag로 메타데이터 캐시를 즉시 갱신한다.
 */

/** 한도별 허용 범위 — 실수로 0이나 10000을 넣는 사고를 막는다 */
const LIMIT_RANGES: Record<keyof Omit<OpsConfig, "contactEmail">, [number, number]> = {
  maxPlansPerDay: [1, 100],
  maxTurnsPerSession: [1, 100],
  maxRegenPerSlide: [0, 20],
  maxCardsPerRun: [1, 20],
  scheduleWeeks: [1, 52],
};

export async function GET(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();
  const [config, seo] = await Promise.all([getOpsConfig(), getSeoInfo()]);
  return NextResponse.json({ config: { ...config, ...seo } });
}

export async function PATCH(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  const body = (await request.json().catch(() => null)) as
    | (Partial<OpsConfig> & { reason?: string })
    | null;
  if (!body) return NextResponse.json({ error: "요청 형식이 잘못됐어요." }, { status: 400 });

  const patch: Partial<OpsConfig> = {};
  for (const key of Object.keys(LIMIT_RANGES) as (keyof typeof LIMIT_RANGES)[]) {
    const v = body[key];
    if (v === undefined) continue;
    const [min, max] = LIMIT_RANGES[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
      return NextResponse.json(
        { error: `${key}는 ${min}~${max} 사이의 정수여야 해요.` },
        { status: 400 },
      );
    }
    patch[key] = v;
  }
  if (typeof body.contactEmail === "string") patch.contactEmail = body.contactEmail.trim();

  // 기본 정보(SEO) — 검색 결과에 잘리지 않는 관례 길이로 제한.
  // 서비스명은 브랜드라 고정(«차곡») — 바꾸려는 요청은 거절한다 (09-09)
  const seoBody = body as { serviceName?: unknown; seoDescription?: unknown };
  let seoChanged = false;
  if (seoBody.serviceName !== undefined) {
    return NextResponse.json({ error: "서비스명은 변경할 수 없어요." }, { status: 400 });
  }
  if (typeof seoBody.seoDescription === "string") {
    const v = seoBody.seoDescription.trim();
    if (!v || v.length > 160) {
      return NextResponse.json({ error: "소개 문구는 1~160자로 해주세요." }, { status: 400 });
    }
    (patch as Record<string, unknown>).seoDescription = v;
    seoChanged = true;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "바꿀 값이 없어요." }, { status: 400 });
  }

  const [beforeConfig, beforeSeo] = await Promise.all([getOpsConfig(), getSeoInfo()]);
  const before = { ...beforeConfig, ...beforeSeo };
  await adminDb.doc("ops/config").set(patch, { merge: true });
  invalidateOpsCache();
  // 저장 순간만 메타 캐시 갱신 — Next 16은 두 번째 인자(만료 프로필)가 필수다
  if (seoChanged) revalidateTag(SEO_CACHE_TAG, "max");
  const after = { ...before, ...patch };

  await logAdminAction({
    actorUid: session.uid,
    actorEmail: session.email,
    action: "config.update",
    targetType: "config",
    targetId: "ops/config",
    reason: body.reason,
    before: { ...before },
    after: { ...after },
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ config: after });
}
