"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged, type User as AuthUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import SlideRemakePanel from "@/components/SlideRemakePanel";
import SlideComparePanel from "@/components/SlideComparePanel";
import GeneratingOverlay from "@/components/GeneratingOverlay";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import StockAttribution from "@/components/StockAttribution";
import { AI_DISCLOSURE } from "@/lib/ai-disclosure";
import type { Card, Caption, Slide } from "@/types";

/**
 * 제작 결과 (F7·F8) — 슬라이드 · 캡션 · 부분 수정.
 *
 * - 제작 전 카드면 진입 즉시 생성 — skeleton → 순차 reveal (DESIGN.md §10)
 * - 슬라이드 PNG는 GET .../slides/[order]/image 가 즉석 렌더링. fetch + blob URL
 * - 슬라이드 편집은 **별도 화면**이다 (08-31) — `/card/[cardId]/edit/[order]`.
 *   여기 아래에 패널로 붙어 있었는데, 고치는 동안 정작 슬라이드가 화면 밖으로 밀려났다.
 * - 캡션 수정만 여기 남는다 — 슬라이드와 달리 미리보기가 필요 없다
 *
 * @TODO: 슬라이드 순서·개수 변경 — 다음 단계
 *   (레이아웃·테마·구성·내 스타일·줄 조절·자유 배치·사진 교체는 08-31 구현)
 * @TODO: 발행 의향 팝업(F9) 연결 — 발행 상태 관리 구현 시
 */

type Phase = "loading" | "generating" | "ready" | "error" | "not-found";

/** 슬라이드 텍스트 슬롯의 한국어 라벨. 없는 키는 키 이름 그대로 보여준다 */
/**
 * 카드 제목을 파일 이름으로 쓸 수 있게 다듬는다.
 *
 * 윈도우·맥이 막는 글자(\ / : * ? " < > |)와 줄바꿈을 `_`로 바꾸고,
 * 끝의 점·공백(윈도우가 싫어한다)을 떼어낸다. 남는 게 없으면 기본 이름을 쓴다.
 */
function safeFileName(raw: string): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|\r\n]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .replace(/[.\s]+$/, "");
  return cleaned || "카드뉴스";
}

export default function CardResultPage() {
  const router = useRouter();
  const { cardId } = useParams<{ cardId: string }>();

  const [phase, setPhase] = useState<Phase>("loading");
  const [card, setCard] = useState<Card | null>(null);
  const [slideUrls, setSlideUrls] = useState<string[]>([]);
  const [isMock, setIsMock] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const userRef = useRef<AuthUser | null>(null);

  /* 편집 상태 */
  const [captionDraft, setCaptionDraft] = useState<Caption | null>(null);
  const [hashtagInput, setHashtagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  // 지금 다시 만들고 있는 «장» (09-02). 한 번에 하나만 — 2분씩 걸려 여러 개는 무리다.
  // 카드 전체를 다시 만드는 `regenerating`(불리언)과 다른 값이라 이름을 나눴다
  const [regenSlide, setRegenSlide] = useState<number | null>(null);
  /* 「이 장만 다시 만들기」로 편집 패널을 연 장 (09-03). null이면 다 닫힘 */
  const [editOrder, setEditOrder] = useState<number | null>(null);
  /*
    다시 만든 «미리보기» (09-03). 확정 전이라 카드엔 안 들어갔다.
    { url: 새 그림, lines: 그때 쓴 문구 }. 사용자가 옛것/새것을 고른 뒤 지운다.
  */
  const [preview, setPreview] = useState<{
    order: number;
    url: string;
    lines: string[];
    photoUrl: string | null;
  } | null>(null);
  const [applying, setApplying] = useState(false);
  /**
   * 시안으로 만드는 중의 진행 (09-02). `total`이 0이면 아직 문구를 쓰는 중이다.
   * 3분이 걸리는 일이라 **끝날 때까지 아무 말이 없으면 멈춘 줄 안다.**
   */
  const [build, setBuild] = useState<{ total: number; done: number; fallback: number }>({
    total: 0,
    done: 0,
    fallback: 0,
  });
  /**
   * 만들기 시작한 뒤 흘러간 초 (09-02).
   *
   * **이것만이 정직한 진행 표시다.** 몇 %가 됐는지는 알 수 없지만
   * «얼마나 기다렸는지»는 사실이고, 사용자가 계속 기다릴지 판단하는 근거가 된다.
   */
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (phase !== "generating") return;
    /*
      시작 시각을 여기서 잡고 1초마다 센다. 이펙트 안에서 `setElapsed(0)`을 곧바로
      부르지 않는다 — 렌더가 한 번 더 돌아 「연쇄 렌더」 경고가 난다.
      대신 «만들기 시작할 때» 0으로 되돌린다 (`generate`).
    */
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* blob URL은 언마운트 때만 해제한다 — 표시 중인 URL을 해제하면 이미지가 깨진다 */
  const urlsRef = useRef<string[]>([]);
  useEffect(() => {
    urlsRef.current = slideUrls;
  }, [slideUrls]);
  useEffect(() => {
    return () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const captionDirty =
    card?.caption && captionDraft
      ? JSON.stringify(card.caption) !== JSON.stringify(captionDraft)
      : false;

  /**
   * 짧은 피드백 토스트 (DESIGN.md §13).
   * 연달아 부르면 앞의 타이머를 지운다 — 안 그러면 나중 메시지가 먼저 사라진다.
   */
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  /**
   * 카드뉴스 이미지를 파일로 내려받는다 (08-31).
   *
   * **인스타 연동이 없으므로 사용자가 직접 올린다** (PRD §4). 그러려면 이미지가
   * 손에 있어야 하는데, 지금까지는 화면에서 보기만 되고 가져갈 방법이 없었다.
   *
   * 슬라이드는 이미 blob으로 받아둔 상태(`slideUrls`)라 다시 내려받지 않는다.
   * 여러 장을 한 번에 받으면 브라우저가 «여러 파일 다운로드» 확인을 띄울 수 있는데,
   * 사용자가 누른 버튼에서 시작된 동작이라 허용된다. 간격을 조금 두면 더 안전하다.
   */
  async function downloadSlides() {
    if (!card || slideUrls.length === 0 || downloading) return;

    setDownloading(true);
    try {
      const base = safeFileName(card.shortTitle || card.title);
      for (const [i, url] of slideUrls.entries()) {
        if (!url) continue; // 못 받은 장 (09-04) — 빈 파일을 만들지 않는다
        const a = document.createElement("a");
        a.href = url;
        a.download = `차곡_${base}_${String(i + 1).padStart(2, "0")}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // 연달아 부르면 브라우저가 뒤엣것을 흘린다 — 한 박자씩 띄운다
        await new Promise((r) => setTimeout(r, 250));
      }
      // AI 생성 사실은 「다운로드 단계에서 최소 1회」 알려야 한다 (lib/ai-disclosure.ts)
      showToast(
        `이미지 ${slideUrls.filter(Boolean).length}장을 저장했어요. ${AI_DISCLOSURE.downloadToast}`,
      );
    } finally {
      setDownloading(false);
    }
  }

  /**
   * 이 장만 다시 만든다 (09-02).
   *
   * 성공하면 그 장의 그림만 새로 받는다 — 나머지는 건드리지 않는다.
   * 실패해도 지금 장은 그대로 남는다(서버가 카드를 안 고친다). 다시 만들기를
   * 눌렀다가 있던 것마저 잃으면 안 된다.
   */
  /**
   * 이 장에 넣을 사진 올리기 (09-03) — 서명 URL 발급 → Storage 직접 PUT → 읽기 주소.
   * 전체 사진 목록엔 안 쌓인다(`forSlide`) — 이 장에만 쓰인다.
   */
  async function uploadSlidePhoto(file: File): Promise<string | null> {
    const user = userRef.current;
    if (!user) return null;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/cards/${cardId}/photos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type, forSlide: true }),
      });
      if (!res.ok) {
        showToast("사진을 올리지 못했어요.");
        return null;
      }
      const ticket = (await res.json()) as { uploadUrl: string; headers: Record<string, string>; readUrl: string };
      const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: ticket.headers, body: file });
      if (!put.ok) {
        showToast("사진을 올리지 못했어요.");
        return null;
      }
      return ticket.readUrl;
    } catch {
      showToast("사진을 올리지 못했어요.");
      return null;
    }
  }

  async function regenerateSlide(order: number, lines?: string[], request?: string, photoUrl?: string | null) {
    const user = userRef.current;
    if (!user || regenSlide !== null) return;
    setRegenSlide(order);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/cards/${cardId}/slides/${order}/regenerate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lines, request, photoUrl }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; candidateUrl?: string; lines?: string[]; photoUrl?: string | null; error?: string }
        | null;

      if (!res.ok || !data?.ok || !data.candidateUrl) {
        showToast(data?.error ?? "다시 만들지 못했어요.");
        return;
      }

      /*
        **카드를 바꾸지 않는다** (09-03). 새 그림은 미리보기로만 받는다.
        옛것과 나란히 놓고 사용자가 고른 뒤에야 확정한다.
      */
      setPreview({
        order,
        url: data.candidateUrl,
        lines: data.lines ?? lines ?? [],
        photoUrl: data.photoUrl ?? photoUrl ?? null,
      });
      setEditOrder(null);
    } catch {
      showToast("다시 만들지 못했어요.");
    } finally {
      setRegenSlide(null);
    }
  }

  /**
   * 미리보기 확정 (09-03) — 사용자가 옛것/새것을 고른다.
   * keep:"new"면 새 그림으로 바꾸고, "old"면 미리보기를 버린다.
   */
  async function applyPreview(keep: "new" | "old") {
    const user = userRef.current;
    if (!user || !preview || applying) return;
    const { order, lines, photoUrl } = preview;
    setApplying(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/cards/${cardId}/slides/${order}/regenerate/apply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ keep, lines, photoUrl }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; kept?: string; slide?: Slide; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        showToast(data?.error ?? "처리하지 못했어요.");
        return;
      }
      if (keep === "new" && data.slide) {
        setCard((prev) =>
          prev ? { ...prev, slides: prev.slides.map((s) => (s.order === order ? data.slide! : s)) } : prev,
        );
        // 그림도 새로 받는다 — 확정본 주소가 새 토큰이라 캐시를 안 탄다
        const url = await fetchSlideImage(order, token, true);
        setSlideUrls((prev) => {
          const next = [...prev];
          const stale = next[order];
          next[order] = url;
          if (stale) URL.revokeObjectURL(stale);
          return next;
        });
        showToast("새 그림으로 바꿨어요.");
      } else {
        showToast("원래 그림을 그대로 뒀어요.");
      }
    } catch {
      showToast("처리하지 못했어요.");
    } finally {
      setApplying(false);
      setPreview(null);
    }
  }

  /** 캡션을 인스타에 그대로 붙일 수 있는 모양으로 클립보드에 담는다 */
  async function copyCaption() {
    if (!captionDraft) return;
    const text = [
      captionDraft.hook,
      "",
      captionDraft.body,
      "",
      captionDraft.cta,
      "",
      captionDraft.hashtags.map((t) => `#${t}`).join(" "),
    ]
      .join("\n")
      .trim();

    try {
      await navigator.clipboard.writeText(text);
      showToast(`캡션을 복사했어요. ${AI_DISCLOSURE.captionToast}`);
    } catch {
      // 권한이 없거나 https가 아닌 환경 — 사용자가 직접 고르도록 알린다
      showToast("복사하지 못했어요. 캡션을 길게 눌러 복사해주세요.");
    }
  }

  /** 「1분 20초」처럼. 1분이 안 되면 초만 */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}초`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

/**
 * 제작 응답을 읽는다 — **스트림일 수도, 한 번에 올 수도 있다** (09-02).
 *
 * 시안 템플릿으로 만들 때는 3분이 걸려서 서버가 NDJSON으로 진행을 흘려보낸다.
 * 렌더러 경로는 빠르므로 지금까지처럼 JSON 한 덩이로 온다.
 * **응답의 content-type으로 갈라야 한다** — 화면이 어느 쪽인지 미리 알 수 없다.
 */
async function readRender(
  res: Response,
  onProgress: (next: { total: number; done: number; fallback: number }) => void,
): Promise<{ slides: unknown[]; mock?: boolean; generated?: number; fallback?: number }> {
  if (!res.headers.get("content-type")?.includes("x-ndjson")) {
    return res.json();
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("응답을 읽지 못했어요.");

  const decoder = new TextDecoder();
  let buffer = "";
  let total = 0;
  let done = 0;
  let fallback = 0;
  let result: { slides: unknown[]; mock?: boolean } | null = null;

  for (;;) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });

    // 한 줄이 여러 조각으로 나뉘어 올 수 있어 개행이 나올 때까지 모은다
    let cut: number;
    while ((cut = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      if (!line) continue;

      const event = JSON.parse(line) as Record<string, unknown>;
      if (event.type === "planned") {
        total = Number(event.total) || 0;
        onProgress({ total, done, fallback });
      } else if (event.type === "sheet") {
        done += 1;
        if (event.ok === false) fallback += 1;
        onProgress({ total, done, fallback });
      } else if (event.type === "error") {
        throw new Error(typeof event.error === "string" ? event.error : "생성에 실패했어요.");
      } else if (event.type === "done") {
        result = event as unknown as { slides: unknown[]; mock?: boolean };
      }
    }
  }

  if (!result) throw new Error("응답이 끝까지 오지 않았어요.");
  return result;
}

/** 슬라이드 1장 PNG 로드. fresh=true면 브라우저 캐시를 우회한다(문구 수정 직후) */
  const fetchSlideImage = useCallback(
    async (order: number, token: string, fresh = false): Promise<string> => {
      const res = await fetch(`/api/cards/${cardId}/slides/${order}/image`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: fresh ? "reload" : "default",
      });
      if (!res.ok) throw new Error(`슬라이드 ${order + 1}`);
      return URL.createObjectURL(await res.blob());
    },
    [cardId],
  );

  /**
   * 전체 슬라이드를 순서대로 받아 하나씩 공개.
   *
   * **다시 만든 뒤에는 반드시 `fresh`를 켠다.** 슬라이드 주소는 그대로인데
   * 이미지 라우트가 5분짜리 캐시(`private, max-age=300`)를 주기 때문에,
   * 그냥 부르면 브라우저가 방금 새로 만든 게 아니라 옛 PNG를 돌려준다 (08-31).
   */
  const fetchAllSlideImages = useCallback(
    async (slideCount: number, token: string, fresh = false) => {
      // 갈아끼우기 전에 지금 것을 해제한다 — 안 하면 다시 만들 때마다 blob이 쌓인다
      const stale = urlsRef.current;
      setSlideUrls([]);
      stale.forEach((u) => URL.revokeObjectURL(u));

      /*
        **한 장이 실패해도 나머지를 계속 받는다** (09-04).

        예전엔 `fetchSlideImage`가 던지는 예외를 여기서 안 잡아, 한 장이 502면
        루프가 통째로 끝났다. 뒤 장들은 멀쩡한데 요청조차 안 갔고, 화면은
        받아둔 것만 그리므로 **표지 한 장만** 남았다 — 실제로 겪은 사고다
        (원인은 `render-slide.ts`의 SVG 로더 재차단이었다).

        실패한 자리는 빈 문자열로 **자리를 지킨다.** 그래야 뒤 장들의 순서가
        앞당겨지지 않는다 — 3번이 2번 자리에 그려지면 더 나쁜 고장이다.
      */
      for (let order = 0; order < slideCount; order++) {
        let url = "";
        try {
          url = await fetchSlideImage(order, token, fresh);
        } catch {
          // 이 장만 못 받았다 — 화면이 「받지 못했어요」 자리를 그린다
        }
        setSlideUrls((prev) => [...prev, url]);
      }
    },
    [fetchSlideImage],
  );

  /**
   * 못 받은 장 하나만 다시 받는다 (09-04).
   * 카드를 통째로 다시 만들 일이 아니다 — 그림은 이미 있고 받아오기만 실패한 것이다.
   */
  const retrySlideImage = useCallback(
    async (order: number) => {
      const user = userRef.current;
      if (!user) return;
      try {
        const url = await fetchSlideImage(order, await user.getIdToken(), true);
        setSlideUrls((prev) => {
          const next = [...prev];
          next[order] = url;
          return next;
        });
      } catch {
        showToast("아직 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
      }
    },
    [fetchSlideImage, showToast],
  );

  /** 캡션 + 슬라이드 구성 생성 → 이미지 로드 */
  const generate = useCallback(async () => {
    const user = userRef.current;
    if (!user) return;
    setPhase("generating");
    setErrorMessage(null);
    setBuild({ total: 0, done: 0, fallback: 0 });
    setElapsed(0);

    try {
      const token = await user.getIdToken();
      const authHeader = { Authorization: `Bearer ${token}` };

      const [captionRes, renderRes] = await Promise.all([
        fetch(`/api/cards/${cardId}/caption`, { method: "POST", headers: authHeader }),
        fetch(`/api/cards/${cardId}/render`, { method: "POST", headers: authHeader }),
      ]);
      if (!captionRes.ok || !renderRes.ok) {
        const failed = !captionRes.ok ? captionRes : renderRes;
        const body = (await failed.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "생성에 실패했어요.");
      }

      const captionData = (await captionRes.json()) as { mock?: boolean };
      const renderData = await readRender(renderRes, setBuild);
      setIsMock(Boolean(captionData.mock || renderData.mock));

      const snap = await getDoc(doc(db, "cards", cardId));
      const fresh = snap.data() as Card | undefined;
      if (!fresh) throw new Error("카드를 찾을 수 없어요.");
      setCard(fresh);
      setCaptionDraft(fresh.caption);

      setPhase("ready");
      // 「다시 만들기」로 재진입할 수 있다 — 이때도 옛 PNG가 나오면 안 된다
      await fetchAllSlideImages(renderData.slides.length, token, true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "생성에 실패했어요.");
      setPhase("error");
    }
  }, [cardId, fetchAllSlideImages]);

  /** 진입: 로그인 확인 → 카드 로드 → 제작 여부 분기 */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      userRef.current = user;

      try {
        const snap = await getDoc(doc(db, "cards", cardId));
        const data = snap.data() as Card | undefined;
        if (!data || data.userId !== user.uid) {
          setPhase("not-found");
          return;
        }
        setCard(data);
        setCaptionDraft(data.caption);

        if (data.slides.length > 0 && data.caption) {
          setPhase("ready");
          await fetchAllSlideImages(data.slides.length, await user.getIdToken());
        } else {
          await generate();
        }
      } catch {
        setErrorMessage("카드를 불러오지 못했어요.");
        setPhase("error");
      }
    });
    return unsubscribe;
  }, [cardId, router, generate, fetchAllSlideImages]);

  /** PATCH /content 공통 저장 */
  const saveContent = useCallback(
    async (payload: Record<string, unknown>): Promise<Card | null> => {
      const user = userRef.current;
      if (!user) return null;
      setSaving(true);
      setSaveError(null);
      try {
        const res = await fetch(`/api/cards/${cardId}/content`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${await user.getIdToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "저장하지 못했어요.");
        }
        const data = (await res.json()) as Pick<Card, "caption" | "slides" | "themeId">;
        const next = card ? { ...card, ...data } : null;
        if (next) setCard(next);
        showToast("저장됐어요.");
        return next;
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "저장하지 못했어요.");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [card, cardId, showToast],
  );

  async function saveCaption() {
    if (!captionDraft) return;
    const next = await saveContent({ caption: captionDraft });
    if (next) setCaptionDraft(next.caption);
  }




  function addHashtag() {
    const tag = hashtagInput.trim().replace(/^#/, "");
    if (!tag || !captionDraft) return;
    if (!captionDraft.hashtags.includes(tag)) {
      setCaptionDraft({ ...captionDraft, hashtags: [...captionDraft.hashtags, tag] });
    }
    setHashtagInput("");
  }

  if (phase === "not-found") {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center gap-3 py-16">
        <h1 className="text-title font-bold">카드를 찾을 수 없어요</h1>
        <Link href="/" className="text-body text-berry-dark underline underline-offset-4">
          홈으로 돌아가기
        </Link>
      </div>
      </AppShell>
    );
  }

  const inputClass =
    "w-full rounded-md border border-line bg-surface px-3 py-2 text-body text-ink";

  /* 지금 고치고 있는 장 (09-04) — 편집이 모달로 나오면서 map 바깥에서도 필요해졌다 */
  const editSlide =
    editOrder !== null && card
      ? (card.slides.find((sl) => sl.order === editOrder) ?? null)
      : null;

  return (
    <AppShell width={960}>
      <PageHeader fallbackHref={`/card/${cardId}`} backLabel="돌아가기" />
      <div className="mt-3 flex flex-col gap-6">
      <header className="flex flex-col gap-1 pt-4">
        <h1 className="text-h3 font-bold text-ink">제작 결과</h1>
        {card && <p className="text-body text-sub">{card.title}</p>}
        {isMock && (
          <p className="mt-1 self-start rounded-pill bg-surface-muted px-3 py-1 text-caption text-sub">
            개발용 샘플 모드 — AI 연동 전이라 자리 표시 문구로 생성됐어요
          </p>
        )}
      </header>

      {/* 슬라이드 */}
      <section aria-label="카드뉴스 슬라이드" className="flex flex-col gap-3">
        {/*
          만드는 동안의 안내 (09-02).

          **가짜 진행률을 쓰지 않는다** (DESIGN.md §0) — 실제로 끝난 장 수와
          흘러간 시간만 말한다. 시안 템플릿으로 만들면 3분쯤 걸려서, 아무 말이
          없으면 사용자는 멈춘 줄 안다.
        */}
        {phase === "generating" && (
          <div className="flex flex-col gap-1">
            <p className="text-body text-purple">
              ✦{" "}
              {build.total === 0
                ? "차곡이 카드마다 들어갈 이야기를 정하고 있어요"
                : `${build.total}장 중 ${build.done}장 완성`}
            </p>
            <p className="text-caption text-sub">
              {build.total === 0 ? "곧 몇 장이 될지 정해져요." : "곧 완성돼요."}
              {elapsed > 0 && ` · ${formatElapsed(elapsed)} 지났어요`}
            </p>
          </div>
        )}

        {phase === "error" ? (
          <div className="flex flex-col items-start gap-3 rounded-lg bg-surface p-6 shadow-e1">
            <p className="text-body text-ink">{errorMessage}</p>
            <button
              type="button"
              onClick={generate}
              className="h-11 rounded-md border-2 border-berry bg-surface px-5 text-body font-semibold text-berry"
            >
              다시 만들기
            </button>
          </div>
        ) : (
          <>
            {/*
              **테마·배경색·구성 고르기를 뺐다** (09-02).

              카드뉴스를 시안 템플릿에서 만들게 되면서 색·글꼴·구성을 **템플릿이 정한다.**
              고를 수는 있는데 결과물엔 안 나타나는 항목은 없느니만 못하다 —
              설정의 「내 스타일」을 강조색 하나로 줄인 것과 같은 이유다.

              분위기는 **기획 단계에서** 고른다(`/plan/new` ③). 여기서 또 물으면
              같은 걸 두 군데서 고르게 된다.

              값 자체(`themeId`·`bgOverride`·`templateId`)는 지우지 않았다 —
              시안 생성이 실패해 렌더러로 물러선 장이 그 값으로 그려진다.
              @TODO: 폴백 장의 색을 어떻게 정할지 — 지금은 분위기가 정한 색을 따른다
            */}

            {/*
              선택 강조가 `outline-offset`으로 **요소 바깥에** 그려지는데
              이 줄은 `overflow-x-auto`라 그 바깥이 잘린다.

              `-m-1 p-1` — 안쪽에 4px을 벌어두고 같은 값만큼 바깥으로 당겨
                **자리는 그대로 두면서** 테두리가 들어갈 틈을 만든다.
              `scroll-p-1` — 이게 없으면 `snap-start`가 패딩을 무시하고 요소를
                스크롤 시작점에 딱 붙여, 방금 만든 왼쪽 틈이 화면 밖으로 밀려난다.
            */}
            <div className="-m-1 flex snap-x snap-mandatory scroll-p-1 gap-4 overflow-x-auto p-1 pb-3">
              {(phase === "ready" && card ? card.slides : []).map((slide, i) => {
                /*
                  **시안으로 만든 장은 편집기가 안 먹는다** (09-02).

                  편집기는 `texts`를 고쳐 우리 렌더러로 다시 그리는 구조인데, 이 장의
                  그림은 gpt-image-2가 구워 Storage에 둔 PNG라 그 경로를 안 거친다.
                  고친 글자가 저장은 되고 **어디에도 안 그려진다.** 클릭 영역(`/boxes`)도
                  우리 레이아웃을 재서 만들어 시안 그림과 자리가 맞지 않는다.

                  눌러도 아무 일이 안 일어나는 버튼을 두는 대신, **막고 이유를 적는다.**
                  대신 「이 장만 다시 만들기」를 열어둔다 (아래).
                */
                /*
                  **카드를 눌러도 편집기로 가지 않는다** (09-03).

                  편집기는 우리 렌더러로 `texts`를 다시 그리는 구조인데, 시안 그림은
                  gpt-image-2가 구워둔 PNG라 그 경로를 안 거친다 — 고쳐도 안 그려졌다.
                  대신 「이 장만 다시 만들기」로 **문구를 고치고 다시 굽는다**.
                */
                const canRemake = card?.styleId && slide.sheetIndex != null;
                return slideUrls[i] ? (
                  <div key={slide.order} className="flex shrink-0 snap-start flex-col gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- blob URL은 next/image 대상이 아니다 */}
                    <img
                      src={slideUrls[i]}
                      alt={`슬라이드 ${i + 1}`}
                      className="aspect-square w-72 rounded-lg bg-surface object-cover shadow-e1"
                    />

                    {/*
                      **버튼만 둔다** (09-04). 예전엔 이 자리에서 편집 패널이 펼쳐졌는데,
                      이 줄이 좌우 스크롤이라 폭이 카드 하나(288px)로 묶이고 옆 카드에
                      가렸다. 편집은 아래 모달에서 한다.
                    */}
                    {canRemake && (
                      <button
                        type="button"
                        onClick={() => setEditOrder(slide.order)}
                        disabled={regenSlide !== null}
                        className="flex h-9 w-72 items-center justify-center rounded-md bg-surface-muted px-3
                                   text-caption font-semibold text-sub transition-colors duration-200
                                   hover:bg-berry-light hover:text-berry-dark disabled:opacity-50"
                      >
                        이 장만 다시 만들기
                      </button>
                    )}
                  </div>
                ) : slideUrls.length > i ? (
                  /*
                    이 장만 못 받았다 (09-04). 예전엔 여기도 깜빡이는 자리였는데,
                    영영 오지 않을 그림을 기다리는 것처럼 보였다 — 무엇이 잘못됐고
                    무엇을 할 수 있는지 말해준다.
                  */
                  <div
                    key={slide.order}
                    className="flex aspect-square w-72 shrink-0 flex-col items-center justify-center
                               gap-2 rounded-lg border border-line bg-surface px-4 text-center"
                  >
                    <p className="text-caption text-ink">{i + 1}번째 장을 불러오지 못했어요.</p>
                    <button
                      type="button"
                      onClick={() => void retrySlideImage(i)}
                      className="flex h-9 items-center justify-center rounded-md border-2 border-berry
                                 bg-surface px-4 text-caption font-semibold text-berry
                                 transition-colors duration-200 hover:bg-berry-light hover:text-berry-dark"
                    >
                      다시 시도
                    </button>
                  </div>
                ) : (
                  <div
                    key={slide.order}
                    className="aspect-square w-72 shrink-0 animate-pulse rounded-lg bg-surface-muted"
                  />
                );
              })}
              {(phase === "loading" || phase === "generating") &&
                Array.from({ length: build.total || 3 }, (_, i) => (
                  <div
                    key={i}
                    className={[
                      "flex aspect-square w-72 shrink-0 items-center justify-center rounded-lg",
                      // 이미 끝난 장은 멈춰 세운다 — 다 깜빡이면 뭐가 되고 있는지 모른다
                      i < build.done ? "border border-line bg-surface" : "animate-pulse bg-surface-muted",
                    ].join(" ")}
                  >
                    {i < build.done && (
                      <span className="text-caption text-sub">{i + 1}장 완성</span>
                    )}
                  </div>
                ))}
            </div>
            {phase === "ready" && (
              <p className="text-caption text-sub">슬라이드를 누르면 편집 화면이 열려요.</p>
            )}
            {phase === "ready" && card && <StockAttribution slides={card.slides} />}

            {/* 인스타 연동이 없으므로 이미지를 손에 쥐여주는 게 이 화면의 마지막 할 일 */}
            {phase === "ready" && slideUrls.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={downloadSlides}
                  disabled={downloading}
                  className="h-11 rounded-md bg-berry px-5 text-body font-semibold text-white
                             hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
                >
                  {downloading ? "···" : `이미지 ${slideUrls.filter(Boolean).length}장 저장`}
                </button>
                <p className="text-caption text-sub">
                  저장한 이미지를 인스타그램에 직접 올려주세요.
                  <br />
                  {/*
                    법이 요구하는 고지다 — 지우지 말 것 (lib/ai-disclosure.ts).
                    이미지 안에는 표시를 넣지 않는 대신(파일 메타데이터로만 심는다),
                    내려받는 자리에서 반드시 말해줘야 그 방식이 인정된다.
                  */}
                  {AI_DISCLOSURE.download}
                </p>
              </div>
            )}
          </>
        )}

      </section>

      {/* 캡션 편집 */}
      {phase === "ready" && captionDraft && (
        <section aria-label="캡션" className="flex flex-col gap-4 rounded-lg bg-surface p-6 shadow-e1">
          {/*
            텍스트에는 메타데이터를 실을 수 없다 — 이미지처럼 파일 안에 숨겨둘 자리가
            없으므로 캡션은 화면에 대놓고 표시한다 (lib/ai-disclosure.ts).
          */}
          <p className="text-caption text-sub">{AI_DISCLOSURE.caption}</p>
          <label className="flex flex-col gap-1">
            <span className="text-label font-semibold text-sub">Hook</span>
            <textarea
              value={captionDraft.hook}
              rows={1}
              onChange={(e) => setCaptionDraft({ ...captionDraft, hook: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label font-semibold text-sub">본문</span>
            <textarea
              value={captionDraft.body}
              rows={4}
              onChange={(e) => setCaptionDraft({ ...captionDraft, body: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-label font-semibold text-sub">CTA</span>
            <textarea
              value={captionDraft.cta}
              rows={1}
              onChange={(e) => setCaptionDraft({ ...captionDraft, cta: e.target.value })}
              className={inputClass}
            />
          </label>

          {/* 해시태그 — 삭제형 칩 (DESIGN.md §6) */}
          <div className="flex flex-col gap-2">
            <span className="text-label font-semibold text-sub">해시태그</span>
            <div className="flex flex-wrap items-center gap-2">
              {captionDraft.hashtags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-pill border border-line bg-surface px-3 py-1 text-caption text-sub"
                >
                  #{tag}
                  <button
                    type="button"
                    aria-label={`${tag} 삭제`}
                    onClick={() =>
                      setCaptionDraft({
                        ...captionDraft,
                        hashtags: captionDraft.hashtags.filter((t) => t !== tag),
                      })
                    }
                    className="text-sub"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={hashtagInput}
                onChange={(e) => setHashtagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addHashtag();
                  }
                }}
                placeholder="추가하고 Enter"
                className="h-8 w-36 rounded-pill border border-line bg-surface px-3 text-caption text-ink"
              />
            </div>
          </div>

          {saveError && (
            <p role="alert" className="text-body text-ink">
              {saveError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={copyCaption}
              className="h-11 rounded-md border-2 border-berry bg-surface px-5 text-body font-semibold text-berry"
            >
              캡션 복사
            </button>
            <p className="text-caption text-sub">화면에 보이는 문구 그대로 복사돼요.</p>
          </div>

          {captionDirty && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={saveCaption}
                disabled={saving}
                className="h-11 rounded-md bg-berry px-5 text-body font-semibold text-white
                           hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
              >
                {saving ? "···" : "저장"}
              </button>
              <button
                type="button"
                onClick={() => card && setCaptionDraft(card.caption)}
                className="text-body text-sub"
              >
                되돌리기
              </button>
            </div>
          )}
        </section>
      )}

      {/* 제작 대기 — 달리는 캐릭터 오버레이 (09-03) */}
      {phase === "generating" && (
        <GeneratingOverlay total={build.total} done={build.done} elapsed={elapsed} />
      )}

      {/*
        이 장만 다시 만들기 (09-04) — 카드 아래 패널에서 모달로 옮겼다.
        `preview`(그림 고르기)와 이어지는 두 걸음이라 같은 자리에 둔다.
      */}
      {editSlide && (
        <SlideRemakePanel
          lines={editSlide.sheetLines ?? []}
          busy={regenSlide === editSlide.order}
          onUploadPhoto={uploadSlidePhoto}
          onApply={(lines, request, photoUrl) =>
            void regenerateSlide(editSlide.order, lines, request, photoUrl)
          }
          onClose={() => setEditOrder(null)}
        />
      )}

      {/*
        다시 만든 그림 고르기 (09-03) — 옛것·새것을 나란히 놓고 사용자가 정한다.
        우리가 «더 나아졌다»고 판단해 덮지 않는다.
      */}
      {preview && (
        <SlideComparePanel
          oldUrl={slideUrls[preview.order] ?? null}
          newUrl={preview.url}
          busy={applying}
          onKeep={(keep) => void applyPreview(keep)}
        />
      )}

      {/* 피드백 토스트 (DESIGN.md §13) */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-pill bg-ink px-5 py-2 text-body text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
      </AppShell>
  );
}
