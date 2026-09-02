import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { verifyRequest } from "@/lib/server/request-auth";
import type { Brand, FontId, ToneKey } from "@/types";
import { isHexColor } from "@/lib/render/themes";
import { BUILT_IN_FONTS } from "@/lib/render/font-registry";
import { STYLE_EXAMPLES, STYLE_EXAMPLE_IDS } from "@/lib/style-examples";

/**
 * PATCH /api/users/me — 온보딩 저장 · 콘텐츠 설정 수정 (PLAN §6 · F1 · 설정).
 *
 * onboardedAt은 클라이언트 쓰기가 규칙으로 막혀 있어(§7, 08-27 확정)
 * 온보딩 완료 표시는 반드시 이 라우트를 거친다. 문서에 활동 분야와
 * 업로드 빈도가 모두 채워지는 순간 onboardedAt을 기록한다.
 *
 * users 문서가 없으면 여기서 만든다 — 회원가입 때 계정만 생기고 문서
 * 생성이 실패한 계정의 복구 경로다 (signup/page.tsx의 주석 참조).
 *
 * 온보딩은 2문항이다(08-28 축소 · PLAN 변경 이력). 말투·피할 표현은
 * 설정-콘텐츠에서 이 같은 라우트로 저장한다.
 */

const TONE_KEYS: ToneKey[] = ["friendly", "calm", "energetic", "professional"];

const FONT_IDS: FontId[] = [...BUILT_IN_FONTS.map((f) => f.id), "custom"];

/**
 * 「내 스타일」 검증 (08-31).
 *
 * **글자색은 받지 않는다** — 배경 명도로 계산한다(DESIGN.md §12).
 * 색은 `#RRGGBB`만 받는다. 세 자리 축약이나 `red` 같은 이름을 허용하면
 * 렌더러에서 명도 계산이 깨진다.
 */
function parseBrand(raw: unknown): Brand | null | undefined {
  if (raw === null) return null; // 「기본으로 되돌리기」
  if (typeof raw !== "object") return undefined;

  const b = raw as Record<string, unknown>;
  // 강조색만 필수다 (09-02) — 배경색·글꼴은 설정 화면에서 빠졌다
  if (!isHexColor(b.accent)) return undefined;

  const brand: Brand = { accent: b.accent.toUpperCase() };
  // 옛 계정이 보내오면 그대로 받아둔다. 새로 만들지는 않는다
  if (isHexColor(b.bg)) brand.bg = b.bg.toUpperCase();
  if (typeof b.fontId === "string" && FONT_IDS.includes(b.fontId as FontId)) {
    brand.fontId = b.fontId as FontId;
  }

  // 올린 폰트를 고른 경우에만 주소를 함께 둔다 — 안 그러면 지워진 파일을 계속 가리킨다
  if (brand.fontId === "custom") {
    if (typeof b.customFontUrl !== "string" || !b.customFontUrl.startsWith("https://")) {
      return undefined;
    }
    brand.customFontUrl = b.customFontUrl;
    brand.customFontName = typeof b.customFontName === "string" ? b.customFontName : null;
  }

  return brand;
}

export async function PATCH(request: Request) {
  const session = await verifyRequest(request);
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  // ── 허용된 필드만 골라 검증한다 — 그 외 키는 조용히 무시 ──
  const updates: Record<string, unknown> = {};

  if (body.field !== undefined) {
    const field = typeof body.field === "string" ? body.field.trim() : "";
    if (!field || field.length > 200) {
      return NextResponse.json({ error: "활동 분야를 확인해주세요." }, { status: 400 });
    }
    updates.field = field;
  }

  if (body.uploadFrequency !== undefined) {
    const n = body.uploadFrequency;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 7) {
      return NextResponse.json({ error: "업로드 빈도를 확인해주세요." }, { status: 400 });
    }
    updates.uploadFrequency = n;
  }

  if (body.uploadDays !== undefined) {
    const raw = body.uploadDays;
    const valid =
      Array.isArray(raw) &&
      raw.every((v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6) &&
      new Set(raw).size === raw.length;
    if (!valid) {
      return NextResponse.json({ error: "요일 값을 확인해주세요." }, { status: 400 });
    }
    updates.uploadDays = [...(raw as number[])].sort();
  }

  // 주기와 요일이 같이 오면 개수가 맞아야 한다 (0=월 … 6=일)
  if (
    updates.uploadFrequency !== undefined &&
    updates.uploadDays !== undefined &&
    (updates.uploadDays as number[]).length !== updates.uploadFrequency
  ) {
    return NextResponse.json({ error: "주기와 요일 개수가 맞지 않아요." }, { status: 400 });
  }

  if (body.visualPreferences !== undefined) {
    const vp = body.visualPreferences;
    if (vp === null) {
      updates.visualPreferences = null; // «잘 모르겠어요»
    } else {
      const sel = (vp as { selectedExamples?: unknown })?.selectedExamples;
      const valid =
        Array.isArray(sel) &&
        sel.length >= 1 &&
        sel.length <= STYLE_EXAMPLE_IDS.length &&
        sel.every((v) => typeof v === "string" && STYLE_EXAMPLE_IDS.includes(v)) &&
        new Set(sel).size === sel.length;
      if (!valid) {
        return NextResponse.json({ error: "게시물 취향 값을 확인해주세요." }, { status: 400 });
      }
      // 속성·형식은 클라이언트를 믿지 않고 서버가 id로 다시 매핑한다
      const ids = sel as string[];
      const picked = ids.map((id) => STYLE_EXAMPLES.find((e) => e.id === id)!);
      updates.visualPreferences = {
        selectedExamples: ids,
        attributes: picked.map((e) => e.attributes),
        contentFormats: picked.map((e) => e.contentFormat),
      };
    }
  }

  if (body.brand !== undefined) {
    const brand = parseBrand(body.brand);
    if (brand === undefined) {
      return NextResponse.json({ error: "스타일 값이 올바르지 않아요." }, { status: 400 });
    }
    updates.brand = brand;
  }

  if (body.tone !== undefined) {
    if (body.tone !== null && !TONE_KEYS.includes(body.tone as ToneKey)) {
      return NextResponse.json({ error: "말투 값을 확인해주세요." }, { status: 400 });
    }
    updates.tone = body.tone;
  }

  if (body.avoidExpressions !== undefined) {
    const raw = body.avoidExpressions;
    if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string")) {
      return NextResponse.json({ error: "피할 표현 값을 확인해주세요." }, { status: 400 });
    }
    const list = raw.map((v: string) => v.trim()).filter(Boolean);
    if (list.length > 20 || list.some((v) => v.length > 30)) {
      return NextResponse.json({ error: "피할 표현은 30자 이하로 20개까지예요." }, { status: 400 });
    }
    updates.avoidExpressions = list;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "저장할 내용이 없습니다." }, { status: 400 });
  }

  try {
    const ref = adminDb.doc(`users/${session.uid}`);
    const snap = await ref.get();

    // 문서 없음 → 기본 골격부터 만든다 (회원가입 실패 복구)
    if (!snap.exists) {
      const authUser = await adminAuth.getUser(session.uid);
      await ref.set({
        uid: session.uid,
        email: authUser.email ?? "",
        onboardedAt: null,
        createdAt: Timestamp.now(),
      });
    }

    const current = snap.exists ? snap.data()! : {};
    const merged = { ...current, ...updates };

    // 온보딩 완료 판정 — 두 문항이 다 채워졌고 아직 미완료면 지금 기록
    const onboardingDone =
      merged.onboardedAt == null &&
      typeof merged.field === "string" &&
      typeof merged.uploadFrequency === "number";

    if (onboardingDone) {
      updates.onboardedAt = Timestamp.now();
      // 설정에서 채우기 전까지의 기본값 — «안 정함»을 null·빈 배열로 표현
      if (merged.tone === undefined) updates.tone = null;
      if (merged.avoidExpressions === undefined) updates.avoidExpressions = [];
      if (merged.uploadDays === undefined) updates.uploadDays = [];
      if (merged.visualPreferences === undefined) updates.visualPreferences = null;
    }

    await ref.set(updates, { merge: true });
    return NextResponse.json({ ok: true, onboarded: onboardingDone || merged.onboardedAt != null });
  } catch {
    return NextResponse.json(
      { error: "저장하지 못했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
