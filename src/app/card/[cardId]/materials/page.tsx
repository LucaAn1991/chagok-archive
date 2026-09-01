"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import CardPhotoUploader from "@/components/CardPhotoUploader";
import { MAX_PHOTOS_PER_CARD } from "@/lib/storage/limits";
import type { Card, Plan } from "@/types";

/**
 * 재료 추가 (F13) — 사진 · 템플릿 변수 · 이번에 꼭 넣을 내용.
 *
 * - photoUrls·extraNote·templateVars는 보안 규칙이 클라이언트 쓰기를 허용한다 → SDK 직접 저장
 * - 템플릿 변수 입력칸은 기록형일 때 plan.templateVarNames로 자동 생성 (PLAN.md §2-2)
 * - 사진 업로드를 «묻는 단계»로 만들지 않는다 — 있으면 쓰고 없으면 넘어간다 (DESIGN.md §12)
 *
 * 사진 파일은 서버가 발급한 서명 URL로 브라우저 → Storage에 직접 올라간다.
 * 여기서는 «올라간 사진의 주소 목록»만 들고 있다가 나머지 입력과 함께 저장한다.
 */

type Phase = "loading" | "ready" | "not-found" | "error";

export default function CardMaterialsPage() {
  const router = useRouter();
  const { cardId } = useParams<{ cardId: string }>();

  const [phase, setPhase] = useState<Phase>("loading");
  const [card, setCard] = useState<Card | null>(null);
  const [varNames, setVarNames] = useState<string[]>([]);
  const [extraNote, setExtraNote] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      try {
        const snap = await getDoc(doc(db, "cards", cardId));
        const data = snap.data() as Card | undefined;
        if (!data || data.userId !== user.uid) {
          setPhase("not-found");
          return;
        }
        setCard(data);
        setExtraNote(data.extraNote);
        setPhotoUrls(data.photoUrls ?? []);
        setTemplateVars(data.templateVars);

        // 기록형이면 plan의 변수 이름으로 입력칸을 만든다. plan이 없으면 기존 값의 키로 대체
        let names: string[] = Object.keys(data.templateVars);
        if (data.planId) {
          const planSnap = await getDoc(doc(db, "plans", data.planId)).catch(() => null);
          const plan = planSnap?.data() as Plan | undefined;
          if (plan?.type === "record" && plan.templateVarNames.length > 0) {
            names = plan.templateVarNames;
          }
        }
        setVarNames(names);
        setPhase("ready");
      } catch {
        setPhase("error");
      }
    });
    return unsubscribe;
  }, [cardId, router]);

  const dirty =
    card !== null &&
    (extraNote !== card.extraNote ||
      JSON.stringify(photoUrls) !== JSON.stringify(card.photoUrls ?? []) ||
      JSON.stringify(templateVars) !== JSON.stringify(card.templateVars));

  /** 업로드 URL 발급 API를 부를 때 쓰는 Firebase ID 토큰 */
  async function getToken(): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error("로그인이 필요해요.");
    return user.getIdToken();
  }

  /** 변경 사항 저장 후 제작 결과로 이동 */
  async function saveAndCraft() {
    if (!card) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (dirty) {
        await updateDoc(doc(db, "cards", cardId), {
          extraNote,
          photoUrls,
          templateVars,
        });
      }
      router.push(`/card/${cardId}/result`);
    } catch {
      setSaveError("저장하지 못했어요. 다시 시도해주세요.");
      setSaving(false);
    }
  }

  if (phase === "loading") {
    return (
      <AppShell>
        <div aria-hidden className="flex flex-col gap-4">
        <div className="h-8 w-40 animate-pulse rounded-md bg-surface-muted" />
        <div className="h-32 animate-pulse rounded-lg bg-surface-muted" />
        <div className="h-32 animate-pulse rounded-lg bg-surface-muted" />
      </div>
      </AppShell>
    );
  }

  if (phase === "not-found" || phase === "error" || !card) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center gap-3 py-16">
        <h1 className="text-title font-bold">
          {phase === "error" ? "카드를 불러오지 못했어요" : "카드를 찾을 수 없어요"}
        </h1>
        <Link href="/" className="text-body text-berry-dark underline underline-offset-4">
          홈으로 돌아가기
        </Link>
      </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader fallbackHref={`/card/${cardId}`} backLabel="돌아가기" />
      <div className="mt-3 flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-h3 font-bold text-ink">재료 추가</h1>
        <p className="text-body text-sub">{card.title}</p>
        <p className="text-body text-sub">
          없어도 괜찮아요. 있는 것만 담으면 결과물에 반영돼요.
        </p>
      </header>

      {/* 사진 — 버킷이 없으면 컴포넌트가 스스로 「준비 중」으로 내려앉는다 */}
      <CardPhotoUploader
        cardId={cardId}
        photoUrls={photoUrls}
        onChange={setPhotoUrls}
        getToken={getToken}
        maxPhotos={MAX_PHOTOS_PER_CARD}
      />

      {/* 이번에 꼭 넣을 내용 */}
      <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-6">
        <label htmlFor="extraNote" className="text-label font-semibold text-sub">
          이번에 꼭 넣을 내용
        </label>
        <textarea
          id="extraNote"
          value={extraNote}
          rows={3}
          onChange={(e) => setExtraNote(e.target.value)}
          placeholder="예: 이번 주 신메뉴 이름, 이벤트 마감일처럼 꼭 들어가야 하는 것"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-body text-ink placeholder:text-sub/60"
        />
      </section>

      {/* 템플릿 변수 — 기록형일 때만 */}
      {varNames.length > 0 && (
        <section aria-label="오늘의 기록" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-6">
          <span className="text-label font-semibold text-sub">오늘의 기록</span>
          {varNames.map((name) => (
            <label key={name} className="flex flex-col gap-1">
              <span className="text-body text-ink">{name}</span>
              <input
                value={templateVars[name] ?? ""}
                onChange={(e) =>
                  setTemplateVars({ ...templateVars, [name]: e.target.value })
                }
                className="h-11 w-full rounded-md border border-line bg-surface px-3 text-body text-ink"
              />
            </label>
          ))}
        </section>
      )}

      {saveError && (
        <p role="alert" className="text-body text-ink">
          {saveError}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <button
          type="button"
          onClick={saveAndCraft}
          disabled={saving}
          className="h-12 rounded-md bg-berry text-[15px] font-semibold text-white
                     hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
        >
          {saving ? "···" : dirty ? "저장하고 제작하기" : "제작하기"}
        </button>
        <Link href={`/card/${cardId}`} className="text-center text-body text-sub">
          카드로 돌아가기
        </Link>
      </section>
    </div>
      </AppShell>
  );
}
