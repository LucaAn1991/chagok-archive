import { Check, PencilLine, Upload, X } from "lucide-react";
import type { CardStatus } from "@/types";

/**
 * 카드 상태 배지 — DESIGN.md §11 상태 모델.
 * 색상만으로 단계를 구분하지 않는다. 제작·업로드·발행을 서로 다른 아이콘과 표면으로
 * 보여줘, 빠르게 훑어도 다음 할 일을 알 수 있게 한다.
 */
const STATUS_LABEL: Record<CardStatus, string> = {
  planned: "제작 대기",
  pending: "업로드 대기", // 09-01 팀 합의 — «올리기만 남음»은 좁은 타일에서 잘려 원복
  published: "발행 완료",
  discarded: "버림",
};

export default function StatusBadge({ status: rawStatus }: { status: CardStatus }) {
  // 과도기 방어 — DB에 남은 옛 'crafted' 값은 pending으로 보여준다 (08-31 상태 개편)
  const status: CardStatus = STATUS_LABEL[rawStatus] ? rawStatus : "pending";
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 text-caption font-medium",
        // 제작 중은 윤곽, 업로드 대기는 연두 표면, 완료는 강한 채움으로 구분한다.
        status === "planned"
          ? "border border-st-planned bg-surface text-sub"
          : status === "pending"
            ? "bg-berry-light text-berry-dark"
            : status === "published"
              ? "bg-action text-on-action"
              : "bg-surface-muted text-sub",
      ].join(" ")}
    >
      {status === "planned" ? (
        <PencilLine size={13} strokeWidth={2} aria-hidden />
      ) : status === "pending" ? (
        <Upload size={13} strokeWidth={2} aria-hidden />
      ) : status === "published" ? (
        <Check size={13} strokeWidth={2.5} aria-hidden />
      ) : (
        <X size={13} strokeWidth={2} aria-hidden />
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}
