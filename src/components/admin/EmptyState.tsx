/** 데이터 없음 표시 (admin-design.md). 장식 없이 글자만 — 표·목록·자리 표시 공용 */
export default function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-12 text-center">
      <p className="text-sm text-[#6B7280]">{title}</p>
      {description && <p className="text-xs text-[#6B7280]">{description}</p>}
    </div>
  );
}
