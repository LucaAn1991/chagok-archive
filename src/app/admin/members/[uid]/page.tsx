"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { adminFetch } from "@/lib/admin/api";
import PageHeader from "@/components/admin/PageHeader";
import DataTable, { type Column } from "@/components/admin/DataTable";
import StatusTag from "@/components/admin/StatusTag";
import ConfirmModal from "@/components/admin/ConfirmModal";
import DetailDrawer from "@/components/admin/DetailDrawer";

/**
 * 회원 상세 (백오피스 기획 §2-②) — CS의 작업대.
 * 머리: 이 사람의 차곡 상태(목표 대비 발행·잔고). 몸: 카드·기획·동의·관리 기록.
 * 대화 내용은 기본 접힘 — «열람» 버튼이 사유를 받고 감사 로그를 남긴다.
 */

type Detail = {
  account: {
    uid: string;
    email: string;
    nickname: string;
    field: string;
    createdAt: string | null;
    lastSignInTime: string | null;
    onboardedAt: string | null;
    disabled: boolean;
    uploadFrequency: number | null;
    uploadDays: number[];
  };
  weekly: { goal: number; published: number; balance7d: number };
  plans: {
    id: string;
    topic: string;
    status: string;
    cardCount: number;
    confirmedAt: string | null;
  }[];
  cards: {
    id: string;
    title: string;
    status: string;
    scheduledDate: string | null;
    publishedAt: string | null;
    fallbackCount: number;
  }[];
  counts: { plans: number; cards: number; published: number; discarded: number };
  consents: {
    termsVersion: string;
    privacyVersion: string;
    usageDataConsent: boolean;
    agreedAt: string;
  }[];
  adminLogs: { action: string; actorEmail: string; reason: string | null; at: string | null }[];
};

type Pending =
  | { kind: "suspend"; next: boolean }
  | { kind: "delete" }
  | { kind: "viewMessages"; planId: string; topic: string }
  | null;

const CARD_STATUS: Record<
  string,
  { kind: "active" | "pending" | "processing" | "suspended" | "deleted"; label: string }
> = {
  published: { kind: "active", label: "발행" },
  pending: { kind: "processing", label: "업로드 대기" }, // 제작은 끝남 — 파랑으로 구분
  planned: { kind: "pending", label: "제작 대기" },
  discarded: { kind: "deleted", label: "버림" },
};

function fmt(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(d);
  const time = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `${date} ${time}`;
}

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export default function AdminMemberDetailPage() {
  const { uid } = useParams<{ uid: string }>();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [drawer, setDrawer] = useState<{
    topic: string;
    messages: { role: string; content: string }[];
  } | null>(null);
  const [cardStatus, setCardStatus] = useState("all");
  const [cardPage, setCardPage] = useState(1);
  const [planPage, setPlanPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const PAGE = 10;

  const load = useCallback(
    async (u: User) => {
      try {
        setDetail((await adminFetch(u, "GET", `/api/admin/members/${uid}`)) as unknown as Detail);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "불러오지 못했어요.");
      }
    },
    [uid],
  );

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (u) void load(u);
      }),
    [load],
  );

  async function confirm(reason?: string) {
    if (!user || !pending) return;
    setBusy(true);
    setError("");
    try {
      if (pending.kind === "suspend") {
        await adminFetch(user, "POST", `/api/admin/members/${uid}/suspend`, {
          suspend: pending.next,
          reason,
        });
        setMessage(pending.next ? "계정을 정지했어요." : "정지를 해제했어요.");
        await load(user);
      } else if (pending.kind === "delete") {
        await adminFetch(user, "POST", `/api/admin/members/${uid}/delete`, { reason });
        setMessage("파기를 완료했어요.");
        router.push("/admin/members");
        return;
      } else if (pending.kind === "viewMessages") {
        const data = await adminFetch(
          user,
          "POST",
          `/api/admin/members/${uid}/plans/${pending.planId}/messages`,
          { reason },
        );
        setDrawer({
          topic: (data.topic as string) || pending.topic,
          messages: data.messages as { role: string; content: string }[],
        });
      }
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  const cardColumns: Column<Detail["cards"][number]>[] = [
    {
      key: "title",
      title: "카드",
      render: (c) => <span className="line-clamp-1">{c.title}</span>,
    },
    {
      key: "status",
      align: "center",
      title: "상태",
      width: "13%",
      nowrap: true,
      render: (c) => {
        const s = CARD_STATUS[c.status] ?? CARD_STATUS.planned;
        return <StatusTag kind={s.kind} label={s.label} />;
      },
    },
    {
      key: "date",
      title: "예정일",
      width: "13%",
      nowrap: true,
      render: (c) => c.scheduledDate ?? "–",
    },
    {
      key: "fallback",
      align: "center",
      title: "생성 실패",
      width: "11%",
      nowrap: true,
      render: (c) =>
        c.fallbackCount > 0 ? (
          <span className="text-red-600">{c.fallbackCount}장</span>
        ) : (
          "–"
        ),
    },
  ];

  const planColumns: Column<Detail["plans"][number]>[] = [
    { key: "topic", title: "기획", render: (p) => p.topic || "(주제 없음)" },
    {
      key: "status",
      align: "center",
      title: "상태",
      width: "11%",
      render: (p) =>
        p.status === "confirmed" ? (
          <StatusTag kind="active" label="확정" />
        ) : (
          <StatusTag kind="pending" label="대화 중" />
        ),
    },
    {
      key: "cards",
      align: "center",
      title: "카드",
      width: "9%",
      nowrap: true,
      render: (p) => `${p.cardCount}장`,
    },
    {
      key: "view",
      title: "",
      width: "11%",
      render: (p) => (
        <button
          type="button"
          onClick={() => setPending({ kind: "viewMessages", planId: p.id, topic: p.topic })}
          className="text-[#1677FF] hover:underline"
        >
          대화 열람
        </button>
      ),
    },
  ];

  const logColumns: Column<Detail["adminLogs"][number]>[] = [
    { key: "at", title: "시각", width: "15%", nowrap: true, render: (l) => fmt(l.at) },
    { key: "action", title: "행위", width: "15%", nowrap: true, render: (l) => l.action },
    {
      key: "actor",
      title: "관리자",
      width: "18%",
      render: (l) => <span className="line-clamp-1">{l.actorEmail}</span>,
    },
    { key: "reason", title: "사유", render: (l) => l.reason ?? "–" },
  ];

  if (!detail) {
    return (
      <div>
        <PageHeader
          breadcrumb={[
            { label: "관리자", href: "/admin" },
            { label: "회원", href: "/admin/members" },
            { label: "상세" },
          ]}
          title="회원 상세"
        />
        <p className="text-sm text-[#6B7280]">{error || "불러오는 중…"}</p>
      </div>
    );
  }

  const { account, weekly, counts } = detail;
  const goalMet = weekly.goal > 0 && weekly.published >= weekly.goal;

  const filteredCards = detail.cards.filter((c) => cardStatus === "all" || c.status === cardStatus);
  const cardPages = Math.max(1, Math.ceil(filteredCards.length / PAGE));
  const planPages = Math.max(1, Math.ceil(detail.plans.length / PAGE));
  const logPages = Math.max(1, Math.ceil(detail.adminLogs.length / PAGE));

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: "관리자", href: "/admin" },
          { label: "회원", href: "/admin/members" },
          { label: account.email },
        ]}
        title={account.nickname || account.email}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setPending({ kind: "suspend", next: !account.disabled })}
              className="rounded-md border border-[#D9D9D9] bg-white px-3 py-1.5 text-sm hover:border-[#1677FF] hover:text-[#1677FF] disabled:opacity-50"
            >
              {account.disabled ? "정지 해제" : "정지"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPending({ kind: "delete" })}
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-600 hover:border-red-500 disabled:opacity-50"
            >
              탈퇴 처리
            </button>
          </div>
        }
      />

      {message && <p className="mb-4 text-sm text-green-700">{message}</p>}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {/* 차곡 상태 한 줄 — CS 판단의 출발점 */}
      <section className="mb-6 grid grid-cols-4 gap-3">
        {[
          {
            label: "이번 주 발행 / 목표",
            value: weekly.goal ? `${weekly.published} / ${weekly.goal}` : `${weekly.published} / –`,
            tone: goalMet ? "text-green-700" : "text-[#1F2937]",
          },
          {
            label: "발행 예정 카드 (7일)",
            value: `${weekly.balance7d}장`,
            tone: weekly.balance7d > 0 ? "text-[#1F2937]" : "text-red-600",
          },
          { label: "기획 / 카드", value: `${counts.plans} / ${counts.cards}`, tone: "text-[#1F2937]" },
          { label: "누적 발행", value: `${counts.published}장`, tone: "text-[#1F2937]" },
        ].map((s) => (
          <div key={s.label} className="rounded-md border border-[#E5E7EB] bg-white p-4">
            <p className="text-xs text-[#6B7280]">{s.label}</p>
            <p className={`mt-1 text-xl font-semibold ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </section>

      {/* 계정 — 기술서(Descriptions) 표: 라벨·값이 붙어 좌정렬, 시선이 왕복하지 않는다 */}
      <section className="mb-6 overflow-hidden rounded-md border border-[#E5E7EB] bg-white text-sm">
        <h2 className="border-b border-[#E5E7EB] px-5 py-3 text-base font-semibold">계정</h2>
        {(() => {
          // uid는 뺐다 — 상세 URL이 곧 uid라 표에 중복 (09-09)
          const pairs: [string, string][][] = [
            [
              ["이메일", account.email],
              ["상태", account.disabled ? "정지" : "활성"],
            ],
            [
              ["가입", fmt(account.createdAt)],
              ["최근 로그인", fmt(account.lastSignInTime)],
            ],
            [
              ["온보딩 완료", fmt(account.onboardedAt)],
              [
                "업로드 주기",
                account.uploadFrequency
                  ? `주 ${account.uploadFrequency}회${
                      account.uploadDays.length
                        ? ` (${account.uploadDays.map((d) => DAY_LABELS[d]).join("·")})`
                        : ""
                    }`
                  : "–",
              ],
            ],
          ];
          return (
            <dl>
              {pairs.map((row) => (
                <div
                  key={row[0][0]}
                  className="grid grid-cols-[110px_1fr_110px_1fr] border-b border-[#F0F0F0]"
                >
                  {row.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="border-r border-[#F0F0F0] bg-[#FAFAFA] px-4 py-2 text-[#6B7280]">
                        {k}
                      </dt>
                      <dd className="truncate px-4 py-2" title={v}>
                        {v}
                      </dd>
                    </div>
                  ))}
                </div>
              ))}
              {/* 활동 분야 — 문장이 길 수 있어 전체 폭 + 줄바꿈 허용 (잘라 보이지 않는다) */}
              <div className="grid grid-cols-[110px_1fr]">
                <dt className="border-r border-[#F0F0F0] bg-[#FAFAFA] px-4 py-2 text-[#6B7280]">
                  활동 분야
                </dt>
                <dd className="whitespace-pre-wrap break-words px-4 py-2">
                  {account.field || "–"}
                </dd>
              </div>
            </dl>
          );
        })()}
      </section>

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">카드 ({filteredCards.length})</h2>
          <select
            value={cardStatus}
            onChange={(e) => {
              setCardStatus(e.target.value);
              setCardPage(1);
            }}
            className="rounded-md border border-[#E5E7EB] px-2 py-1 text-sm"
          >
            <option value="all">전체 상태</option>
            <option value="planned">제작 대기</option>
            <option value="pending">업로드 대기</option>
            <option value="published">발행</option>
            <option value="discarded">버림</option>
          </select>
        </div>
        <DataTable
          columns={cardColumns}
          rows={filteredCards.slice((cardPage - 1) * PAGE, cardPage * PAGE)}
          rowKey={(c) => c.id}
          emptyTitle="조건에 맞는 카드가 없어요"
          page={cardPage}
          totalPages={cardPages}
          onPageChange={setCardPage}
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-base font-semibold">기획 ({detail.plans.length})</h2>
        <DataTable
          columns={planColumns}
          rows={detail.plans.slice((planPage - 1) * PAGE, planPage * PAGE)}
          rowKey={(p) => p.id}
          emptyTitle="기획이 없어요"
          page={planPage}
          totalPages={planPages}
          onPageChange={setPlanPage}
        />
      </section>

      <section className="mb-6 rounded-md border border-[#E5E7EB] bg-white p-5 text-sm">
        <h2 className="mb-3 text-base font-semibold">동의 이력</h2>
        {detail.consents.length === 0 ? (
          <p className="text-[#6B7280]">동의 기록이 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {detail.consents.map((c) => (
              <li key={c.agreedAt} className="flex justify-between border-b border-[#F5F5F5] py-1">
                <span>
                  약관 v{c.termsVersion} · 방침 v{c.privacyVersion} · 데이터 활용{" "}
                  {c.usageDataConsent ? "동의" : "미동의"}
                </span>
                <span className="text-[#6B7280]">{fmt(c.agreedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-base font-semibold">관리 기록 ({detail.adminLogs.length})</h2>
        <DataTable
          columns={logColumns}
          rows={detail.adminLogs.slice((logPage - 1) * PAGE, logPage * PAGE)}
          rowKey={(l) => `${l.at}-${l.action}`}
          emptyTitle="이 회원에 대한 관리 기록이 없어요"
          page={logPage}
          totalPages={logPages}
          onPageChange={setLogPage}
        />
      </section>

      <ConfirmModal
        key={pending ? JSON.stringify(pending) : "closed"}
        open={pending !== null}
        title={
          pending?.kind === "suspend"
            ? pending.next
              ? "이 계정을 정지할까요?"
              : "정지를 해제할까요?"
            : pending?.kind === "delete"
              ? "이 회원의 모든 데이터를 파기할까요?"
              : "기획 대화를 열람할까요?"
        }
        description={
          pending?.kind === "suspend" && pending.next
            ? "즉시 로그인이 차단되고 발급된 토큰도 만료돼요."
            : pending?.kind === "delete"
              ? "카드·기획·사진·계정이 전부 삭제되고 되돌릴 수 없어요. 사용자의 파기 요청이 있을 때만 실행하세요."
              : pending?.kind === "viewMessages"
                ? `«${pending.topic || "제목 없음"}» — 열람 사실이 감사 로그에 남아요.`
                : undefined
        }
        confirmLabel={
          pending?.kind === "suspend"
            ? pending.next
              ? "정지"
              : "해제"
            : pending?.kind === "delete"
              ? "파기 실행"
              : "열람"
        }
        danger={pending?.kind === "delete" || (pending?.kind === "suspend" && pending.next)}
        reasonRequired
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={(reason) => void confirm(reason)}
      />

      <DetailDrawer
        open={drawer !== null}
        title={`기획 대화 — ${drawer?.topic || ""}`}
        onClose={() => setDrawer(null)}
      >
        <div className="flex flex-col gap-3">
          {drawer?.messages.length === 0 && <p className="text-[#6B7280]">대화가 없어요.</p>}
          {drawer?.messages.map((m, i) =>
            m.role === "system" ? (
              <p key={i} className="py-1 text-center text-xs text-[#6B7280]">
                — {m.content} —
              </p>
            ) : (
              <div
                key={i}
                className={`rounded-md p-3 ${
                  m.role === "user" ? "bg-[#E6F4FF]" : "bg-[#F5F5F5]"
                }`}
              >
                <p className="mb-1 text-xs font-semibold text-[#6B7280]">
                  {m.role === "user" ? "사용자" : "차곡 AI"}
                </p>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            ),
          )}
        </div>
      </DetailDrawer>
    </div>
  );
}
