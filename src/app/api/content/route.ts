import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

/**
 * 공개 콘텐츠 (백오피스 기획 §2-①) — 공지·FAQ의 published만.
 * 로그인 없이 열린다 — 공지·FAQ는 공개 정보다.
 * banner = 가장 최근 published된 banner 공지 1건 (동시 여러 개 노출 금지 규칙).
 */
export async function GET() {
  try {
    const [noticeSnap, faqSnap] = await Promise.all([
      adminDb.collection("notices").where("status", "==", "published").get(),
      adminDb.collection("faqs").where("status", "==", "published").get(),
    ]);

    const notices = noticeSnap.docs
      .map((d) => {
        const v = d.data();
        return {
          id: d.id,
          title: (v.title as string) ?? "",
          body: (v.body as string) ?? "",
          level: (v.level as string) ?? "normal",
          publishedAt: v.publishedAt?.toDate?.()?.toISOString() ?? null,
        };
      })
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

    const faqs = faqSnap.docs
      .map((d) => {
        const v = d.data();
        return {
          id: d.id,
          question: (v.question as string) ?? "",
          answer: (v.answer as string) ?? "",
          order: (v.order as number) ?? 0,
        };
      })
      .sort((a, b) => a.order - b.order);

    const banner = notices.find((n) => n.level === "banner") ?? null;

    return NextResponse.json(
      { banner, notices, faqs },
      // 공개 콘텐츠는 자주 안 바뀐다 — 60초 캐시로 읽기 비용을 누른다
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (e) {
    console.error("[content]", e);
    return NextResponse.json({ banner: null, notices: [], faqs: [] });
  }
}
