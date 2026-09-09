import PageHeader from "./PageHeader";
import EmptyState from "./EmptyState";

/**
 * 아직 안 만든 admin 탭의 자리 표시 (백오피스 기획 §6 단계별 구현).
 * 어느 단계에서 채워지는지 적어 «비어 있는 게 아니라 예정»임을 보여준다.
 */
export default function ComingSoon({
  title,
  items,
  phase,
}: {
  title: string;
  items: string[];
  phase: string;
}) {
  return (
    <div>
      <PageHeader breadcrumb={[{ label: "관리자", href: "/admin" }, { label: title }]} title={title} />
      <div className="rounded-md border border-[#E5E7EB] bg-white px-5">
        <EmptyState title={`${phase}에서 채워져요`} />
        <ul className="list-disc pb-6 pl-5 text-sm text-[#6B7280]">
          {items.map((item) => (
            <li key={item} className="py-0.5">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
