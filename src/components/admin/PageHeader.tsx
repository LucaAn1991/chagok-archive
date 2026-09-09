import Link from "next/link";

/**
 * Breadcrumb + 페이지 제목(24px semibold) + 액션 줄 (admin-design.md).
 * breadcrumb의 마지막 항목이 현재 위치 — href 없이 넘긴다.
 * action은 제목과 같은 라인 오른쪽 끝 — 모든 페이지 공통 위치 (09-09, 별도 줄은 공백 낭비).
 */
export type Crumb = { label: string; href?: string };

export default function PageHeader({
  breadcrumb,
  title,
  action,
}: {
  breadcrumb: Crumb[];
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <nav className="mb-2 text-xs text-[#6B7280]">
        {breadcrumb.map((c, i) => (
          <span key={c.label}>
            {i > 0 && <span className="mx-1">/</span>}
            {c.href ? (
              <Link href={c.href} className="hover:text-[#1F2937]">
                {c.label}
              </Link>
            ) : (
              <span>{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[#1F2937]">{title}</h1>
        {action && <div className="flex gap-2">{action}</div>}
      </div>
    </div>
  );
}
