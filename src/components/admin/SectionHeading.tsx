/**
 * 목록 페이지의 소제목 줄 (09-09) — 왼쪽 제목, 오른쪽에 개수 같은 부속.
 * «검색·필터» 구역과 «목록» 구역을 눈으로 구분해준다.
 */
export default function SectionHeading({
  title,
  aside,
}: {
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between first:mt-0">
      <h3 className="text-base font-semibold text-[#1F2937]">{title}</h3>
      {aside}
    </div>
  );
}
