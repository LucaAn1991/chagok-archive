import Link from "next/link";

/** 404 — 없는 주소 · 남의 카드 주소도 조회 결과가 없어 여기로 온다 (PLAN.md §4) */
export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
      <h1 className="text-xl font-bold">페이지를 찾을 수 없어요</h1>
      <p className="text-sm">
        주소가 바뀌었거나, 없는 페이지예요.
        {/* @TODO: DESIGN.md 톤에 맞춘 문구·일러스트 확정 (빨간색·경고 금지) */}
      </p>
      <Link href="/" className="text-sm underline underline-offset-4">
        홈으로 돌아가기
      </Link>
    </main>
  );
}
