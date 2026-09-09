import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { verifyRequest } from "@/lib/server/request-auth";

/**
 * 인앱 문의 (백오피스 기획 §2-②) — 사용자 쪽.
 * POST { category, body }  — 접수 (uid가 자동으로 붙는다 — 이메일 문의와 달리
 *                            «어느 계정이세요?»를 물을 필요가 없다)
 * GET                      — 내 문의 목록 (최신순)
 *
 * 서버만 읽기·쓰기 — firestore.rules에 안 열었다(기본 차단).
 * 답변은 admin API(inquiry.answer)가 단다.
 */

const CATEGORIES = ["bug", "account", "result", "etc"] as const;
export type InquiryCategory = (typeof CATEGORIES)[number];

const MAX_BODY = 2000;

export async function POST(request: Request) {
  const session = await verifyRequest(request);
  if (!session) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { category?: string; body?: string }
    | null;
  const category = CATEGORIES.includes(body?.category as InquiryCategory)
    ? (body?.category as InquiryCategory)
    : "etc";
  const text = body?.body?.trim() ?? "";
  if (!text) return NextResponse.json({ error: "문의 내용을 적어주세요." }, { status: 400 });
  if (text.length > MAX_BODY) {
    return NextResponse.json({ error: `문의는 ${MAX_BODY}자 이내로 적어주세요.` }, { status: 400 });
  }

  const ref = await adminDb.collection("inquiries").add({
    userId: session.uid,
    category,
    body: text,
    status: "open",
    createdAt: FieldValue.serverTimestamp(),
    answer: null,
  });
  return NextResponse.json({ id: ref.id });
}

export async function GET(request: Request) {
  const session = await verifyRequest(request);
  if (!session) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  // 인덱스 없이 간다 — userId 단일 필드 쿼리 후 서버에서 정렬 (개인당 문의는 소수)
  const snap = await adminDb.collection("inquiries").where("userId", "==", session.uid).get();
  const inquiries = snap.docs
    .map((d) => {
      const v = d.data();
      return {
        id: d.id,
        category: (v.category as string) ?? "etc",
        body: (v.body as string) ?? "",
        status: (v.status as string) ?? "open",
        createdAt: v.createdAt?.toDate?.()?.toISOString() ?? null,
        answer: (v.answer as { body: string; answeredAt: string } | null) ?? null,
      };
    })
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return NextResponse.json({ inquiries });
}
