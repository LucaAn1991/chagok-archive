"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { adminFetch, downloadCsv } from "@/lib/admin/api";
import PageHeader from "@/components/admin/PageHeader";
import FilterBar from "@/components/admin/FilterBar";
import DataTable, { type Column } from "@/components/admin/DataTable";
import DetailDrawer from "@/components/admin/DetailDrawer";
import ListCount from "@/components/admin/ListCount";
import SectionHeading from "@/components/admin/SectionHeading";

/**
 * 보안 (백오피스 기획 §2-⑥ — 구 «시스템») — 감사 로그 탐색 + 관리자 목록(읽기 전용).
 * 로그 행을 누르면 서랍에서 변경 전/후 값을 본다.
 */

type LogRow = {
  id: string;
  at: string | null;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};
type AdminRow = { uid: string; email: string; lastSignInTime: string | null };

/** 행위 유형 필터 — action 접두사로 거른다 */
const ACTION_GROUPS = [
  { value: "", label: "전체 행위" },
  { value: "admin.", label: "접속·권한" },
  { value: "user.", label: "회원 조치" },
  { value: "inquiry.", label: "문의" },
  { value: "flags.", label: "기능 제어" },
  { value: "config.", label: "설정" },
  { value: "notice.", label: "공지" },
  { value: "faq.", label: "FAQ" },
  { value: "template.", label: "템플릿" },
];

function fmt(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
  const time = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `${date} ${time}`;
}

const PAGE_SIZE = 25;

export default function AdminSystemPage() {
  const [user, setUser] = useState<User | null>(null);
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [actors, setActors] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [days, setDays] = useState("7");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<LogRow | null>(null);

  const load = useCallback(async (u: User, d: string, a: string, who: string) => {
    try {
      const params = new URLSearchParams({ days: d, action: a, actor: who });
      const [logsRes, adminsRes] = await Promise.all([
        adminFetch(u, "GET", `/api/admin/logs?${params}`),
        adminFetch(u, "GET", "/api/admin/admins"),
      ]);
      setLogs(logsRes.logs as LogRow[]);
      setActors(logsRes.actors as string[]);
      setTruncated(Boolean(logsRes.truncated));
      setAdmins(adminsRes.admins as AdminRow[]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했어요.");
    }
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (u) void load(u, "7", "", "");
      }),
    [load],
  );

  function refilter(d = days, a = action, who = actor) {
    if (!user) return;
    setPage(1);
    setLogs(null);
    void load(user, d, a, who);
  }

  const logColumns: Column<LogRow>[] = [
    { key: "at", title: "시각", width: "14%", nowrap: true, render: (l) => fmt(l.at) },
    {
      key: "actor",
      title: "관리자",
      width: "16%",
      render: (l) => <span className="line-clamp-1">{l.actorEmail}</span>,
    },
    { key: "action", title: "행위", width: "13%", nowrap: true, render: (l) => l.action },
    {
      key: "target",
      title: "대상",
      width: "15%",
      render: (l) => (
        <span className="text-xs text-[#6B7280]">
          {l.targetType} · {l.targetId.slice(0, 16)}
        </span>
      ),
    },
    { key: "reason", title: "사유", render: (l) => l.reason ?? "–" },
  ];

  const adminColumns: Column<AdminRow>[] = [
    { key: "email", title: "이메일", render: (a) => a.email },
    { key: "last", title: "최근 로그인", width: "180px", nowrap: true, render: (a) => fmt(a.lastSignInTime) },
  ];

  const kw = keyword.trim().toLowerCase();
  const filteredLogs = (logs ?? []).filter(
    (l) =>
      !kw ||
      (l.reason ?? "").toLowerCase().includes(kw) ||
      l.targetId.toLowerCase().includes(kw) ||
      l.action.toLowerCase().includes(kw),
  );
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const pageRows = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "관리자", href: "/admin" }, { label: "보안" }]}
        title="보안"
      />

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold">감사 로그</h2>
        <SectionHeading title="검색·필터" />
        <FilterBar>
          <select
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              refilter(e.target.value);
            }}
            className="rounded-md border border-[#E5E7EB] px-2 py-1.5 text-sm"
          >
            <option value="7">최근 7일</option>
            <option value="30">최근 30일</option>
            <option value="365">최근 1년</option>
          </select>
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              refilter(days, e.target.value);
            }}
            className="rounded-md border border-[#E5E7EB] px-2 py-1.5 text-sm"
          >
            {ACTION_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
          <select
            value={actor}
            onChange={(e) => {
              setActor(e.target.value);
              refilter(days, action, e.target.value);
            }}
            className="rounded-md border border-[#E5E7EB] px-2 py-1.5 text-sm"
          >
            <option value="">모든 관리자</option>
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            placeholder="사유·대상·행위 검색"
            className="w-52 rounded-md border border-[#E5E7EB] px-3 py-1.5 text-sm"
          />
          {truncated && (
            <span className="text-xs text-[#6B7280]">최근 500건까지만 표시 중 — 기간을 좁혀주세요</span>
          )}
        </FilterBar>
        <SectionHeading
          title="목록"
          aside={
            <div className="flex items-center gap-3 pr-3">
              <button
                type="button"
                onClick={() => {
                  if (!user) return;
                  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
                  void downloadCsv(user, `/api/admin/logs/export?days=${days}`, `차곡-감사로그-${today}.csv`).catch(
                    (e) => setError(e instanceof Error ? e.message : "다운로드에 실패했어요."),
                  );
                }}
                className="rounded border border-[#D9D9D9] bg-white px-2 py-0.5 text-[13px] text-[#1F2937] hover:border-[#1677FF] hover:text-[#1677FF]"
              >
                CSV 다운로드
              </button>
              <ListCount shown={filteredLogs.length} total={logs?.length ?? 0} filtered={Boolean(kw)} className="text-[13px]" />
            </div>
          }
        />
        <DataTable
          columns={logColumns}
          rows={pageRows}
          rowKey={(l) => l.id}
          loading={logs === null}
          emptyTitle="이 조건의 기록이 없어요"
          onRowClick={(l) => setDetail(l)}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">관리자 목록</h2>
        <DataTable
          columns={adminColumns}
          rows={admins ?? []}
          rowKey={(a) => a.uid}
          loading={admins === null}
          emptyTitle="관리자가 없어요"
        />
      </section>

      <DetailDrawer
        open={detail !== null}
        title={`기록 — ${detail?.action ?? ""}`}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              <span className="text-[#6B7280]">시각</span> {fmt(detail.at)}
            </p>
            <p>
              <span className="text-[#6B7280]">관리자</span> {detail.actorEmail}
            </p>
            <p>
              <span className="text-[#6B7280]">대상</span> {detail.targetType} · {detail.targetId}
            </p>
            {detail.reason && (
              <p>
                <span className="text-[#6B7280]">사유</span> {detail.reason}
              </p>
            )}
            {(detail.before || detail.after) && (
              <div className="flex flex-col gap-2">
                {detail.before && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-[#6B7280]">변경 전</p>
                    <pre className="overflow-x-auto rounded-md bg-[#F5F5F5] p-3 text-xs">
                      {JSON.stringify(detail.before, null, 2)}
                    </pre>
                  </div>
                )}
                {detail.after && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-[#6B7280]">변경 후</p>
                    <pre className="overflow-x-auto rounded-md bg-[#F5F5F5] p-3 text-xs">
                      {JSON.stringify(detail.after, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
