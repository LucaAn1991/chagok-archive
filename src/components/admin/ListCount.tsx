/**
 * 목록 개수 요약 (admin-design.md) — SectionHeading의 aside 자리에 얹는다.
 * 필터·검색이 걸려 있으면 «검색 결과 N건 (전체 M건)», 아니면 «전체 N건».
 */
export default function ListCount({
  shown,
  total,
  filtered,
  className,
}: {
  shown: number;
  total: number;
  filtered: boolean;
  className?: string;
}) {
  // 서버가 이미 걸러 전체 수를 모르는 경우(shown === total)엔 결과 수만 적는다
  const label = !filtered
    ? `전체 ${total}건`
    : shown === total
      ? `검색 결과 ${shown}건`
      : `검색 결과 ${shown}건 (전체 ${total}건)`;
  return <span className={`text-[#6B7280] ${className ?? "text-xs"}`}>{label}</span>;
}
