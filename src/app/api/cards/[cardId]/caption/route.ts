import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { generateCaption, isClaudeConfigured } from "@/lib/ai/caption";
import type { Card } from "@/types";
import type { User } from "@/types";

/**
 * POST /api/cards/[cardId]/caption — 캡션 생성 (F7).
 *
 * caption은 AI 생성 필드라 보안 규칙이 클라이언트 쓰기를 막는다(PLAN.md §7 ②).
 * 그래서 생성·저장 모두 이 서버 라우트가 담당한다.
 * 클라이언트는 Authorization: Bearer <Firebase ID 토큰>으로 호출한다.
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/cards/[cardId]/caption">,
) {
  // 1. 인증 — 토큰이 없거나 무효면 401
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ error: "로그인이 만료됐어요. 다시 로그인해주세요." }, { status: 401 });
  }

  // 2. 카드 조회 + 소유 확인 — 남의 카드는 존재를 알리지 않고 404 (PLAN.md §4)
  const { cardId } = await ctx.params;
  const cardSnap = await adminDb.collection("cards").doc(cardId).get();
  const card = cardSnap.data() as Card | undefined;
  if (!card || card.userId !== uid) {
    return NextResponse.json({ error: "카드를 찾을 수 없어요." }, { status: 404 });
  }

  // 3. 온보딩 설정(말투·피할 표현) 로드
  const userSnap = await adminDb.collection("users").doc(uid).get();
  const user = userSnap.data() as User | undefined;
  if (!user) {
    return NextResponse.json({ error: "사용자 정보를 찾을 수 없어요." }, { status: 404 });
  }

  // 4. 캡션 생성 — 키가 없으면 목 모드 (src/lib/ai/caption.ts)
  try {
    const caption = await generateCaption({
      title: card.title,
      audience: card.audience,
      intent: card.intent,
      extraNote: card.extraNote,
      tone: user.tone,
      avoidExpressions: user.avoidExpressions,
    });

    await cardSnap.ref.update({
      caption,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ caption, mock: !isClaudeConfigured() });
  } catch {
    // 실패는 해당 영역 인라인 + [다시 만들기]로 표시한다 (DESIGN.md §13)
    return NextResponse.json(
      { error: "캡션을 만들지 못했어요. 다시 시도해주세요." },
      { status: 502 },
    );
  }
}
