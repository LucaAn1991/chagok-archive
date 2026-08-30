/**
 * 설정-계정 — PLAN.md §4 화면 목록 참조.
 *
 * @TODO: 이 화면 작업 시 **로그아웃 버튼**을 반드시 포함할 것 (08-28 확정).
 *   지금 앱 어디에도 로그아웃 경로가 없다 — 한번 로그인하면 못 나온다.
 *   signOut(auth) 호출 → 랜딩(/)으로 이동. PLAN §2 «로그아웃» 행 참조.
 */
export default function AccountSettingsPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
      <h1 className="text-xl font-bold">설정-계정</h1>
      <p className="text-sm">[TODO: 화면 구현 — 이메일·비밀번호 변경 · 회원 탈퇴 · 로그아웃 버튼]</p>
    </main>
  );
}
