import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-log";
import { CARD_STYLES, STYLE_ORDER, isReady, type StyleId } from "@/lib/render/card-styles";

/**
 * 템플릿(스타일) 진열 관리 (백오피스 기획 §2-①) — 우리의 상품 카탈로그.
 *
 * 코드(card-styles.ts)는 «그리는 법»을 계속 갖고, 여기는 «진열 속성»만 얹는다 —
 * Firestore `ops/styles` 문서: { hidden: string[], names: {id: 표시이름} }.
 * 숨김은 **신규 선택만** 막는다 — 이미 그 스타일로 만든 카드의 렌더는 불변.
 * 순서는 서비스가 의도적으로 섞어서(plan/new 09-02 — 앞자리 편향 방지) v1에선
 * 서비스에 반영하지 않는다 — 진열 순서 도입 여부는 팀 결정 대기.
 *
 * GET — 코드 정의 + 진열 속성 + 최근 30일 선택 수 (진열 순서대로)
 * PATCH { styleId, visible?, displayName? } 또는 { order: string[] } — 드래그 정렬 저장
 */

/** overlay.order(진열 순서)를 앞세우고, 목록에 없는 id는 코드 순서대로 뒤에 붙인다 */
function displayOrderOf(overlayOrder: unknown): string[] {
  const saved = Array.isArray(overlayOrder)
    ? (overlayOrder as string[]).filter((id) => id in CARD_STYLES)
    : [];
  return [...saved, ...STYLE_ORDER.filter((id) => !saved.includes(id))];
}

/**
 * 템플릿 등록일 — 코드로 추가되는 자산이라 문서가 아니라 git 이력이 출처다
 * (082aef4 09-02 최초 6종 · ec242e4 09-03 추가 4벌). 새 템플릿을 코드에
 * 추가할 때 여기에도 한 줄 더한다.
 */
const ADDED_ON: Record<string, string> = {
  "bold-graphic": "2026-09-02",
  "photo-frame": "2026-09-02",
  "serif-soft": "2026-09-02",
  promo: "2026-09-02",
  pixel: "2026-09-02",
  character: "2026-09-02",
  neon: "2026-09-03",
  festival: "2026-09-03",
  diary: "2026-09-03",
  moody: "2026-09-03",
};

export async function GET(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  try {
    const overlay = (await adminDb.doc("ops/styles").get()).data() ?? {};
    const hidden = new Set((overlay.hidden as string[]) ?? []);
    const names = (overlay.names as Record<string, string>) ?? {};
    const ordered = displayOrderOf(overlay.order) as StyleId[];

    const monthAgo = Timestamp.fromDate(new Date(Date.now() - 30 * 86400000));
    const counts = await Promise.all(
      ordered.map((id) =>
        adminDb
          .collection("cards")
          .where("styleId", "==", id)
          .where("createdAt", ">=", monthAgo)
          .count()
          .get()
          .then((s) => s.data().count)
          .catch((e) => {
            // 복합 인덱스(styleId, createdAt)가 없으면 여기로 온다 — 조용히 0을 주면 못 알아챈다
            console.error(`[admin/styles] 선택 수 집계 실패 (${id})`, e);
            return 0;
          }),
      ),
    );

    const styles = ordered.map((id, i) => ({
      id,
      label: CARD_STYLES[id].label,
      displayName: names[id] ?? null,
      ready: isReady(CARD_STYLES[id]),
      visible: !hidden.has(id),
      pickedLast30d: counts[i],
      addedOn: ADDED_ON[id] ?? null,
      displayOrder: i + 1,
    }));
    return NextResponse.json({ styles });
  } catch (e) {
    console.error("[admin/styles]", e);
    return NextResponse.json({ error: "목록을 불러오지 못했어요." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  const body = (await request.json().catch(() => null)) as
    | { styleId?: string; visible?: boolean; displayName?: string; order?: string[] }
    | null;

  const ref = adminDb.doc("ops/styles");
  const overlay = (await ref.get()).data() ?? {};
  const hidden = new Set((overlay.hidden as string[]) ?? []);
  const names = (overlay.names as Record<string, string>) ?? {};
  const savedOrder = displayOrderOf(overlay.order);

  // 드래그 정렬 저장 — 전체 순서를 한 번에
  if (Array.isArray(body?.order)) {
    const ids = body.order;
    if (
      ids.length !== STYLE_ORDER.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !(id in CARD_STYLES))
    ) {
      return NextResponse.json({ error: "목록이 최신이 아니에요. 새로고침 해주세요." }, { status: 409 });
    }
    await ref.set({ hidden: [...hidden], names, order: ids }, { merge: false });
    await logAdminAction({
      actorUid: session.uid,
      actorEmail: session.email,
      action: "template.update",
      targetType: "template",
      targetId: "reorder",
      before: { order: savedOrder },
      after: { order: ids },
    });
    return NextResponse.json({ ok: true });
  }

  const styleId = body?.styleId;
  if (!styleId || !(styleId in CARD_STYLES)) {
    return NextResponse.json({ error: "없는 템플릿이에요." }, { status: 400 });
  }
  const before = { visible: !hidden.has(styleId), displayName: names[styleId] ?? null };

  if (typeof body?.visible === "boolean") {
    if (!body.visible) {
      // 검증: 전부 숨기면 고를 게 없다 — 준비된 것 중 최소 1개는 남긴다
      const wouldRemain = STYLE_ORDER.filter(
        (id) => isReady(CARD_STYLES[id as StyleId]) && !hidden.has(id) && id !== styleId,
      );
      if (wouldRemain.length === 0) {
        return NextResponse.json(
          { error: "마지막 남은 템플릿은 숨길 수 없어요." },
          { status: 400 },
        );
      }
      hidden.add(styleId);
    } else {
      hidden.delete(styleId);
    }
  }
  if (typeof body?.displayName === "string") {
    const name = body.displayName.trim();
    if (name.length > 20) {
      return NextResponse.json({ error: "표시 이름은 20자 이내로 해주세요." }, { status: 400 });
    }
    if (name) names[styleId] = name;
    else delete names[styleId];
  }

  await ref.set({ hidden: [...hidden], names, order: savedOrder }, { merge: false });
  await logAdminAction({
    actorUid: session.uid,
    actorEmail: session.email,
    action: "template.update",
    targetType: "template",
    targetId: styleId,
    before,
    after: { visible: !hidden.has(styleId), displayName: names[styleId] ?? null },
  });
  return NextResponse.json({ ok: true });
}
