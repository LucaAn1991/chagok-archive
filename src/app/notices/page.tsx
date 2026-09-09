import type { Metadata } from "next";
import Link from "next/link";
import { adminDb } from "@/lib/firebase/admin";

export const metadata: Metadata = { title: "공지사항 — 차곡" };
export const revalidate = 60; // 공지는 자주 안 바뀐다 — 60초 캐시

/**
 * 공지 목록 (09-08 · 백오피스 기획 §2-①). 로그인 없이 열린다 — 점검 안내는
 * 로그인 못 하는 사용자도 봐야 한다. 서버 렌더 — 클라이언트 fetch가 필요 없다.
 */
export default async function NoticesPage() {
  let notices: { id: string; title: string; body: string; publishedAt: string | null }[] = [];
  try {
    const snap = await adminDb.collection("notices").where("status", "==", "published").get();
    notices = snap.docs
      .map((d) => {
        const v = d.data();
        return {
          id: d.id,
          title: (v.title as string) ?? "",
          body: (v.body as string) ?? "",
          publishedAt: v.publishedAt?.toDate?.()?.toISOString() ?? null,
        };
      })
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  } catch {
    // 읽기 실패 — 빈 목록으로 그린다 (아래 empty state)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* 로그인 전에도 열리는 페이지라 앱 상단 바 대신 가벼운 머리줄만 둔다 (약관 페이지와 같은 이유) */}
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <Link href="/" className="text-body font-bold text-berry">
          차곡
        </Link>
        <Link href="/" className="text-caption text-sub hover:text-ink">
          돌아가기
        </Link>
      </header>
      <main className="mx-auto w-full max-w-[720px] flex-1 p-4 md:p-6">
        <h1 className="mt-4 text-h3 font-bold text-ink">공지사항</h1>
        {notices.length === 0 ? (
          <p className="mt-6 text-body text-sub">아직 등록된 공지가 없어요.</p>
        ) : (
          <ul className="mt-6 flex flex-col gap-4">
            {notices.map((n) => (
              <li key={n.id} className="rounded-xl border border-line p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-body font-bold text-ink">{n.title}</h2>
                  {n.publishedAt && (
                    <span className="shrink-0 text-caption text-sub">
                      {new Date(n.publishedAt).toLocaleDateString("ko-KR", {
                        timeZone: "Asia/Seoul",
                      })}
                    </span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-body text-ink">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
