"use client";

import { useState } from "react";
import EmptyState from "./EmptyState";

/**
 * 기본 데이터 표 (admin-design.md Table) — 백오피스 목록의 기본 컴포넌트.
 * sticky header · row hover · 우측 action 열 · 우하단 pagination.
 * 페이지네이션은 서버 페이징 전제 — page/total을 넘기면 그려진다.
 */
export type Column<T> = {
  key: string;
  title: string;
  width?: string;
  /**
   * 정렬 규칙 (09-09 확정): 글·날짜·이메일 = 왼쪽(기본).
   * 짧은 단위 값(주 N회·N장·N건·순번)·지표 숫자·상태 태그 = "center".
   */
  align?: "center";
  /** true면 헤더 클릭으로 정렬 — 부모가 sortKey/sortDir/onSortChange로 실제 정렬을 잰다 */
  sortable?: boolean;
  /** 날짜·숫자·상태처럼 중간에서 꺾이면 안 되는 칼럼에 지정 */
  nowrap?: boolean;
  render: (row: T) => React.ReactNode;
};

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle = "데이터가 없어요",
  emptyDescription,
  onRowClick,
  page,
  totalPages,
  onPageChange,
  sortKey,
  sortDir,
  onSortChange,
  onReorder,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSortChange?: (key: string) => void;
  /** 행 드래그 정렬 — 넘기면 왼쪽에 ⠿ 손잡이 열이 생기고, 놓은 위치를 알려준다 */
  onReorder?: (fromKey: string, toKey: string) => void;
}) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  return (
    <div className="rounded-md border border-[#E5E7EB] bg-white">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-sm text-[#1F2937]">
          <thead className="sticky top-0 z-10 bg-[#FAFAFA]">
            <tr>
              {onReorder && <th className="w-9 border-b border-[#E5E7EB]" aria-label="순서 이동" />}
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className={`whitespace-nowrap border-b border-[#E5E7EB] px-4 py-2.5 text-xs font-semibold text-[#6B7280] ${
                    c.align === "center" ? "text-center" : "text-left"
                  }`}
                >
                  {c.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(c.key)}
                      className="inline-flex items-center gap-1 hover:text-[#1F2937]"
                    >
                      {c.title}
                      <span className={sortKey === c.key ? "text-[#1677FF]" : "text-[#D1D5DB]"}>
                        {sortKey === c.key && sortDir === "asc" ? "▲" : "▼"}
                      </span>
                    </button>
                  ) : (
                    c.title
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-[#6B7280]">
                  불러오는 중…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  draggable={Boolean(onReorder)}
                  onDragStart={onReorder ? () => setDragKey(rowKey(row)) : undefined}
                  onDragOver={onReorder ? (e) => e.preventDefault() : undefined}
                  onDrop={
                    onReorder
                      ? () => {
                          if (dragKey && dragKey !== rowKey(row)) onReorder(dragKey, rowKey(row));
                          setDragKey(null);
                        }
                      : undefined
                  }
                  className={`border-b border-[#E5E7EB] last:border-b-0 hover:bg-[#FAFAFA] ${
                    onRowClick ? "cursor-pointer" : ""
                  } ${dragKey === rowKey(row) ? "opacity-40" : ""}`}
                >
                  {onReorder && (
                    <td className="cursor-grab px-2 py-2.5 text-center text-[#9CA3AF]" title="끌어서 순서 바꾸기">
                      ⠿
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-2.5 ${c.align === "center" ? "text-center" : "text-left"}${
                        c.nowrap ? " whitespace-nowrap" : ""
                      }`}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {page !== undefined && totalPages !== undefined && totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-[#E5E7EB] px-4 py-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange?.(page - 1)}
            className="rounded-md border border-[#E5E7EB] px-2 py-1 disabled:opacity-40"
          >
            이전
          </button>
          <span className="text-xs text-[#6B7280]">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange?.(page + 1)}
            className="rounded-md border border-[#E5E7EB] px-2 py-1 disabled:opacity-40"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
