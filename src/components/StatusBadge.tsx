import type { CardStatus } from "@/types";

/**
 * 카드 상태 배지 — DESIGN.md §11 상태 모델.
 * 상태색(--st-*)은 대비가 낮아 텍스트에 쓸 수 없다(§15) — 점(indicator)에만 칠하고
 * 글자는 --sub로 쓴다. 색만으로 상태를 구분하지 않는다는 규칙(§15)도 라벨 병행으로 지킨다.
 */
const STATUS_LABEL: Record<CardStatus, string> = {
  planned: "기획 완료",
  crafted: "제작 완료",
  pending: "업로드 대기",
  published: "발행 완료",
  discarded: "버림",
};

const STATUS_COLOR: Record<CardStatus, string> = {
  planned: "var(--st-planned)",
  crafted: "var(--st-crafted)",
  pending: "var(--st-pending)",
  published: "var(--st-published)",
  discarded: "var(--st-discarded)",
};

export default function StatusBadge({ status }: { status: CardStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-surface-muted px-2.5 py-1 text-caption font-medium text-sub">
      <span
        aria-hidden
        className="h-2 w-2 rounded-pill"
        style={{ background: STATUS_COLOR[status] }}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}
