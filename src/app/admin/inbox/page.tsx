"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { adminFetch } from "@/lib/admin/api";
import PageHeader from "@/components/admin/PageHeader";
import FilterBar from "@/components/admin/FilterBar";
import DataTable, { type Column } from "@/components/admin/DataTable";
import StatusTag from "@/components/admin/StatusTag";
import DetailDrawer from "@/components/admin/DetailDrawer";
import ListCount from "@/components/admin/ListCount";
import SectionHeading from "@/components/admin/SectionHeading";
import ConfirmModal from "@/components/admin/ConfirmModal";

/**
 * 처리 대기 (백오피스 기획 §3) — 건별로 처리하는 것만 둔다: 문의 · 탈퇴 처리 실패.
 * 이미지 생성 실패는 건별 조치 대상이 아니라(고객이 스스로 재생성) 대시보드
 * 경보 숫자로만 본다 (09-09 결정) — 개별 확인은 회원 상세의 생성 실패 칼럼.
 */

type Inquiry = {
  id: string;
  userId: string;
  email: string;
  category: string;
  body: string;
  status: string;
  createdAt: string | null;
  answer: { body: string; answeredAt: string } | null;
};
type Attempt = {
  id: string;
  uid: string;
  status: string;
  failedStep: string | null;
  storageFailures: string[];
  error: string | null;
  startedAt: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: "오류",
  account: "계정",
  result: "생성 결과",
  etc: "기타",
};

function fmt(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
  const time = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `${date} ${time}`;
}

const TABS = [
  { key: "inquiries", label: "문의" },
  { key: "deletions", label: "탈퇴 처리 실패" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function AdminInboxPage() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<TabKey>("inquiries");
  const [inquiries, setInquiries] = useState<Inquiry[] | null>(null);
  const [inquiryStatus, setInquiryStatus] = useState("open");
  const [inquiryQuery, setInquiryQuery] = useState("");
  const [inquiryCategory, setInquiryCategory] = useState("all");
  const [inquiryPage, setInquiryPage] = useState(1);
  const PAGE = 10;
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [openInquiry, setOpenInquiry] = useState<Inquiry | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [retryTarget, setRetryTarget] = useState<Attempt | null>(null);

  const load = useCallback(async (u: User, status: string) => {
    try {
      const [iq, del] = await Promise.all([
        adminFetch(u, "GET", `/api/admin/inquiries?status=${status}`),
        adminFetch(u, "GET", "/api/admin/deletions"),
      ]);
      setInquiries(iq.inquiries as Inquiry[]);
      setAttempts(del.attempts as Attempt[]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했어요.");
    }
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (u) void load(u, "open");
      }),
    [load],
  );

  async function saveAnswer() {
    if (!user || !openInquiry || !answerDraft.trim()) return;
    setBusy(true);
    setError("");
    try {
      await adminFetch(user, "POST", `/api/admin/inquiries/${openInquiry.id}/answer`, {
        body: answerDraft.trim(),
      });
      setMessage("답변을 저장했어요. 사용자는 문의 내역에서 확인해요.");
      setOpenInquiry(null);
      setAnswerDraft("");
      await load(user, inquiryStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function retry(reason?: string) {
    if (!user || !retryTarget) return;
    setBusy(true);
    setError("");
    try {
      await adminFetch(user, "POST", `/api/admin/deletions/${retryTarget.id}/retry`, { reason });
      setMessage("파기를 재시도해 완료했어요.");
      setRetryTarget(null);
      await load(user, inquiryStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "재실행에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  const inquiryColumns: Column<Inquiry>[] = [
    { key: "createdAt", title: "접수", width: "13%", nowrap: true, render: (r) => fmt(r.createdAt) },
    {
      key: "category",
      title: "유형",
      width: "8%",
      nowrap: true,
      render: (r) => CATEGORY_LABELS[r.category] ?? r.category,
    },
    {
      key: "email",
      title: "회원",
      width: "18%",
      render: (r) => <span className="line-clamp-1">{r.email}</span>,
    },
    {
      key: "body",
      title: "내용",
      render: (r) => <span className="line-clamp-1">{r.body}</span>,
    },
    {
      key: "status",
      align: "center",
      title: "상태",
      width: "9%",
      render: (r) =>
        r.status === "open" ? (
          <StatusTag kind="pending" label="접수" />
        ) : (
          <StatusTag kind="active" label="답변 완료" />
        ),
    },
  ];

  const attemptColumns: Column<Attempt>[] = [
    { key: "startedAt", title: "시각", width: "13%", nowrap: true, render: (r) => fmt(r.startedAt) },
    {
      key: "uid",
      title: "uid",
      width: "20%",
      render: (r) => <span className="line-clamp-1 text-xs">{r.uid}</span>,
    },
    {
      key: "status",
      align: "center",
      title: "상태",
      width: "10%",
      nowrap: true,
      render: (r) =>
        r.status === "partial" ? (
          <StatusTag kind="pending" label="파일 삭제 실패" />
        ) : (
          <StatusTag kind="suspended" label={r.status === "failed" ? "처리 중단" : "미완료"} />
        ),
    },
    {
      key: "detail",
      title: "내용",
      render: (r) =>
        r.status === "partial"
          ? `파일 ${r.storageFailures.length}개 경로 삭제 실패`
          : `${r.failedStep ?? "?"} 단계 — ${r.error ?? "원인 미기록"}`,
    },
    {
      key: "action",
      title: "",
      width: "110px",
      render: (r) => (
        <button
          type="button"
          onClick={() => setRetryTarget(r)}
          className="text-[#1677FF] hover:underline"
        >
          파기 재시도
        </button>
      ),
    },
  ];

  const q = inquiryQuery.trim().toLowerCase();
  const filteredInquiries = (inquiries ?? []).filter(
    (i) =>
      (inquiryCategory === "all" || i.category === inquiryCategory) &&
      (!q || i.body.toLowerCase().includes(q) || i.email.toLowerCase().includes(q)),
  );
  const inquiryPages = Math.max(1, Math.ceil(filteredInquiries.length / PAGE));

  const counts: Record<TabKey, number | null> = {
    inquiries: inquiries ? inquiries.filter((i) => i.status === "open").length : null,
    deletions: attempts?.length ?? null,
  };

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "관리자", href: "/admin" }, { label: "처리 대기" }]}
        title="처리 대기"
      />

      {message && <p className="mb-4 text-sm text-green-700">{message}</p>}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="mb-4 flex gap-1 border-b border-[#E5E7EB]">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2 text-base ${
              tab === t.key
                ? "border-[#1677FF] font-medium text-[#1677FF]"
                : "border-transparent text-[#6B7280] hover:text-[#1F2937]"
            }`}
          >
            {t.label}
            {counts[t.key] !== null && counts[t.key]! > 0 && (
              <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-xs text-white">
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "inquiries" && (
        <>
          <SectionHeading title="검색·필터" />
          <FilterBar>
            <input
              type="search"
              value={inquiryQuery}
              onChange={(e) => {
                setInquiryQuery(e.target.value);
                setInquiryPage(1);
              }}
              placeholder="내용·이메일 검색"
              className="w-56 rounded-md border border-[#E5E7EB] px-3 py-1.5 text-sm"
            />
            <select
              value={inquiryCategory}
              onChange={(e) => {
                setInquiryCategory(e.target.value);
                setInquiryPage(1);
              }}
              className="rounded-md border border-[#E5E7EB] px-2 py-1.5 text-sm"
            >
              <option value="all">전체 유형</option>
              <option value="bug">오류</option>
              <option value="account">계정</option>
              <option value="result">생성 결과</option>
              <option value="etc">기타</option>
            </select>
            <select
              value={inquiryStatus}
              onChange={(e) => {
                setInquiryStatus(e.target.value);
                setInquiryPage(1);
                if (user) void load(user, e.target.value);
              }}
              className="rounded-md border border-[#E5E7EB] px-2 py-1.5 text-sm"
            >
              <option value="open">접수 (미답변)</option>
              <option value="answered">답변 완료</option>
              <option value="all">전체</option>
            </select>
          </FilterBar>
          <SectionHeading
            title="목록"
            aside={
              <div className="pr-3">
                <ListCount
                  shown={filteredInquiries.length}
                  total={inquiries?.length ?? 0}
                  filtered={Boolean(q) || inquiryCategory !== "all"}
                  className="text-[13px]"
                />
              </div>
            }
          />
          <DataTable
            columns={inquiryColumns}
            rows={filteredInquiries.slice((inquiryPage - 1) * PAGE, inquiryPage * PAGE)}
            rowKey={(r) => r.id}
            loading={inquiries === null}
            emptyTitle="조건에 맞는 문의가 없어요"
            onRowClick={(r) => {
              setOpenInquiry(r);
              setAnswerDraft(r.answer?.body ?? "");
            }}
            page={inquiryPage}
            totalPages={inquiryPages}
            onPageChange={setInquiryPage}
          />
        </>
      )}

      {tab === "deletions" && (
        <>
          <SectionHeading
            title="목록"
            aside={
              <div className="pr-3">
                <ListCount
                  shown={attempts?.length ?? 0}
                  total={attempts?.length ?? 0}
                  filtered={false}
                  className="text-[13px]"
                />
              </div>
            }
          />
          <DataTable
            columns={attemptColumns}
            rows={attempts ?? []}
            rowKey={(r) => r.id}
            loading={attempts === null}
            emptyTitle="탈퇴 처리 실패 건이 없어요"
            emptyDescription="탈퇴 시 데이터 삭제가 완료되지 않은 건 — 개인정보 파기 의무 확인 대상이에요"
          />
        </>
      )}

      <DetailDrawer
        open={openInquiry !== null}
        title={`문의 — ${openInquiry ? (CATEGORY_LABELS[openInquiry.category] ?? "기타") : ""}`}
        onClose={() => setOpenInquiry(null)}
      >
        {openInquiry && (
          <div className="flex flex-col gap-4">
            <div className="text-xs text-[#6B7280]">
              {openInquiry.email} · {fmt(openInquiry.createdAt)} ·{" "}
              <Link
                href={`/admin/members/${openInquiry.userId}`}
                className="text-[#1677FF] hover:underline"
              >
                회원 상세 보기
              </Link>
            </div>
            <div className="whitespace-pre-wrap rounded-md bg-[#F5F5F5] p-3">
              {openInquiry.body}
            </div>
            <label className="flex flex-col gap-1">
              답변 {openInquiry.answer && <span className="text-xs text-[#6B7280]">(저장하면 덮어써요)</span>}
              <textarea
                value={answerDraft}
                onChange={(e) => setAnswerDraft(e.target.value)}
                rows={6}
                maxLength={2000}
                className="rounded-md border border-[#E5E7EB] p-3"
              />
            </label>
            <button
              type="button"
              disabled={busy || !answerDraft.trim()}
              onClick={() => void saveAnswer()}
              className="self-end rounded-md bg-[#1677FF] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#4096FF] disabled:opacity-50"
            >
              답변 저장
            </button>
          </div>
        )}
      </DetailDrawer>

      <ConfirmModal
        key={retryTarget?.id ?? "closed"}
        open={retryTarget !== null}
        title="파기를 재시도할까요?"
        description="이미 지워진 것은 건너뛰고 남은 데이터만 다시 지워요."
        confirmLabel="재시도"
        danger
        reasonRequired
        busy={busy}
        onCancel={() => setRetryTarget(null)}
        onConfirm={(reason) => void retry(reason)}
      />
    </div>
  );
}
