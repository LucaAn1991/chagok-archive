"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { adminFetch, downloadCsv } from "@/lib/admin/api";
import PageHeader from "@/components/admin/PageHeader";
import FilterBar from "@/components/admin/FilterBar";
import DataTable, { type Column } from "@/components/admin/DataTable";
import StatusTag from "@/components/admin/StatusTag";
import ConfirmModal from "@/components/admin/ConfirmModal";
import ListCount from "@/components/admin/ListCount";
import SectionHeading from "@/components/admin/SectionHeading";

/**
 * 회원 목록 (백오피스 기획 §2-②) — 이메일은 마스킹, 전체는 상세에서.
 * 행 클릭 → 회원 상세.
 */

type MemberRow = {
  uid: string;
  email: string;
  nickname: string;
  createdAt: string | null;
  lastSignInTime: string | null;
  onboarded: boolean;
  disabled: boolean;
  uploadFrequency: number | null;
  uploadDays: number[];
};

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

/** ab***@g***.com — 목록에서는 개인정보를 다 보여주지 않는다 (기획 §2-② 마스킹) */
function maskEmail(email: string): string {
  const [id, domain] = email.split("@");
  if (!domain) return email;
  return `${id.slice(0, 2)}***@${domain.slice(0, 1)}***.${domain.split(".").pop()}`;
}

function fmtDate(iso: string | null): string {
  // ko-KR 공식 표기("2026. 9. 9.")는 표에서 지저분하다 — 어드민은 YYYY-MM-DD로 통일
  return iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso)) : "–";
}

const COLUMNS: Column<MemberRow>[] = [
  {
    key: "email",
    title: "이메일",
    width: "220px",
    render: (r) => {
      const masked = maskEmail(r.email);
      // 아주 긴 이메일은 말줄임(…) — 마우스를 올리면 전체가 뜨고, 원문은 상세에서
      return (
        <span className="block max-w-[200px] truncate" title={masked}>
          {masked}
        </span>
      );
    },
  },
  { key: "nickname", title: "닉네임", width: "110px", render: (r) => r.nickname || "–" },
  {
    key: "createdAt",
    title: "가입일",
    width: "120px",
    sortable: true,
    nowrap: true,
    render: (r) => fmtDate(r.createdAt),
  },
  {
    key: "lastSignIn",
    title: "최근 로그인",
    width: "120px",
    sortable: true,
    nowrap: true,
    render: (r) => fmtDate(r.lastSignInTime),
  },
  {
    key: "goal",
    align: "center",
    title: "주간 목표",
    width: "90px",
    nowrap: true,
    render: (r) => (r.uploadFrequency ? `주 ${r.uploadFrequency}회` : "–"),
  },
  {
    key: "days",
    title: "업로드 요일",
    width: "130px",
    nowrap: true,
    render: (r) =>
      r.uploadDays.length ? r.uploadDays.map((d) => DAY_LABELS[d]).join(" · ") : "–",
  },
  {
    key: "status",
    align: "center",
    title: "상태",
    width: "110px",
    render: (r) =>
      r.disabled ? (
        <StatusTag kind="suspended" label="정지" />
      ) : r.onboarded ? (
        <StatusTag kind="active" label="활성" />
      ) : (
        <StatusTag kind="pending" label="온보딩 전" />
      ),
  },
];

export default function AdminMembersPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"createdAt" | "lastSignIn">("createdAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (u: User, q: string, s: string, p: number, so: string, di: string) => {
    try {
      const params = new URLSearchParams({ query: q, status: s, page: String(p), sort: so, dir: di });
      const data = await adminFetch(u, "GET", `/api/admin/members?${params}`);
      setRows(data.members as MemberRow[]);
      setTotalPages(data.totalPages as number);
      setTotal(data.total as number);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (u) void load(u, "", "all", 1, "createdAt", "desc");
      }),
    [load],
  );

  function search(nextStatus = status, nextPage = 1, nextSort = sort, nextDir = dir) {
    if (!user) return;
    setLoading(true);
    setPage(nextPage);
    void load(user, query, nextStatus, nextPage, nextSort, nextDir);
  }

  function toggleSort(key: string) {
    const nextSort = key === "lastSignIn" ? "lastSignIn" : "createdAt";
    const nextDir = nextSort === sort && dir === "desc" ? "asc" : "desc";
    setSort(nextSort);
    setDir(nextDir);
    search(status, 1, nextSort, nextDir);
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "관리자", href: "/admin" }, { label: "회원" }]}
        title={`회원${total ? ` (${total})` : ""}`}
      />

      <ConfirmModal
        key={exporting ? "export" : "closed"}
        open={exporting}
        title="회원 목록을 내려받을까요?"
        description="개인정보(이메일 포함) 반출이라 사유와 함께 기록이 남아요. 전체 회원이 내려받아져요."
        confirmLabel="다운로드"
        reasonRequired
        busy={busy}
        onCancel={() => setExporting(false)}
        onConfirm={(reason) => {
          if (!user || !reason) return;
          setBusy(true);
          const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
          downloadCsv(user, `/api/admin/members/export?reason=${encodeURIComponent(reason)}`, `차곡-회원-${today}.csv`)
            .then(() => setExporting(false))
            .catch((e) => setError(e instanceof Error ? e.message : "다운로드에 실패했어요."))
            .finally(() => setBusy(false));
        }}
      />

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <SectionHeading title="검색·필터" />
      <FilterBar>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="이메일·닉네임·uid"
          className="w-64 rounded-md border border-[#E5E7EB] px-3 py-1.5 text-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            search(e.target.value);
          }}
          className="rounded-md border border-[#E5E7EB] px-2 py-1.5 text-sm"
        >
          <option value="all">전체 상태</option>
          <option value="active">활성</option>
          <option value="suspended">정지</option>
          <option value="noonboard">온보딩 전</option>
        </select>
        <button
          type="button"
          onClick={() => search()}
          className="rounded-md bg-[#1677FF] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4096FF]"
        >
          검색
        </button>
      </FilterBar>

      <SectionHeading
        title="목록"
        aside={
          // pr-3 — 개수가 표 오른쪽 끝에 딱 붙지 않게, 버튼-개수 간격(12px)만큼 들여쓴다
          <div className="flex items-center gap-3 pr-3">
            <button
              type="button"
              onClick={() => setExporting(true)}
              className="rounded border border-[#D9D9D9] bg-white px-2 py-0.5 text-[13px] text-[#1F2937] hover:border-[#1677FF] hover:text-[#1677FF]"
            >
              CSV 다운로드
            </button>
            {/* 서버가 이미 거른 개수라 shown=total — 필터 중임을 표시만 구분 */}
            <ListCount
              shown={total}
              total={total}
              filtered={Boolean(query.trim()) || status !== "all"}
              className="text-[13px]"
            />
          </div>
        }
      />
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.uid}
        loading={loading}
        emptyTitle="조건에 맞는 회원이 없어요"
        onRowClick={(r) => router.push(`/admin/members/${r.uid}`)}
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => search(status, p)}
        sortKey={sort}
        sortDir={dir}
        onSortChange={toggleSort}
      />
    </div>
  );
}
