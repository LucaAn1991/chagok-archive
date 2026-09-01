import type { CardStatus } from "@/types";

/**
 * 카드 상태 배지 — DESIGN.md §11 상태 모델.
 * 상태색(--st-*)은 대비가 낮아 텍스트에 쓸 수 없다(§15) — 점(indicator)에만 칠하고
 * 글자는 --sub로 쓴다. 색만으로 상태를 구분하지 않는다는 규칙(§15)도 라벨 병행으로 지킨다.
 * 발행 완료는 점 대신 ✓ — 끝난 일임이 한눈에 보이게 (08-31).
 */
const STATUS_LABEL: Record<CardStatus, string> = {
  planned: "제작 대기",
  pending: "업로드 대기", // 09-01 팀 합의 — «올리기만 남음»은 좁은 타일에서 잘려 원복
  published: "발행 완료",
  discarded: "버림",
};

const STATUS_COLOR: Record<CardStatus, string> = {
  planned: "var(--st-planned)",
  pending: "var(--st-pending)",
  published: "var(--st-published)",
  discarded: "var(--st-discarded)",
};

export default function StatusBadge({ status: rawStatus }: { status: CardStatus }) {
  // 과도기 방어 — DB에 남은 옛 'crafted' 값은 pending으로 보여준다 (08-31 상태 개편)
  const status: CardStatus = STATUS_LABEL[rawStatus] ? rawStatus : "pending";
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill bg-surface-muted px-2.5 py-1 text-caption font-medium",
        // 진행 중 상태는 또렷하게, 끝난 상태(발행 완료)만 차분한 회색 (09-01)
        status === "published" ? "text-sub" : "text-ink",
      ].join(" ")}
    >
      {status === "published" ? (
        <span aria-hidden className="font-semibold">
          ✓
        </span>
      ) : ( // 09-01 — 점 복원. 빨간 느낌은 점이 아니라 색(--st-pending)을 고쳐 해결
        <span
          aria-hidden
          className="h-2 w-2 rounded-pill"
          style={{ background: STATUS_COLOR[status] }}
        />
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}
