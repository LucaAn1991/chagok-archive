"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Pencil, X } from "lucide-react";
import PlanPhotoPicker from "@/components/PlanPhotoPicker";
import type { StockPick } from "@/types";

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

/**
 * 주제 한 줄 편집기 — 대상 선택 카드와 기획안 패널이 **같은 컴포넌트**를 쓴다 (08-28).
 * 라벨 「주제」 · 현재 값(말줄임) · 오른쪽 연필. 탭하면 그 자리가 입력 칸으로 바뀐다.
 * 모달·새 화면·바텀시트를 열지 않는다 — 대상 선택 상태가 시야에서 사라지면 안 된다.
 * 카드 생성 후에는 locked — 연필 대신 [이어서 기획하기].
 */
export function TopicLine({
  topic,
  onSave,
  locked,
  continueHref,
}: {
  topic: string;
  onSave: (next: string) => void;
  locked?: boolean;
  continueHref?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(topic);

  function start() {
    setDraft(topic);
    setEditing(true);
  }
  function save() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== topic) onSave(next);
  }

  if (locked) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-label font-semibold text-sub">주제</span>
        <span className="min-w-0 flex-1 truncate text-body text-ink">{topic}</span>
        {continueHref && (
          <Link
            href={continueHref}
            className="shrink-0 text-body font-semibold text-berry transition-colors duration-200 hover:text-berry-dark"
          >
            이어서 기획하기
          </Link>
        )}
      </div>
    );
  }

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-label font-semibold text-sub">주제</span>
        <span className="min-w-0 flex-1 truncate text-body text-ink">{topic}</span>
        {/* 글자를 붙여 «눌러도 되는 것»임을 드러낸다 (09-02 · DESIGN.md §5 44px) */}
        <button
          type="button"
          onClick={start}
          className="flex h-11 shrink-0 items-center gap-1 rounded-md px-3 text-body font-semibold
                     text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
        >
          <Pencil size={16} aria-hidden />
          수정
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-label font-semibold text-sub">주제</span>
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
        aria-label="주제 입력"
        className="h-10 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-body text-ink"
      />
      <button
        type="button"
        onClick={save}
        aria-label="주제 확정"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-berry text-white transition-colors duration-200 hover:bg-berry-dark"
      >
        <Check size={16} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="shrink-0 px-1 text-body text-sub transition-colors duration-200 hover:text-ink"
      >
        취소
      </button>
    </div>
  );
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
          {/*
            라벨 옆 줄이라 44px까지 키우면 줄 높이가 흔들린다. 대신 글자를 붙여
            «누를 수 있다»를 드러내고 36px(§6 Small)로 맞췄다 — 12px 아이콘만
            있던 것보다 훨씬 눈에 띈다.
          */}
          {display && (
            <button
              type="button"
              onClick={start}
              className="flex h-9 items-center gap-1 rounded-md px-2 text-caption font-semibold
                         text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
            >
              <Pencil size={13} aria-hidden />
              수정
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
  topicLocked,
  continueHref,
}: {
  summary: PlanSummary;
  onSave: (patch: PlanSummaryPatch) => void;
  topicLocked?: boolean;
  continueHref?: string;
}) {
  return (
    <dl className="flex flex-col gap-4">
      <TopicLine
        topic={summary.topic}
        onSave={(next) => onSave({ topic: next })}
        locked={topicLocked}
        continueHref={continueHref}
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
 * 그라데이션 테두리 — 허용 3곳 중 「AI가 만든 기획 카드 테두리」 (DESIGN.md §2).
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
  /** 주제로 찾아온 추천 사진 (09-01). 못 받았으면 빈 배열 */
  stockOptions: StockPick[];
  stockLoading: boolean;
  /** 고른 추천 사진의 주소. 안 골랐으면 null */
  selectedStockUrl: string | null;
  userPhotos: string[];
  onSelectStock: (photo: StockPick) => void;
  onAddUserPhotos: (files: FileList) => void;
  onRemoveUserPhoto: (url: string) => void;
};

type PanelProps = {
  summary: PlanSummary;
  onSave: (patch: PlanSummaryPatch) => void;
  photos: PlanPhotos;
  showPhotos: boolean; // 기획 확정 후에만 사진 섹션을 연다
  topicLocked?: boolean; // 카드 생성 후 — 주제 읽기 전용 (08-28)
  continueHref?: string; // 잠금 상태에서 연필 대신 보여줄 [이어서 기획하기]
};

/**
 * 오른쪽 기획 박스 (08-31 2열 개편) — 헤더·탭 아래부터 화면 하단까지 높이를 채우고,
 * 내용이 넘치면 박스 안에서만 스크롤한다. 사진 추천은 왼쪽 열로 이동했다.
 */
export default function PlanningSummaryPanel({
  summary,
  onSave,
  topicLocked,
  continueHref,
  started,
}: Omit<PanelProps, "photos" | "showPhotos"> & { started: boolean }) {
  return (
    <aside className="hidden h-full min-h-0 lg:col-span-7 lg:block">
      <div className="h-full rounded-lg p-px" style={{ background: "var(--grad)" }}>
        <div className="h-full overflow-y-auto rounded-[15px] bg-surface p-6 leading-relaxed">
          <h2 className="text-title font-bold text-ink">기획안</h2>
          <div className="mt-4">
            {started ? (
              <SummaryBody
                summary={summary}
                onSave={onSave}
                topicLocked={topicLocked}
                continueHref={continueHref}
              />
            ) : (
              /* 빈 박스를 그대로 두지 않는다 (08-31 §4) */
              <p className="text-body text-sub">
                왼쪽에서 이야기를 고르면 여기에 기획이 만들어져요
              </p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

/** <1280 — 대화 중간에 인라인으로 등장하는 같은 내용의 카드 */
export function PlanningSummaryInline({
  summary,
  onSave,
  photos,
  showPhotos,
  topicLocked,
  continueHref,
}: PanelProps) {
  return (
    <div className="lg:hidden">
      <GradientFrame>
        <h2 className="text-body font-bold text-ink">기획안</h2>
        <div className="mt-3">
          <SummaryBody summary={summary} onSave={onSave} topicLocked={topicLocked} continueHref={continueHref} />
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
