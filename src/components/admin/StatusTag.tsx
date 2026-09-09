/**
 * 관례 상태 태그 (admin-design.md Status).
 * Active/Pending/Suspended/Deleted 4종 + on/off용 success/error 별칭.
 */
const STYLES = {
  active: "bg-green-50 text-green-700 border-green-200",
  pending: "bg-orange-50 text-orange-700 border-orange-200",
  processing: "bg-[#E6F4FF] text-[#1677FF] border-[#91CAFF]", // antd 'processing' 파랑
  suspended: "bg-red-50 text-red-700 border-red-200",
  deleted: "bg-gray-100 text-gray-500 border-gray-200",
} as const;

export type StatusKind = keyof typeof STYLES;

export default function StatusTag({ kind, label }: { kind: StatusKind; label: string }) {
  return (
    <span
      className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${STYLES[kind]}`}
    >
      {label}
    </span>
  );
}
