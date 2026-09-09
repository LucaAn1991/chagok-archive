import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-log";
import { getOpsFlags, invalidateOpsCache, type OpsFlags } from "@/lib/server/ops";

/**
 * 긴급 스위치 (백오피스 기획 §2-⑤).
 * GET  — 현재 상태
 * PATCH — { planningEnabled?, imageGenEnabled?, disabledMessage?, reason }
 *         스위치 토글은 위험 행위라 reason 필수 (§2-⑥).
 */

export async function GET(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();
  return NextResponse.json({ flags: await getOpsFlags() });
}

export async function PATCH(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  const body = (await request.json().catch(() => null)) as
    | (Partial<OpsFlags> & { reason?: string })
    | null;
  if (!body) return NextResponse.json({ error: "요청 형식이 잘못됐어요." }, { status: 400 });
  if (!body.reason?.trim()) {
    return NextResponse.json({ error: "변경 사유를 입력해주세요." }, { status: 400 });
  }

  const patch: Partial<OpsFlags> = {};
  if (typeof body.planningEnabled === "boolean") patch.planningEnabled = body.planningEnabled;
  if (typeof body.imageGenEnabled === "boolean") patch.imageGenEnabled = body.imageGenEnabled;
  if (typeof body.disabledMessage === "string") {
    if (body.disabledMessage.length > 200) {
      return NextResponse.json({ error: "안내 문구는 200자 이내로 해주세요." }, { status: 400 });
    }
    patch.disabledMessage = body.disabledMessage.trim();
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "바꿀 값이 없어요." }, { status: 400 });
  }

  const before = await getOpsFlags();
  await adminDb.doc("ops/flags").set(patch, { merge: true });
  invalidateOpsCache();
  const after = { ...before, ...patch };

  await logAdminAction({
    actorUid: session.uid,
    actorEmail: session.email,
    action: "flags.toggle",
    targetType: "flags",
    targetId: "ops/flags",
    reason: body.reason,
    before: { ...before },
    after: { ...after },
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ flags: after });
}
