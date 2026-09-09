/**
 * 테이블 위 검색·필터 줄 (admin-design.md Filter).
 * 내용은 페이지가 채운다 — input·select를 children으로 나열하면 한 줄로 배치된다.
 */
export default function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-[#E5E7EB] bg-white px-4 py-3">
      {children}
    </div>
  );
}
