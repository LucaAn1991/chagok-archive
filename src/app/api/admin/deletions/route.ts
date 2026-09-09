import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { adminDenied, verifyAdmin } from "@/lib/server/admin-auth";

/**
 * 탈퇴 잔여물 목록 (백오피스 기획 §1-⑤) — deletion_attempts에 남아 있는 문서 전부.
 * 남아 있다 = 파기가 끝까지 못 갔다 (running=진행 중 멈춤 · partial=파일 잔존 · failed=중단).
 */
export async function GET(request: Request) {
  const session = await verifyAdmin(request);
  if (!session) return adminDenied();

  try {
    const snap = await adminDb.collection("deletion_attempts").get();
    const attempts = snap.docs
      .map((d) => {
        const v = d.data();
        return {
          id: d.id,
          uid: (v.uid as string) ?? "",
          status: (v.status as string) ?? "running",
          failedStep: (v.failedStep as string) ?? null,
          storageFailures: (v.storageFailures as string[]) ?? [],
          error: (v.error as string) ?? null,
          startedAt: (v.startedAt as string) ?? null,
          finishedAt: (v.finishedAt as string) ?? null,
        };
      })
      .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
    return NextResponse.json({ attempts });
  } catch (e) {
    console.error("[admin/deletions]", e);
    return NextResponse.json({ error: "목록을 불러오지 못했어요." }, { status: 500 });
  }
}
