/**
 * `/` — 비로그인이면 랜딩, 로그인이면 홈 (PLAN.md §5 「PRD와 다르게 판단한 지점」 1).
 * 로그인 상태 분기는 인증 구현과 함께 붙는다.
 */
export default function RootPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
      <h1 className="text-xl font-bold">차곡</h1>
      <p className="text-sm">
        [TODO: 로그인 상태 분기 — 비로그인: 랜딩(제품 소개 · 시작하기 CTA) /
        로그인: 홈(오늘의 카드 · 상태 A·B·C)]
      </p>
    </main>
  );
}
