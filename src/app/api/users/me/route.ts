import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { verifyRequest } from "@/lib/server/request-auth";
import type { ToneKey } from "@/types";

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
