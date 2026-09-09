"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { adminFetch } from "@/lib/admin/api";
import PageHeader from "@/components/admin/PageHeader";
import DataTable, { type Column } from "@/components/admin/DataTable";
import StatusTag from "@/components/admin/StatusTag";
import DetailDrawer from "@/components/admin/DetailDrawer";
import ListCount from "@/components/admin/ListCount";
import SectionHeading from "@/components/admin/SectionHeading";
import ConfirmModal from "@/components/admin/ConfirmModal";

/**
 * 콘텐츠 관리 (백오피스 기획 §2-①) — 공지 · FAQ · 템플릿.
 * hidden이 임시저장을 겸한다 — 만들면 숨김으로 시작, 준비되면 공개.
 */

type Notice = {
  id: string;
  title: string;
  body: string;
  level: string;
  status: string;
  publishedAt: string | null;
};
type Faq = { id: string; question: string; answer: string; status: string; order: number };
type StyleRow = {
  id: string;
  label: string;
  displayName: string | null;
  ready: boolean;
  visible: boolean;
  pickedLast30d: number;
  addedOn: string | null;
  displayOrder: number;
};

type TabKey = "notices" | "faqs" | "styles";

function fmtDate(iso: string | null): string {
  // ko-KR 공식 표기("2026. 9. 9.")는 표에서 지저분하다 — 어드민은 YYYY-MM-DD로 통일
  return iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso)) : "–";
}

export default function AdminContentPage() {
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<TabKey>("notices");
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [faqs, setFaqs] = useState<Faq[] | null>(null);
  const [styles, setStyles] = useState<StyleRow[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // 편집 서랍 — null=닫힘, id=""는 새로 만들기
  const [noticeDraft, setNoticeDraft] = useState<Notice | null>(null);
  const [faqDraft, setFaqDraft] = useState<Faq | null>(null);
  const [styleDraft, setStyleDraft] = useState<StyleRow | null>(null);
  const [deleting, setDeleting] = useState<{ kind: "notice" | "faq"; id: string; label: string } | null>(null);

  const load = useCallback(async (u: User) => {
    try {
      const [n, f, s] = await Promise.all([
        adminFetch(u, "GET", "/api/admin/notices"),
        adminFetch(u, "GET", "/api/admin/faqs"),
        adminFetch(u, "GET", "/api/admin/styles"),
      ]);
      setNotices(n.notices as Notice[]);
      setFaqs(f.faqs as Faq[]);
      setStyles(s.styles as StyleRow[]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했어요.");
    }
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (u) void load(u);
      }),
    [load],
  );

  async function run(fn: () => Promise<void>, done: string) {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      setMessage(done);
      await load(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  /* ── 공지 ── */
  const noticeColumns: Column<Notice>[] = [
    { key: "title", title: "제목", render: (n) => <span className="line-clamp-1">{n.title}</span> },
    {
      key: "level",
      title: "노출",
      width: "10%",
      render: (n) => (n.level === "banner" ? "홈 배너" : "일반"),
    },
    {
      key: "status",
      align: "center",
      title: "상태",
      width: "10%",
      render: (n) =>
        n.status === "published" ? (
          <StatusTag kind="active" label="공개" />
        ) : (
          <StatusTag kind="deleted" label="숨김" />
        ),
    },
    {
      key: "publishedAt",
      title: "공개일",
      width: "12%",
      nowrap: true,
      render: (n) => fmtDate(n.publishedAt),
    },
  ];

  /* ── FAQ ── */
  const faqColumns: Column<Faq>[] = [
    {
      key: "order",
      align: "center",
      title: "순서",
      width: "7%",
      nowrap: true,
      render: (f) => f.order,
    },
    { key: "question", title: "질문", render: (f) => f.question },
    {
      key: "status",
      align: "center",
      title: "상태",
      width: "10%",
      render: (f) =>
        f.status === "published" ? (
          <StatusTag kind="active" label="공개" />
        ) : (
          <StatusTag kind="deleted" label="숨김" />
        ),
    },
  ];

  /* ── 템플릿 ── */
  const styleColumns: Column<StyleRow>[] = [
    {
      key: "displayOrder",
      align: "center",
      title: "순서",
      width: "7%",
      nowrap: true,
      render: (s) => s.displayOrder,
    },
    {
      key: "label",
      title: "템플릿",
      render: (s) => (
        <span>
          {s.displayName ?? s.label}
          {s.displayName && <span className="ml-1 text-xs text-[#6B7280]">({s.label})</span>}
          {!s.ready && <span className="ml-1 text-xs text-[#6B7280]">— 에셋 준비 중</span>}
        </span>
      ),
    },
    {
      key: "preview",
      title: "이미지 보기",
      width: "10%",
      render: (s) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/styles/${s.id}/preview`} alt="" width={48} height={60} className="rounded border border-[#E5E7EB]" />
      ),
    },
    {
      key: "addedOn",
      title: "등록일",
      width: "12%",
      nowrap: true,
      render: (s) => s.addedOn ?? "–",
    },
    {
      key: "picked",
      align: "center",
      title: "최근 30일 선택 수",
      width: "13%",
      nowrap: true,
      render: (s) => `${s.pickedLast30d}건`,
    },
    {
      key: "visible",
      align: "center",
      title: "상태",
      width: "10%",
      render: (s) =>
        s.visible ? (
          <StatusTag kind="active" label="노출" />
        ) : (
          <StatusTag kind="deleted" label="숨김" />
        ),
    },
  ];

  const sortedStyles = [...(styles ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "관리자", href: "/admin" }, { label: "콘텐츠" }]}
        title="콘텐츠"
      />

      {message && <p className="mb-4 text-sm text-green-700">{message}</p>}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="mb-4 flex gap-1 border-b border-[#E5E7EB]">
        {(
          [
            { key: "notices", label: `공지${notices ? ` (${notices.length})` : ""}` },
            { key: "faqs", label: `FAQ${faqs ? ` (${faqs.length})` : ""}` },
            { key: "styles", label: `템플릿${styles ? ` (${styles.length})` : ""}` },
          ] as { key: TabKey; label: string }[]
        ).map((t) => (
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
          </button>
        ))}
      </div>

      {tab === "notices" && (
        <>
          <SectionHeading
            title="목록"
            aside={
              <div className="flex items-center gap-3 pr-3">
                <button
                  type="button"
                  onClick={() =>
                    setNoticeDraft({ id: "", title: "", body: "", level: "normal", status: "hidden", publishedAt: null })
                  }
                  className="rounded-full bg-[#1677FF] px-3.5 py-0.5 text-[13px] font-medium text-white hover:bg-[#4096FF]"
                >
                  추가하기
                </button>
                <ListCount shown={notices?.length ?? 0} total={notices?.length ?? 0} filtered={false} className="text-[13px]" />
              </div>
            }
          />
        <DataTable
          columns={noticeColumns}
          rows={notices ?? []}
          rowKey={(n) => n.id}
          loading={notices === null}
          emptyTitle="공지가 없어요"
          emptyDescription="배너 공지는 published 중 가장 최근 1건만 홈에 떠요"
          onRowClick={(n) => setNoticeDraft({ ...n })}
        />
        </>
      )}
      {tab === "faqs" && (
        <>
          <SectionHeading
            title="목록"
            aside={
              <div className="flex items-center gap-3 pr-3">
                <button
                  type="button"
                  onClick={() => setFaqDraft({ id: "", question: "", answer: "", status: "hidden", order: 0 })}
                  className="rounded-full bg-[#1677FF] px-3.5 py-0.5 text-[13px] font-medium text-white hover:bg-[#4096FF]"
                >
                  추가하기
                </button>
                <ListCount shown={faqs?.length ?? 0} total={faqs?.length ?? 0} filtered={false} className="text-[13px]" />
              </div>
            }
          />
          <DataTable
            columns={faqColumns}
            rows={faqs ?? []}
            rowKey={(f) => f.id}
            loading={faqs === null}
            emptyTitle="FAQ가 없어요"
            emptyDescription="FAQ는 문의의 1차 방어선 — 자주 오는 문의부터 채워요"
            onRowClick={(f) => setFaqDraft({ ...f })}
            onReorder={(fromId, toId) => {
              const list = [...(faqs ?? [])];
              const fi = list.findIndex((f) => f.id === fromId);
              const ti = list.findIndex((f) => f.id === toId);
              if (fi === -1 || ti === -1) return;
              const [moved] = list.splice(fi, 1);
              list.splice(ti, 0, moved);
              setFaqs(list.map((f, i) => ({ ...f, order: i + 1 }))); // 낙관적 반영 — 실패 시 run이 다시 불러온다
              void run(async () => {
                await adminFetch(user!, "POST", "/api/admin/faqs/reorder", {
                  ids: list.map((f) => f.id),
                });
              }, "순서를 저장했어요.");
            }}
          />
        </>
      )}
      {tab === "styles" && (
        <>
          <SectionHeading title="목록" />
          <DataTable
            columns={styleColumns}
            rows={sortedStyles}
            rowKey={(s) => s.id}
            loading={styles === null}
            emptyTitle="템플릿이 없어요"
            onRowClick={(s) => setStyleDraft({ ...s })}
            onReorder={(fromId, toId) => {
              const list = [...sortedStyles];
              const fi = list.findIndex((x) => x.id === fromId);
              const ti = list.findIndex((x) => x.id === toId);
              if (fi === -1 || ti === -1) return;
              const [moved] = list.splice(fi, 1);
              list.splice(ti, 0, moved);
              setStyles(list.map((x, i) => ({ ...x, displayOrder: i + 1 })));
              void run(async () => {
                await adminFetch(user!, "PATCH", "/api/admin/styles", {
                  order: list.map((x) => x.id),
                });
              }, "진열 순서를 저장했어요.");
            }}
          />
        </>
      )}

      {/* 공지 편집 서랍 */}
      <DetailDrawer
        open={noticeDraft !== null}
        title={noticeDraft?.id ? "공지 수정" : "새 공지"}
        onClose={() => setNoticeDraft(null)}
      >
        {noticeDraft && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              제목 (80자 이내)
              <input
                value={noticeDraft.title}
                maxLength={80}
                onChange={(e) => setNoticeDraft({ ...noticeDraft, title: e.target.value })}
                className="rounded-md border border-[#E5E7EB] px-3 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1">
              본문
              <textarea
                value={noticeDraft.body}
                rows={8}
                onChange={(e) => setNoticeDraft({ ...noticeDraft, body: e.target.value })}
                className="rounded-md border border-[#E5E7EB] p-3"
              />
            </label>
            <label className="flex flex-col gap-1">
              노출 위치
              <select
                value={noticeDraft.level}
                onChange={(e) => setNoticeDraft({ ...noticeDraft, level: e.target.value })}
                className="rounded-md border border-[#E5E7EB] px-2 py-1.5"
              >
                <option value="normal">일반 (공지 목록)</option>
                <option value="banner">홈 배너 (최근 1건만 노출)</option>
              </select>
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const payload = {
                      title: noticeDraft.title,
                      body: noticeDraft.body,
                      level: noticeDraft.level,
                    };
                    if (noticeDraft.id) {
                      await adminFetch(user!, "PATCH", `/api/admin/notices/${noticeDraft.id}`, payload);
                    } else {
                      await adminFetch(user!, "POST", "/api/admin/notices", payload);
                    }
                    setNoticeDraft(null);
                  }, noticeDraft.id ? "저장했어요." : "목록에 추가됐어요. 사용자에게 보이려면 행을 눌러 «공개하기»로 상태를 바꿔주세요.")
                }
                className="rounded-md bg-[#1677FF] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                저장
              </button>
              {noticeDraft.id && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await adminFetch(user!, "PATCH", `/api/admin/notices/${noticeDraft.id}`, {
                          status: noticeDraft.status === "published" ? "hidden" : "published",
                        });
                        setNoticeDraft(null);
                      }, noticeDraft.status === "published" ? "숨겼어요." : "공개했어요.")
                    }
                    className="rounded-md border border-[#E5E7EB] px-4 py-1.5 text-sm disabled:opacity-50"
                  >
                    {noticeDraft.status === "published" ? "숨기기" : "공개하기"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDeleting({ kind: "notice", id: noticeDraft.id, label: noticeDraft.title })}
                    className="ml-auto rounded-md border border-red-300 px-4 py-1.5 text-sm text-red-600 disabled:opacity-50"
                  >
                    삭제
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>

      {/* FAQ 편집 서랍 */}
      <DetailDrawer
        open={faqDraft !== null}
        title={faqDraft?.id ? "FAQ 수정" : "새 FAQ"}
        onClose={() => setFaqDraft(null)}
      >
        {faqDraft && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              질문 (100자 이내)
              <input
                value={faqDraft.question}
                maxLength={100}
                onChange={(e) => setFaqDraft({ ...faqDraft, question: e.target.value })}
                className="rounded-md border border-[#E5E7EB] px-3 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1">
              답변
              <textarea
                value={faqDraft.answer}
                rows={8}
                onChange={(e) => setFaqDraft({ ...faqDraft, answer: e.target.value })}
                className="rounded-md border border-[#E5E7EB] p-3"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const payload = { question: faqDraft.question, answer: faqDraft.answer };
                    if (faqDraft.id) {
                      await adminFetch(user!, "PATCH", `/api/admin/faqs/${faqDraft.id}`, payload);
                    } else {
                      await adminFetch(user!, "POST", "/api/admin/faqs", payload);
                    }
                    setFaqDraft(null);
                  }, faqDraft.id ? "저장했어요." : "목록에 추가됐어요. 사용자에게 보이려면 행을 눌러 «공개하기»로 상태를 바꿔주세요.")
                }
                className="rounded-md bg-[#1677FF] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                저장
              </button>
              {faqDraft.id && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await adminFetch(user!, "PATCH", `/api/admin/faqs/${faqDraft.id}`, {
                          status: faqDraft.status === "published" ? "hidden" : "published",
                        });
                        setFaqDraft(null);
                      }, faqDraft.status === "published" ? "숨겼어요." : "공개했어요.")
                    }
                    className="rounded-md border border-[#E5E7EB] px-4 py-1.5 text-sm disabled:opacity-50"
                  >
                    {faqDraft.status === "published" ? "숨기기" : "공개하기"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDeleting({ kind: "faq", id: faqDraft.id, label: faqDraft.question })}
                    className="ml-auto rounded-md border border-red-300 px-4 py-1.5 text-sm text-red-600 disabled:opacity-50"
                  >
                    삭제
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>

      {/* 템플릿 진열 서랍 */}
      <DetailDrawer
        open={styleDraft !== null}
        title={`템플릿 — ${styleDraft?.label ?? ""}`}
        onClose={() => setStyleDraft(null)}
      >
        {styleDraft && (
          <div className="flex flex-col gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/styles/${styleDraft.id}/preview`}
              alt=""
              width={160}
              height={200}
              className="rounded border border-[#E5E7EB]"
            />
            <p className="text-xs text-[#6B7280]">최근 30일 선택 {styleDraft.pickedLast30d}건</p>
            <label className="flex flex-col gap-1">
              표시 이름 <span className="text-xs text-[#6B7280]">(비우면 기본 이름 «{styleDraft.label}»)</span>
              <input
                value={styleDraft.displayName ?? ""}
                maxLength={20}
                onChange={(e) => setStyleDraft({ ...styleDraft, displayName: e.target.value })}
                className="rounded-md border border-[#E5E7EB] px-3 py-1.5"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await adminFetch(user!, "PATCH", "/api/admin/styles", {
                      styleId: styleDraft.id,
                      displayName: styleDraft.displayName ?? "",
                    });
                    setStyleDraft(null);
                  }, "저장했어요.")
                }
                className="rounded-md bg-[#1677FF] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                저장
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await adminFetch(user!, "PATCH", "/api/admin/styles", {
                      styleId: styleDraft.id,
                      visible: !styleDraft.visible,
                    });
                    setStyleDraft(null);
                  }, styleDraft.visible ? "숨겼어요 — 신규 선택에서 빠져요." : "노출로 바꿨어요.")
                }
                className="rounded-md border border-[#E5E7EB] px-4 py-1.5 text-sm disabled:opacity-50"
              >
                {styleDraft.visible ? "숨기기" : "노출하기"}
              </button>
            </div>
          </div>
        )}
      </DetailDrawer>

      <ConfirmModal
        key={deleting ? `${deleting.kind}-${deleting.id}` : "closed"}
        open={deleting !== null}
        title={`«${deleting?.label ?? ""}» 을(를) 삭제할까요?`}
        description="삭제하면 되돌릴 수 없어요. 잠시 내리는 거라면 «숨기기»를 쓰세요."
        confirmLabel="삭제"
        danger
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          void run(async () => {
            const path =
              deleting!.kind === "notice"
                ? `/api/admin/notices/${deleting!.id}`
                : `/api/admin/faqs/${deleting!.id}`;
            const token = await user!.getIdToken();
            const res = await fetch(path, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
              const data = (await res.json().catch(() => null)) as { error?: string } | null;
              throw new Error(data?.error ?? "삭제하지 못했어요.");
            }
            setDeleting(null);
            setNoticeDraft(null);
            setFaqDraft(null);
          }, "삭제했어요.")
        }
      />
    </div>
  );
}
