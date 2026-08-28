"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import PlanPhotoPicker from "@/components/PlanPhotoPicker";

/**
 * 기획안 패널 — DESIGN.md §7.
 * >=1280에서만 우측 320 고정으로 뜬다. 그보다 좁으면 대화 중간에 인라인 카드로 등장.
 * 내용: 주제 · 대상 · 목적 · 기획의도. **날짜는 없다** — 날짜는 확정 시점에 배정된다.
 *
 * AI가 먼저 정해 채우고, 사용자는 **여기서 부분 수정한다** (DESIGN §1 · PRD §5-7 ②).
 * 후보를 골라야 진행되는 선택 폼은 만들지 않는다 (08-27 확정).
 */
export type PlanSummary = {
  topic: string;
  audiences: string[];
  purposes: string[];
  intent: string;
};

export type PlanSummaryPatch = Partial<PlanSummary>;

/** "A · B, C" 같은 입력을 배열로 — 쉼표·가운뎃점 모두 구분자로 받는다 */
function splitList(value: string): string[] {
  return value
    .split(/[,·]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function EditableRow({
  label,
  display,
  editValue,
  multiline,
  onSave,
}: {
  label: string;
  display: string;
  editValue: string;
  multiline?: boolean;
  onSave: (raw: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(editValue);

  function start() {
    setDraft(editValue);
    setEditing(true);
  }
  function save() {
    setEditing(false);
    if (draft.trim() && draft !== editValue) onSave(draft);
  }

  if (!editing) {
    return (
      <div>
        <dt className="flex items-center gap-1.5 text-label font-semibold text-sub">
          {label}
          {display && (
            <button
              type="button"
              onClick={start}
              aria-label={`${label} 수정`}
              className="flex h-6 w-6 items-center justify-center rounded-sm text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
            >
              <Pencil size={12} aria-hidden />
            </button>
          )}
        </dt>
        <dd className="mt-1 whitespace-pre-wrap text-body text-ink">
          {display || <span className="text-sub">대화하면서 채워져요</span>}
        </dd>
      </div>
    );
  }

  return (
    <div>
      <dt className="text-label font-semibold text-sub">{label}</dt>
      <dd className="mt-1.5 flex items-start gap-1.5">
        {multiline ? (
          <textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
            className="min-w-0 flex-1 resize-none rounded-md border border-line bg-surface px-3 py-2 text-body text-ink"
          />
        ) : (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            className="h-10 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-body text-ink"
          />
        )}
        <button
          type="button"
          onClick={save}
          aria-label="저장"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-berry text-white transition-colors duration-200 hover:bg-berry-dark"
        >
          <Check size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="취소"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line text-sub transition-colors duration-200 hover:bg-surface-muted"
        >
          <X size={16} aria-hidden />
        </button>
      </dd>
    </div>
  );
}

function SummaryBody({
  summary,
  onSave,
}: {
  summary: PlanSummary;
  onSave: (patch: PlanSummaryPatch) => void;
}) {
  return (
    <dl className="flex flex-col gap-4">
      <EditableRow
        label="주제"
        display={summary.topic}
        editValue={summary.topic}
        onSave={(raw) => onSave({ topic: raw.trim() })}
      />
      <EditableRow
        label="대상"
        display={summary.audiences.join(" · ")}
        editValue={summary.audiences.join(", ")}
        onSave={(raw) => onSave({ audiences: splitList(raw) })}
      />
      {/* «목적»은 화면에 노출하지 않는다 (08-28 — 용어 금지). 값은 대상에 딸려 AI가 정한다 */}
      <EditableRow
        label="기획의도"
        display={summary.intent}
        editValue={summary.intent}
        multiline
        onSave={(raw) => onSave({ intent: raw.trim() })}
      />
    </dl>
  );
}

/**
 * 그라데이션 테두리 — 허용 4곳 중 「AI가 만든 기획 카드 테두리」 (DESIGN.md §2).
 * 1px 패딩 배경으로 테두리만 그라데이션이 되게 한다.
 */
function GradientFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg p-px" style={{ background: "var(--grad)" }}>
      <div className="rounded-[15px] bg-surface p-5">{children}</div>
    </div>
  );
}

/*
  [이대로 카드 만들기] CTA는 이 카드가 아니라 화면 하단 액션 바에 있다 —
  다음 행동이 두 곳에 갈리면 사용자가 어디로 가야 할지 흐려진다 (DESIGN §16, 08-27 피드백).
*/
/** 사진 상태 — 페이지가 들고 있고 카드가 표시한다 */
export type PlanPhotos = {
  selectedStockId: string | null;
  userPhotos: string[];
  onSelectStock: (id: string) => void;
  onAddUserPhotos: (files: FileList) => void;
  onRemoveUserPhoto: (url: string) => void;
};

type PanelProps = {
  summary: PlanSummary;
  onSave: (patch: PlanSummaryPatch) => void;
  photos: PlanPhotos;
  showPhotos: boolean; // 기획 확정 후에만 사진 섹션을 연다
};

/** >=1280 우측 고정 패널 */
export default function PlanningSummaryPanel({ summary, onSave, photos, showPhotos }: PanelProps) {
  return (
    <aside className="hidden w-[320px] shrink-0 min-[1280px]:block">
      <div className="sticky top-6">
        <GradientFrame>
          <h2 className="text-title font-bold text-ink">기획안</h2>
          <div className="mt-4">
            <SummaryBody summary={summary} onSave={onSave} />
          </div>
          {showPhotos && (
            <div className="mt-4 border-t border-line pt-4">
              <PlanPhotoPicker {...photos} />
            </div>
          )}
        </GradientFrame>
      </div>
    </aside>
  );
}

/** <1280 — 대화 중간에 인라인으로 등장하는 같은 내용의 카드 */
export function PlanningSummaryInline({ summary, onSave, photos, showPhotos }: PanelProps) {
  return (
    <div className="min-[1280px]:hidden">
      <GradientFrame>
        <h2 className="text-body font-bold text-ink">기획안</h2>
        <div className="mt-3">
          <SummaryBody summary={summary} onSave={onSave} />
        </div>
        {showPhotos && (
          <div className="mt-4 border-t border-line pt-4">
            <PlanPhotoPicker {...photos} />
          </div>
        )}
      </GradientFrame>
    </div>
  );
}
