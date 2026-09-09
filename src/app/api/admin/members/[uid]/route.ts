import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";

/**
 * 회원 상세 (백오피스 기획 §2-②) — CS의 출발점.
 * 머리에 «이 사람의 차곡 상태»(주간 목표 대비 발행·잔고), 아래에 활동·동의·관리 기록.
 * 대화 내용·업로드 사진은 여기 없다 — 민감 열람은 별도 API가 사유를 받고 기록한다.
 */

function tsToIso(v: unknown): string | null {
  return v instanceof Timestamp ? v.toDate().toISOString() : null;
}

/** KST 기준 이번 주 월요일 0시. 요일 판정은 dateKey를 UTC로 읽어야 KST 요일과 일치한다 */
function kstWeekStart(): Date {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const weekday = (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7; // 0=월
  return new Date(new Date(`${key}T00:00:00+09:00`).getTime() - weekday * 86400000);
}

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/members/[uid]">,
) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();
  const { uid } = await ctx.params;

  try {
    const weekStart = kstWeekStart();
    const in7days = new Date(Date.now() + 7 * 86400000);

    const [authUser, userSnap, plansSnap, cardsSnap, consentsSnap, logsSnap] = await Promise.all([
      adminAuth.getUser(uid).catch(() => null),
      adminDb.collection("users").doc(uid).get(),
      adminDb.collection("plans").where("userId", "==", uid).get(),
      adminDb.collection("cards").where("userId", "==", uid).get(),
      adminDb.collection("consents").where("userId", "==", uid).get(),
      adminDb.collection("admin_logs").where("targetId", "==", uid).get(),
    ]);

    if (!authUser && !userSnap.exists) {
      return NextResponse.json({ error: "없는 회원이에요." }, { status: 404 });
    }
    const doc = userSnap.data() ?? {};

    const cards = cardsSnap.docs.map((d) => {
      const c = d.data();
      return {
        id: d.id,
        title: (c.title as string) ?? "",
        status: (c.status as string) ?? "planned",
        scheduledDate: (c.scheduledDate as string) ?? null,
        publishedAt: tsToIso(c.publishedAt),
        fallbackCount: (c.fallbackCount as number) ?? 0,
        createdAt: tsToIso(c.createdAt),
      };
    });

    const publishedThisWeek = cards.filter(
      (c) => c.publishedAt && new Date(c.publishedAt) >= weekStart,
    ).length;
    const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
      new Date(),
    );
    const in7Key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(in7days);
    const balance7d = cards.filter(
      (c) =>
        c.status !== "discarded" &&
        c.status !== "published" &&
        c.scheduledDate &&
        c.scheduledDate >= todayKey &&
        c.scheduledDate <= in7Key,
    ).length;

    const plans = plansSnap.docs
      .map((d) => {
        const p = d.data();
        return {
          id: d.id,
          topic: (p.topic as string) ?? "",
          status: (p.status as string) ?? "draft",
          cardCount: (p.cardCount as number) ?? 0,
          confirmedAt: tsToIso(p.confirmedAt),
          createdAt: tsToIso(p.createdAt),
        };
      })
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

    const consents = consentsSnap.docs
      .map((d) => {
        const c = d.data();
        return {
          termsVersion: (c.termsVersion as string) ?? "",
          privacyVersion: (c.privacyVersion as string) ?? "",
          usageDataConsent: Boolean(c.usageDataConsent),
          agreedAt: (c.agreedAt as string) ?? "",
        };
      })
      .sort((a, b) => b.agreedAt.localeCompare(a.agreedAt));

    const adminLogs = logsSnap.docs
      .map((d) => {
        const l = d.data();
        return {
          action: (l.action as string) ?? "",
          actorEmail: (l.actorEmail as string) ?? "",
          reason: (l.reason as string) ?? null,
          at: tsToIso(l.at),
        };
      })
      .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

    return NextResponse.json({
      account: {
        uid,
        email: authUser?.email ?? "(계정 삭제됨)",
        nickname: (doc.nickname as string) ?? "",
        field: (doc.field as string) ?? "",
        createdAt: authUser?.metadata.creationTime ?? null,
        lastSignInTime: authUser?.metadata.lastSignInTime ?? null,
        onboardedAt: tsToIso(doc.onboardedAt),
        disabled: authUser?.disabled ?? false,
        uploadFrequency: (doc.uploadFrequency as number) ?? null,
        uploadDays: (doc.uploadDays as number[]) ?? [],
      },
      weekly: {
        goal: (doc.uploadFrequency as number) ?? 0,
        published: publishedThisWeek,
        balance7d,
      },
      plans,
      cards: cards.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
      counts: {
        plans: plansSnap.size,
        cards: cardsSnap.size,
        published: cards.filter((c) => c.status === "published").length,
        discarded: cards.filter((c) => c.status === "discarded").length,
      },
      consents,
      adminLogs,
    });
  } catch (e) {
    console.error("[admin/members/uid]", e);
    return NextResponse.json({ error: "회원 정보를 불러오지 못했어요." }, { status: 500 });
  }
}
