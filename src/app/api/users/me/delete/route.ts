import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/server/request-auth";
import { destroyUser } from "@/lib/server/user-deletion";

/**
 * POST /api/users/me/delete — 회원 탈퇴 시 개인정보 파기 (09-02 · 처리방침 3항).
 *
 * 파기 본체는 `lib/server/user-deletion.ts` — 탈퇴 대행·잔여물 재실행(백오피스)과
 * 같은 코드를 쓴다 (09-08 추출). 시도 기록(deletion_attempts)도 거기서 관리한다.
 *
 * 방침 3항의 «남기는 항목»(부정 이용 기록 1년 · 이메일 해시 1년 · 결제 기록 5년)은
 * 현재 해당 데이터를 수집·저장하지 않아 처리할 것이 없다. 수집을 시작하면
 * 별도 저장소로 분리해 파기 로직에서 예외 처리해야 한다.
 *
 * 인스타그램 접근 토큰: 연동 기능 미구현 — 저장된 토큰이 없다. 구현 시
 * «즉시 삭제»를 파기 로직에 추가해야 한다.
 *
 * 설정 화면 UI(창현 님)에서는 lib/legal/consent-client.ts의 deleteMyAccount()를 호출한다.
 */
export async function POST(request: Request) {
  const session = await verifyRequest(request);
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const result = await destroyUser(session.uid);
  if (!result.ok) {
    // 어디까지 지웠든 다시 호출하면 이어서 지워진다 (멱등에 가깝게).
    // 실패 지점은 deletion_attempts에 남아 백오피스 처리함에 뜬다
    return NextResponse.json(
      { error: "탈퇴를 완료하지 못했어요. 한 번 더 시도해주세요." },
      { status: 500 },
    );
  }
  return NextResponse.json({ deleted: true });
}
