"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import AppTopNav from "@/components/AppTopNav";
import MobileBottomNav from "@/components/MobileBottomNav";
import InlineAlert from "@/components/InlineAlert";
import PageHeader from "@/components/PageHeader";
import SettingsTabs from "@/components/SettingsTabs";

/**
 * 설정 — 문의 (09-08 · 백오피스 기획 §2-②). 인앱 문의 접수 + 내 문의 내역.
 *
 * 이메일 대신 인앱으로 받는 이유: 계정이 자동으로 붙어 «어느 계정이세요?»를
 * 물을 일이 없고, 접수→답변 상태가 남아 놓친 문의가 구조적으로 안 생긴다.
 * 답변이 달리면 이 화면에서 확인한다 (알림 발송은 이후 단계).
 *
 * 최소 구현 — 다듬기는 창현 님 인계 (백오피스 기획 §7).
 */

const CATEGORIES = [
  { value: "bug", label: "오류 신고" },
  { value: "account", label: "계정 문의" },
  { value: "result", label: "생성 결과 문의" },
  { value: "etc", label: "기타" },
] as const;

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

type Inquiry = {
  id: string;
  category: string;
  body: string;
  status: string;
  createdAt: string | null;
  answer: { body: string; answeredAt: string } | null;
};

function fmt(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" })
    : "";
}

export default function SupportPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[] | null>(null);
  const [faqs, setFaqs] = useState<{ id: string; question: string; answer: string }[]>([]);
  const [notices, setNotices] = useState<{ id: string; title: string; publishedAt: string | null }[]>([]);
  const [category, setCategory] = useState<string>("bug");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async (u: User) => {
    // 공지·FAQ — 공개 콘텐츠 한 번에
    void fetch("/api/content")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            faqs?: { id: string; question: string; answer: string }[];
            notices?: { id: string; title: string; publishedAt: string | null }[];
          } | null,
        ) => {
          if (data?.faqs) setFaqs(data.faqs);
          if (data?.notices) setNotices(data.notices.slice(0, 3));
        },
      )
      .catch(() => {});
    try {
      const token = await u.getIdToken();
      const res = await fetch("/api/inquiries", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { inquiries: Inquiry[] };
      setInquiries(data.inquiries);
    } catch {
      setInquiries([]);
      setNotice({ tone: "error", text: "문의 내역을 불러오지 못했어요. 새로고침 해주세요." });
    }
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        if (!u) {
          router.replace("/login");
          return;
        }
        setUser(u);
        void load(u);
      }),
    [load, router],
  );

  async function submit() {
    if (!user || !body.trim() || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ category, body: body.trim() }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "접수하지 못했어요.");
      setBody("");
      setNotice({ tone: "success", text: "문의를 접수했어요. 답변이 달리면 아래 내역에 표시돼요." });
      await load(user);
    } catch (e) {
      setNotice({
        tone: "error",
        text: e instanceof Error ? e.message : "접수하지 못했어요. 잠시 후 다시 시도해주세요.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppTopNav />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[960px] flex-1 p-4 pb-24 md:p-6 md:pb-8 min-[1200px]:p-8">
          <PageHeader fallbackHref="/" backLabel="돌아가기" />

          <div className="mt-2">
            <SettingsTabs />
          </div>

          <header className="mt-6 flex flex-col gap-1">
            <h1 className="text-h3 font-bold text-ink">고객센터</h1>
            <p className="text-body text-sub">소식과 도움말을 모아뒀어요. 해결이 안 되면 바로 문의해주세요.</p>
          </header>

          {notice && (
            <div className="mt-4">
              <InlineAlert>{notice.text}</InlineAlert>
            </div>
          )}

          <section className="mt-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-body font-bold text-ink">공지사항</h2>
              <Link href="/notices" className="text-caption text-sub hover:text-ink">
                전체 보기 →
              </Link>
            </div>
            {notices.length === 0 ? (
              <p className="mt-3 text-body text-sub">아직 등록된 공지가 없어요.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1">
                {notices.map((n) => (
                  <li key={n.id}>
                    <Link
                      href="/notices"
                      className="flex items-baseline justify-between gap-3 rounded-lg px-1 py-1.5 hover:bg-berry-tint"
                    >
                      <span className="truncate text-body text-ink">{n.title}</span>
                      {n.publishedAt && (
                        <span className="shrink-0 text-caption text-sub">
                          {new Date(n.publishedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8 flex flex-col gap-3">
            <h2 className="text-body font-bold text-ink">직접 문의하기</h2>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={[
                    "rounded-full border px-3 py-1.5 text-body transition-colors",
                    category === c.value
                      ? "border-berry bg-berry-light font-semibold text-berry-dark"
                      : "border-line text-sub hover:text-ink",
                  ].join(" ")}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="무엇이 궁금하신가요? 오류라면 어떤 화면에서 무엇을 하다 그랬는지 적어주시면 빨라요."
              className="rounded-xl border border-line p-4 text-body text-ink"
            />
            <button
              type="button"
              disabled={busy || !body.trim()}
              onClick={() => void submit()}
              className="self-end rounded-xl bg-berry px-5 py-2.5 text-body font-semibold text-white disabled:opacity-50"
            >
              {busy ? "접수 중…" : "문의 보내기"}
            </button>
          </section>

          {faqs.length > 0 && (
            <section className="mt-10">
              <h2 className="text-body font-bold text-ink">자주 묻는 질문</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {faqs.map((f) => (
                  <li key={f.id}>
                    <details className="rounded-xl border border-line p-4">
                      <summary className="cursor-pointer text-body font-semibold text-ink">
                        {f.question}
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap text-body text-sub">{f.answer}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-10">
            <h2 className="text-body font-bold text-ink">문의 내역</h2>
            {inquiries === null ? (
              <p className="mt-3 text-body text-sub">불러오는 중…</p>
            ) : inquiries.length === 0 ? (
              <p className="mt-3 text-body text-sub">아직 보낸 문의가 없어요.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {inquiries.map((q) => (
                  <li key={q.id} className="rounded-xl border border-line p-4">
                    <div className="flex items-center justify-between text-caption text-sub">
                      <span>
                        {CATEGORY_LABELS[q.category] ?? "기타"} · {fmt(q.createdAt)}
                      </span>
                      <span className={q.status === "answered" ? "font-semibold text-berry-dark" : ""}>
                        {q.status === "answered" ? "답변 완료" : "접수됨"}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-body text-ink">{q.body}</p>
                    {q.answer && (
                      <div className="mt-3 rounded-lg bg-berry-tint p-3">
                        <p className="text-caption font-semibold text-sub">차곡 팀의 답변</p>
                        <p className="mt-1 whitespace-pre-wrap text-body text-ink">{q.answer.body}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
