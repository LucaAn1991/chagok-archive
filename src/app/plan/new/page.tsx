"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { ArrowUp, Check, ChevronLeft, ChevronRight, Pencil, Plus, X } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft";
import { addCustomAudience, loadCustomAudiences } from "@/lib/custom-audiences";
import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import AIChatBubble, { SystemEventLine } from "@/components/AIChatBubble";
import {
  TopicLine,
  type PlanPhotos,
  type PlanSummary,
  type PlanSummaryPatch,
} from "@/components/PlanningSummaryPanel";
import PlanPhotoPicker from "@/components/PlanPhotoPicker";
import PlanDraftList, { type RefineTurn } from "@/components/PlanDraftList";
import { TargetingChips, PromoFields } from "@/components/TargetingFields";
import PageHeader from "@/components/PageHeader";
import InlineAlert from "@/components/InlineAlert";
import {
  CARD_STYLES,
  DEFAULT_STYLE_ID,
  STYLE_ORDER,
  isReady,
} from "@/lib/render/card-styles";
import { PREVIEW_VERSION, TEMPLATE_SHEETS } from "@/lib/render/template-sheets";
import PlanTabs from "@/components/PlanTabs";
import type { DraftVariant, PlanDraft, Promo, StockPick, StyleId, Targeting } from "@/types";

/**
 * 새 기획 — AI 기획 대화 (F2 · IA 2.1). **09-02에 3단계에서 6단계로 늘렸다.**
 *   ① 주제 확인 — 주제가 전혀 없을 때만. 후보 4개 제시 · 열린 질문 금지
 *   ② 대상 선택 — 후보 멀티 선택 + 기타 입력. 안 고르면 AI가 알아서 정한다
 *   ③ 기획안 제시 — 대상마다 하나씩. **원래 confirm이 몰래 하던 일을 꺼냈다**
 *   ④ 기획안 고르기 — 여러 개 고를 수 있다. 고른 것만 카드가 된다
 *   ⑤ 다듬기 — 고른 것을 대화로 고친다 (내용·장수·제목·의도). **건너뛸 수 있다**
 *   ⑥⑦⑧ 분위기 → 사진 → [이대로 카드 만들기] → 배치 결과 확인
 *
 * ③을 넣은 이유 — 예전에는 사용자가 자기가 뭘 받게 될지 **보지 못한 채** 결과를 받았다.
 * 대상만 고르고 나면 곧바로 카드가 만들어져서, 마음에 안 들면 처음부터 다시였다.
 *
 * ?idea=  홈 「아이디어 말하기」에서 온 첫 문장 (①을 건너뛴다)
 * ?from=  지난 기획 상세 「이어서 기획하기」(F11) — 원 기획의 주제를 이어받는다
 *
 * 실패 처리(PRD §5-7): 자동 1회 재시도 → 말풍선 자리 인라인 + [다시 보내기].
 * 이전 대화는 실패해도 계속 읽을 수 있다.
 */

type Msg = { role: "user" | "assistant" | "system"; text: string };

type Proposal = { audiences: string[]; purposes: string[] };

/** 서버로 보낼 한 턴 — [다시 보내기]가 그대로 재사용한다 */
type TurnPayload =
  | { kind: "init"; idea: string; from: string | null; freeTopic?: boolean }
  | { kind: "resume"; id: string } // 이탈 후 복원 — 진행 단계만 다시 받는다
  | { kind: "text"; text: string }
  | { kind: "selection"; audiences: string[]; purposes: string[]; targeting?: Targeting; promo?: Promo }
  | { kind: "update"; patch: PlanSummaryPatch };

/**
 * 답이 만들어지는 동안 «지금까지 온 전체 문장»을 넘겨받는 콜백.
 *
 * 늘어난 조각(delta)이 아니라 **매번 전체**를 준다. 재시도로 두 번째 호출이
 * 시작되면 처음부터 다시 오므로, 화면은 받은 값으로 덮어쓰기만 하면
 * 앞 시도의 글자가 남는 문제가 생기지 않는다.
 */
type OnStreamText = (fullTextSoFar: string) => void;

async function postJson(
  path: string,
  body: unknown,
  onText?: OnStreamText,
  /** ④ 고른 기획안 저장은 PATCH다 — 그것 하나 때문에 헬퍼를 또 만들지 않는다 */
  method: "POST" | "PATCH" = "POST",
): Promise<Record<string, unknown>> {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(typeof data?.error === "string" ? data.error : "요청에 실패했어요.");
  }

  // 스트리밍이 아닌 응답(복원·부분 수정 등)은 지금까지처럼 통째로 받는다
  if (!res.headers.get("content-type")?.includes("x-ndjson")) {
    return res.json();
  }
  return readNdjson(res, onText);
}

/**
 * NDJSON 스트림을 읽어 마지막 `done` 줄을 돌려준다.
 *
 * 한 줄이 여러 조각으로 나뉘어 올 수 있으므로 개행이 나올 때까지 모았다 파싱한다.
 * 스트림은 이미 200으로 시작했기 때문에 실패는 `type:"error"` 줄로 온다.
 */
async function readNdjson(
  res: Response,
  onText?: OnStreamText,
): Promise<Record<string, unknown>> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("응답을 읽지 못했어요.");

  const decoder = new TextDecoder();
  let buffer = "";
  let streamed = "";
  let done: Record<string, unknown> | null = null;

  for (;;) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });

    let cut: number;
    while ((cut = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      if (!line) continue;

      const event = JSON.parse(line) as Record<string, unknown>;
      if (event.type === "delta" && typeof event.text === "string") {
        streamed += event.text;
        onText?.(streamed);
      } else if (event.type === "error") {
        throw new Error(typeof event.error === "string" ? event.error : "요청에 실패했어요.");
      } else if (event.type === "done") {
        done = event;
      }
    }
  }

  if (!done) throw new Error("응답이 끝까지 오지 않았어요.");
  return done;
}

/**
 * 고른 분위기를 기획에 저장한다 (09-02).
 *
 * 사진(`stockPhoto`)과 달리 **서버 라우트를 거친다.** 「준비 중」인 분위기는
 * 거절해야 하는데, 그 판정을 화면에만 두면 주소로 직접 찔러 넣을 수 있다.
 * 실패해도 화면은 막지 않는다 — 안 고른 것과 같아지고, 그때는 테마로 그려진다.
 */
async function saveStyle(planId: string, styleId: StyleId): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const token = await user.getIdToken();
    await fetch(`/api/plans/${planId}/style`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ styleId }),
    });
  } catch {
    /* 다시 고르면 또 시도한다 */
  }
}

/** 자동 1회 재시도 (PRD §5-7 ①) — 그다음부터는 사용자가 누른다 */
async function postWithRetry(path: string, body: unknown, onText?: OnStreamText) {
  try {
    return await postJson(path, body, onText);
  } catch {
    return await postJson(path, body, onText);
  }
}

export default function NewPlanPage() {
  return (
    <Suspense fallback={null}>
      <NewPlanScreen />
    </Suspense>
  );
}

function NewPlanScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idea = searchParams.get("idea") ?? "";
  const from = searchParams.get("from"); // 이어서 기획하기 (F11)

  const [planId, setPlanId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [topicSuggestions, setTopicSuggestions] = useState<string[] | null>(null); // ① 후보
  const [proposal, setProposal] = useState<Proposal | null>(null); // ② 후보
  const [summary, setSummary] = useState<PlanSummary>({
    topic: "",
    audiences: [],
    purposes: [],
    intent: "",
  });
  const [sending, setSending] = useState(false);
  // 만들어지는 중인 답 — 다 오면 null로 비우고 진짜 말풍선이 자리를 넘겨받는다
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [failed, setFailed] = useState<TurnPayload | null>(null);
  const [ready, setReady] = useState(false); // ③으로 넘어갈 수 있는 상태
  const [styleId, setStyleId] = useState<StyleId | null>(null); // ③ 분위기 (09-02)
  // 설정 분야를 풀고 시작했는가 (09-02) — 칩을 한 번만 보여주려고 기억한다
  const [freeTopic, setFreeTopic] = useState(false);
  const [isMock, setIsMock] = useState(false);

  // ② 대상 선택 — 초안 저장·복구를 위해 카드가 아니라 페이지가 들고 있는다 (08-28)
  const [picked, setPicked] = useState<string[]>([]);
  // 직접 입력으로 추가한 후보 — localStorage에 남겨 다음에도 칩으로 보인다 (08-28)
  const [extraOptions, setExtraOptions] = useState<string[]>(() => loadCustomAudiences());
  const [restored, setRestored] = useState(false); // 초안 자동 복구됨 — 상단 배너 표시
  const [confirming, setConfirming] = useState(false); // ③ 카드 생성 진행 중
  const [confirmedLock, setConfirmedLock] = useState(false); // 카드 생성 후 — 주제 읽기 전용
  const [confirmError, setConfirmError] = useState(false);

  /*
    ③④⑤ 기획안 (09-02).

    ②가 끝나면 대상마다 기획안을 만들어 보여주고, 고른 것만 카드가 된다.
    `draftsDone`이 true가 되어야 ⑥ 분위기·⑦ 사진·⑧ 확정으로 넘어간다 —
    껍데기를 먼저 고르게 하면 무엇을 담을지 모르는 채로 옷부터 고르는 셈이 된다.
  */
  const [drafts, setDrafts] = useState<PlanDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [draftsSaving, setDraftsSaving] = useState(false);
  const [draftsDone, setDraftsDone] = useState(false);
  /** 지금 다듬고 있는 기획안. null이면 목록 */
  const [refineIndex, setRefineIndex] = useState<number | null>(null);
  /** 기획안별 다듬기 대화 — 목록으로 나갔다 와도 남아 있게 번호로 들고 있는다 */
  const [refineTurns, setRefineTurns] = useState<Record<number, RefineTurn[]>>({});
  const [refining, setRefining] = useState(false);
  const [refineStream, setRefineStream] = useState<string | null>(null);
  /*
    ⑤ 다듬기 후보 — 기획안 번호별로 들고 있는다.
    **한 번 받으면 다시 받지 않는다.** 목록으로 나갔다 들어올 때마다 새로 뽑으면
    그때마다 몇 초가 들고, 아까 봤던 후보가 사라져서 «그거 뭐였지»가 된다.
  */
  const [variants, setVariants] = useState<Record<number, DraftVariant[]>>({});
  const [variantsLoading, setVariantsLoading] = useState<number | null>(null);

  /*
    사진 — 올린 사진은 기획에 저장되고, 카드 생성 때 주소를 물려준다 (08-31).
    추천(스톡) 칩은 기획안 박스의 3×2 그리드로 유지한다 — 09-01 병합 시 확정.
    실제 스톡 배정은 제작 단계에서 슬라이드 내용을 보고 다시 고른다 (`lib/ai/slides.ts`).
  */
  const [stockOptions, setStockOptions] = useState<StockPick[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  /*
    고른 추천 사진들 (09-02 — 한 장에서 여러 장으로).
    카드뉴스가 4~7장인데 사진이 하나뿐이면 같은 그림이 계속 나온다.
  */
  const [selectedStocks, setSelectedStocks] = useState<StockPick[]>([]);
  const [userPhotos, setUserPhotos] = useState<string[]>([]);

  // 입력창이 주인공 — 칩은 입력창을 채울 뿐, 전송은 사용자가 한다 (08-28)
  const [chatText, setChatText] = useState("");
  const [focusToken, setFocusToken] = useState(0); // 올리면 입력창에 포커스

  // 기획안 완성 후에는 입력창을 숨기고 [수정하기]를 눌렀을 때만 연다 —

  /*
   * [새 기획] 되돌리기 (08-31) — 되돌릴 수 없는 동작이라 확인 모달 대신 5초 복구를 준다.
   * 스냅샷은 메모리에만 — 5초가 지나거나 화면을 벗어나면 복구할 수 없다.
   */
  const [undoOpen, setUndoOpen] = useState(false);
  const undoSnapshot = useRef<{
    planId: string | null;
    messages: Msg[];
    summary: PlanSummary;
    picked: string[];
    proposal: Proposal | null;
    topicSuggestions: string[] | null;
    ready: boolean;
    chatText: string;
  } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const didInit = useRef(false); // StrictMode의 이중 실행으로 plan이 2개 생기는 것을 막는다
  const bottomRef = useRef<HTMLDivElement>(null);

  /**
   * 기획 단계 사진 업로드 (08-31).
   *
   * 카드가 생기기 전이라 기획에 붙여둔다 — 카드 생성 때 주소만 물려받는다.
   * 재료 추가 화면(`CardPhotoUploader`)과 같은 흐름이다:
   * 서버가 서명 URL을 주고, 파일은 브라우저 → Storage로 바로 간다.
   *
   * **먼저 미리보기를 띄우고 나중에 진짜 주소로 바꾼다.** 업로드가 끝날 때까지
   * 빈 자리를 보여주면 «올라간 건가?» 싶어진다. 실패하면 그 사진만 걷어낸다.
   */
  async function uploadPhotos(files: FileList) {
    const user = auth.currentUser;
    if (!user || !planId) return;

    for (const file of Array.from(files)) {
      const preview = URL.createObjectURL(file);
      setUserPhotos((prev) => [...prev, preview]);

      try {
        const token = await user.getIdToken();
        const ticketRes = await fetch(`/api/plans/${planId}/photos`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ contentType: file.type }),
        });
        if (!ticketRes.ok) throw new Error("업로드하지 못했어요.");

        const ticket = (await ticketRes.json()) as {
          uploadUrl: string;
          headers: Record<string, string>;
          readUrl: string;
        };

        const put = await fetch(ticket.uploadUrl, {
          method: "PUT",
          headers: ticket.headers,
          body: file,
        });
        if (!put.ok) throw new Error("업로드하지 못했어요.");

        // 미리보기를 진짜 주소로 갈아끼우고, 기획에도 남긴다
        setUserPhotos((prev) => {
          const next = prev.map((u) => (u === preview ? ticket.readUrl : u));
          void savePhotoUrls(next.filter((u) => !u.startsWith("blob:")));
          return next;
        });
        URL.revokeObjectURL(preview);
      } catch {
        // 실패한 사진만 걷어낸다 — 나머지는 그대로 (PLAN §3-1 F13)
        setUserPhotos((prev) => prev.filter((u) => u !== preview));
        URL.revokeObjectURL(preview);
      }
    }
  }

  function removePhoto(url: string) {
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    setUserPhotos((prev) => {
      const next = prev.filter((u) => u !== url);
      void savePhotoUrls(next.filter((u) => !u.startsWith("blob:")));
      return next;
    });
  }

  /** 올라간 사진 주소를 기획에 저장한다. 보안 규칙이 photoUrls 쓰기를 허용한다 */
  async function savePhotoUrls(urls: string[]) {
    if (!planId) return;
    try {
      await updateDoc(doc(db, "plans", planId), { photoUrls: urls });
    } catch {
      // 저장 실패는 조용히 넘긴다 — 사진은 «있으면 쓰는» 재료라 여기서 화면을 막지 않는다
    }
  }

  /**
   * 추천 사진을 고른다 (09-01) — 화면에 먼저 반영하고 기획에도 남긴다.
   *
   * 여기 저장한 한 장이 카드 첫 이미지 자리로 간다 (`lib/ai/slides.ts`).
   * 저장이 실패해도 화면은 막지 않는다 — 사진은 «있으면 쓰는» 재료다.
   */
  function pickStock(photo: StockPick) {
    setSelectedStocks((prev) => {
      const next = prev.some((p) => p.imageUrl === photo.imageUrl)
        ? prev.filter((p) => p.imageUrl !== photo.imageUrl)
        : [...prev, photo];
      if (planId) {
        void updateDoc(doc(db, "plans", planId), { stockPhotos: next }).catch(() => {});
      }
      return next;
    });
  }

  /**
   * 분위기를 고른다 (09-02) — 화면에 먼저 반영하고 기획에도 남긴다.
   *
   * 사진(`pickStock`)과 달리 **서버 라우트를 거친다.** 「준비 중」인 분위기는
   * 거절해야 하는데, 그 판정을 화면에만 두면 주소로 직접 찔러 넣을 수 있다.
   * 저장이 실패해도 화면은 막지 않는다 — 안 고른 것과 같아지고, 그때는
   * 테마로 그려져 카드가 나오기는 한다.
   */
  function pickStyle(next: StyleId) {
    setStyleId(next);
    if (planId) void saveStyle(planId, next);
  }

  /*
    **먼저 하나를 골라둔다** (DESIGN.md §1 «빈칸을 주지 않는다»).
    사용자는 고르는 게 아니라 «확인하고 바꾸는» 것이 이 제품의 방식이라,
    분위기 줄이 처음 뜰 때 추천 하나가 이미 선택돼 있어야 한다.

    사진이 있으면 사진을 살리는 쪽을 권한다 — 사진을 올려놓고 글자만 큰
    분위기가 잡히면 올린 보람이 없다.

    추천값을 **state에 넣지 않고 계산해서 쓴다.** 이펙트 안에서 setState를 부르면
    렌더가 한 번 더 도는데, 사진을 올리거나 지울 때마다 그게 반복된다.
  */
  const recommendedStyle: StyleId =
    userPhotos.length > 0 || selectedStocks.length > 0 ? "photo-frame" : DEFAULT_STYLE_ID;
  const effectiveStyle = styleId ?? recommendedStyle;

  /*
    추천값도 서버에 남긴다 — 사용자가 아무것도 안 눌러도 화면에 보이는 그 분위기로
    카드가 나와야 한다. 화면 상태는 건드리지 않고 저장만 한다.
  */
  const defaultStyleSaved = useRef(false);
  useEffect(() => {
    if (!ready || !planId || styleId !== null || confirmedLock) return;
    if (defaultStyleSaved.current) return;
    defaultStyleSaved.current = true;
    void saveStyle(planId, recommendedStyle);
  }, [ready, planId, styleId, confirmedLock, recommendedStyle]);

  /*
    추천 사진 불러오기 (09-01) — 주제가 정해진 뒤에 한 번만.

    ①보다 먼저 부르면 검색어가 될 주제가 아직 없다. 그래서 `ready`를 기다린다.
    첫 장을 미리 골라둔다 — 「사진을 골라주세요」가 아니라
    「이렇게 골랐어요, 바꾸고 싶으면 바꾸세요」다 (DESIGN §1).

    실패·빈손이면 조용히 빈 목록으로 둔다. 사진은 «있으면 쓰는» 재료라
    여기서 에러를 띄우면 기획이 멈춘 것처럼 보인다 (DESIGN §12).
  */
  const stockFetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !planId || stockFetchedFor.current === planId) return;
    stockFetchedFor.current = planId;

    let alive = true;
    setStockLoading(true);
    void (async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const res = await fetch(`/api/plans/${planId}/stock`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { photos?: StockPick[] };
        if (!alive) return;

        const photos = data.photos ?? [];
        setStockOptions(photos);
        /*
          첫 장을 미리 골라둔다 — 「빈칸을 주지 않는다」(DESIGN §1).
          사용자가 이미 고른 게 있으면 건드리지 않는다.

          **한 장만 미리 고른다.** 여러 장 고를 수 있게 됐다고 전부 켜두면
          «빼는 일»부터 시켜야 하고, 안 볼 사진까지 카드에 들어간다.
        */
        if (photos[0]) {
          setSelectedStocks((prev) => {
            if (prev.length > 0) return prev;
            const next = [photos[0]];
            void updateDoc(doc(db, "plans", planId), { stockPhotos: next }).catch(() => {});
            return next;
          });
        }
      } catch {
        // 후보를 못 받으면 「내 사진」만 보여준다 — 화면은 그대로 동작한다
      } finally {
        if (alive) setStockLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [ready, planId]);

  async function runTurn(payload: TurnPayload) {
    setSending(true);
    setFailed(null);
    setStreamingText(null);
    try {
      const data =
        payload.kind === "init"
          ? payload.from
            ? await postWithRetry(`/api/plans/${payload.from}/continue`, {})
            : await postWithRetry("/api/plans", {
                idea: payload.idea,
                // 설정 분야에 매이지 않고 시작 (09-02)
                ...(payload.freeTopic ? { freeTopic: true } : {}),
              })
          : payload.kind === "resume"
            ? await postWithRetry(`/api/plans/${payload.id}/messages`, { resume: true })
            : await postWithRetry(
              `/api/plans/${planId}/messages`,
              payload.kind === "text"
                ? { text: payload.text }
                : payload.kind === "selection"
                  ? { selection: { audiences: payload.audiences, purposes: payload.purposes, targeting: payload.targeting, promo: payload.promo } }
                  : { update: payload.patch },
              setStreamingText,
            );

      // 흘려보내던 글자를 지우고 완성된 말풍선에 자리를 넘긴다.
      // 둘 다 같은 문장이라 화면에서는 이어져 보인다
      setStreamingText(null);

      if (payload.kind === "init" && typeof data.planId === "string") setPlanId(data.planId);
      if (typeof data.reply === "string") {
        setMessages((prev) => [...prev, { role: "assistant", text: data.reply as string }]);
      }
      if (typeof data.systemEvent === "string") {
        // 상태 변경 기록 — 말풍선이 아닌 가운데 라인으로 쌓인다
        setMessages((prev) => [...prev, { role: "system", text: data.systemEvent as string }]);
      }
      if (data.summary && typeof data.summary === "object") {
        setSummary(data.summary as PlanSummary);
      }
      if (payload.kind !== "update") {
        setTopicSuggestions((data.topicSuggestions as string[] | null) ?? null);
        if (data.topicSuggestions && window.matchMedia("(min-width: 768px)").matches) {
          // ① 단계 — 입력창이 주인공이므로 커서를 먼저 준다 (모바일은 키보드가 화면을 덮어 제외)
          setFocusToken((k) => k + 1);
        }
        setProposal((data.proposal as Proposal | null) ?? null);
        if (payload.kind === "init" || payload.kind === "text") {
          // 새 후보 세트가 왔다 — 이전 «선택»만 비운다. 커스텀 후보는 세션을 넘어 유지 (08-28)
          setPicked([]);
        }
      }
      setReady(Boolean(data.readyToConfirm));
      setIsMock(Boolean(data.isMock));
    } catch {
      setStreamingText(null); // 실패했으면 만들다 만 글자를 남기지 않는다
      if (payload.kind === "resume") {
        // 초안이 더 이상 유효하지 않다(확정됨·삭제됨) — 조용히 비우고 새로 시작
        clearDraft();
        setRestored(false);
        setMessages([]);
        setSummary({ topic: "", audiences: [], purposes: [], intent: "" });
        setPicked([]);
        setPlanId(null);
        void runTurn({ kind: "init", idea: "", from: null });
        return;
      }
      setFailed(payload);
    } finally {
      setSending(false);
    }
  }

  // 진입 — 비로그인이면 로그인으로, 로그인이면 세션 생성 + 첫 턴
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      if (didInit.current) return;
      didInit.current = true;

      // 홈에서 아이디어를 들고 왔거나 「이어서 기획하기」로 온 경우 — 의도가 명확하니 바로 새 세션
      if (idea || from) {
        if (idea && !from) setMessages([{ role: "user", text: idea }]);
        void runTurn({ kind: "init", idea, from });
        return;
      }

      // 하다 만 대화가 있으면 **묻지 않고 그대로 복구**한다 (08-28 — 팝업 금지).
      // localStorage는 클라이언트 전용 — 이 콜백은 브라우저에서만 돈다
      const draft = loadDraft();
      if (draft) {
        setPlanId(draft.planId);
        setMessages(draft.messages as Msg[]);
        setSummary((prev) => ({ ...prev, topic: draft.topic }));
        setPicked(draft.audiences ?? []);
        setRestored(true); // 상단 얇은 배너 한 줄
        void runTurn({ kind: "resume", id: draft.planId }); // 진행 단계(후보 등)만 서버에서 재계산
        return;
      }

      void runTurn({ kind: "init", idea: "", from: null });
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 새 말풍선·대기 표시가 생기면 아래로 따라간다
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending, failed, proposal, topicSuggestions]);

  function sendText(text: string) {
    dismissBanner();
    setMessages((prev) => [...prev, { role: "user", text }]);
    void runTurn({ kind: "text", text });
  }

  /** 화면 상태를 첫 화면으로 되돌린다 — 서버의 확정 세션·카드는 건드리지 않는다 */
  function resetToFirstScreen() {
    clearDraft();
    setRestored(false);
    setMessages([]);
    setSummary({ topic: "", audiences: [], purposes: [], intent: "" });
    setPicked([]);
    setProposal(null);
    setTopicSuggestions(null);
    setReady(false);
    setPlanId(null);
    setChatText("");
    void runTurn({ kind: "init", idea: "", from: null });
  }

  /**
   * [새 기획] (08-31 확정) — 말풍선을 비우고 첫 화면으로.
   * 카드를 만든 대화는 이미 확정 세션으로 저장돼 「지난 기획」에 남아 있고,
   * 카드 없이 쏟아낸 메모는 버려진다(5초 되돌리기만 제공). 확인 모달은 띄우지 않는다.
   */
  function startNewPlan() {
    undoSnapshot.current = {
      planId,
      messages,
      summary,
      picked,
      proposal,
      topicSuggestions,
      ready,
      chatText,
    };
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoOpen(true);
    undoTimer.current = setTimeout(() => {
      setUndoOpen(false);
      undoSnapshot.current = null; // 5초가 지나면 복구 불가
    }, 5000);
    resetToFirstScreen();
  }

  /** 토스트의 [되돌리기] — 직전 말풍선을 그대로 복구한다 */
  function undoNewPlan() {
    const snap = undoSnapshot.current;
    if (!snap) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoOpen(false);
    undoSnapshot.current = null;
    setPlanId(snap.planId);
    setMessages(snap.messages);
    setSummary(snap.summary);
    setPicked(snap.picked);
    setProposal(snap.proposal);
    setTopicSuggestions(snap.topicSuggestions);
    setReady(snap.ready);
    setChatText(snap.chatText);
    // 자동 저장 효과가 복구된 상태를 다시 localStorage에 남긴다
  }

  /** 사용자가 무언가 하면 복구 배너는 역할이 끝난다 */
  function dismissBanner() {
    setRestored(false);
  }

  // 초안 자동 저장 — 상태가 바뀔 때마다, 500ms 디바운스 (매 키 입력마다 쓰지 않는다)
  useEffect(() => {
    if (!planId || confirmedLock) return;
    const meaningful = summary.topic !== "" || messages.some((m) => m.role === "user");
    if (!meaningful) return;
    const timer = setTimeout(() => {
      saveDraft({
        planId,
        topic: summary.topic,
        audiences: picked,
        messages,
        step: ready ? "ready" : proposal ? "proposal" : "topic",
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [planId, summary.topic, picked, messages, ready, proposal, confirmedLock]);

  /**
   * ② 대상 선택 제출 — 빈 선택이면 AI가 알아서 정한다. 목적은 대상에 딸려온다 (08-28).
   * 세부 대상·홍보 대상(09-03)도 여기서 함께 실어 보낸다 — 기획안 생성이 이 값을 읽는다.
   */
  function sendSelection(audiences: string[], targeting?: Targeting, promo?: Promo) {
    dismissBanner();
    const label = audiences.length > 0 ? audiences.join(" · ") : "차곡이 알아서 정해주세요.";
    setMessages((prev) => [...prev, { role: "user", text: label }]);
    setProposal(null);
    void runTurn({ kind: "selection", audiences, purposes: [], targeting, promo });
  }

  /*
    ②가 끝나면 곧바로 기획안을 만든다 (09-02).

    사용자가 버튼을 한 번 더 누르게 하지 않는다 — 대상을 고른 순간 이미
    «만들어달라»고 말한 것이고, 여기서 또 물으면 같은 대답을 두 번 시키는 셈이다.
  */
  useEffect(() => {
    if (!ready || !planId || confirmedLock) return;
    if (drafts.length > 0 || draftsLoading || draftsError) return;
    void loadDrafts();
    // loadDrafts는 planId만 보고 도는 함수라 의존성에 넣지 않는다 (매 렌더 새로 만들어진다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, planId, confirmedLock, drafts.length, draftsLoading, draftsError]);

  /**
   * ③ 기획안 만들기 — ②가 끝나면 한 번 부른다.
   *
   * 서버가 멱등이라 두 번 들어와도 이미 만든 것을 그대로 돌려준다.
   * 고르고 다듬은 것이 새로고침으로 날아가지 않는다.
   */
  async function loadDrafts() {
    if (!planId) return;
    setDraftsLoading(true);
    setDraftsError(null);
    try {
      const data = await postJson(`/api/plans/${planId}/drafts`, {});
      setDrafts((data.drafts as PlanDraft[]) ?? []);
    } catch (e) {
      setDraftsError(
        e instanceof Error ? e.message : "기획안을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      setDraftsLoading(false);
    }
  }

  /** ④ 넣고 빼기 — 저장은 「이 N개로 갈게요」에서 한 번만 한다 */
  function toggleDraft(index: number) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, chosen: !d.chosen } : d)));
  }

  /** ④ 확정 — 고른 것을 저장하고 ⑥으로 넘어간다 */
  async function saveChosen() {
    if (!planId || draftsSaving) return;
    const chosen = drafts.flatMap((d, i) => (d.chosen ? [i] : []));
    if (chosen.length === 0) return;
    setDraftsSaving(true);
    try {
      const data = await postJson(`/api/plans/${planId}/drafts`, { chosen }, undefined, "PATCH");
      setDrafts((data.drafts as PlanDraft[]) ?? drafts);
      setDraftsDone(true);
    } catch (e) {
      setDraftsError(e instanceof Error ? e.message : "고른 내용을 저장하지 못했어요.");
    } finally {
      setDraftsSaving(false);
    }
  }

  /**
   * ⑤ 다듬기 화면을 열 때 후보를 받는다.
   *
   * **연 것만 받는다.** 기획안 셋을 만들었다고 셋 다 미리 뽑아두면, 열어보지도 않을
   * 것에 시간과 비용이 든다.
   */
  async function openRefine(index: number) {
    setRefineIndex(index);
    if (variants[index] || !planId) return;

    setVariantsLoading(index);
    try {
      const data = await postJson(`/api/plans/${planId}/drafts/${index}/variants`, {});
      setVariants((prev) => ({ ...prev, [index]: (data.variants as DraftVariant[]) ?? [] }));
    } catch {
      /*
        후보를 못 받아도 **다듬기는 된다.** 빈 배열을 넣어두면 화면이 자유 입력만
        남기고 계속 간다 — 거들어주는 것이지 관문이 아니다.
      */
      setVariants((prev) => ({ ...prev, [index]: [] }));
    } finally {
      setVariantsLoading(null);
    }
  }

  /**
   * ⑤ 눌러서 고치기 — 후보나 장수를 그대로 넣는다. **AI를 부르지 않는다.**
   *
   * 대화로 고치는 것과 저장 경로가 같다(`refine`의 `apply`) — 갈라두면 언젠가
   * 둘이 어긋난다.
   */
  async function applyToDraft(patch: Record<string, unknown>) {
    if (!planId || refineIndex === null || refining) return;
    const index = refineIndex;

    setRefining(true);
    try {
      const data = await postJson(`/api/plans/${planId}/drafts/${index}/refine`, {
        apply: patch,
      });
      const next = data.draft as PlanDraft | undefined;
      if (next) setDrafts((prev) => prev.map((d, i) => (i === index ? next : d)));
      setRefineTurns((prev) => ({
        ...prev,
        [index]: [
          ...(prev[index] ?? []),
          { role: "user", text: (data.said as string) ?? "" },
          { role: "assistant", text: (data.reply as string) ?? "" },
        ],
      }));
    } catch (e) {
      setRefineTurns((prev) => ({
        ...prev,
        [index]: [
          ...(prev[index] ?? []),
          {
            role: "assistant",
            text: e instanceof Error ? e.message : "바꾸지 못했어요. 다시 눌러주세요.",
          },
        ],
      }));
    } finally {
      setRefining(false);
    }
  }

  /**
   * ⑤ 다듬기 한 턴.
   *
   * 실패해도 **기획안을 건드리지 않는다** — 지금 있는 값이 그대로 남는다.
   * 사용자 말풍선은 남겨두고 답만 실패 안내로 바꾼다. 무엇을 물었는지가 사라지면
   * 다시 쓰라는 뜻이 되어버린다.
   */
  async function sendRefine(text: string) {
    if (!planId || refineIndex === null || refining) return;
    const index = refineIndex;

    setRefining(true);
    setRefineStream(null);
    setRefineTurns((prev) => ({
      ...prev,
      [index]: [...(prev[index] ?? []), { role: "user", text }],
    }));

    try {
      const data = await postJson(
        `/api/plans/${planId}/drafts/${index}/refine`,
        { message: text },
        (full) => setRefineStream(full),
      );
      const reply = typeof data.reply === "string" ? data.reply : "";
      const next = data.draft as PlanDraft | undefined;
      if (next) setDrafts((prev) => prev.map((d, i) => (i === index ? next : d)));
      setRefineTurns((prev) => ({
        ...prev,
        [index]: [...(prev[index] ?? []), { role: "assistant", text: reply }],
      }));
    } catch (e) {
      setRefineTurns((prev) => ({
        ...prev,
        [index]: [
          ...(prev[index] ?? []),
          {
            role: "assistant",
            text: e instanceof Error ? e.message : "고치지 못했어요. 다시 말씀해주세요.",
          },
        ],
      }));
    } finally {
      setRefining(false);
      setRefineStream(null);
    }
  }

  /**
   * ③ 카드 생성 (F3) → 날짜 배치 (F4) → 배치 결과 화면.
   * confirm은 멱등이라 배치 단계에서 실패해도 [다시 시도]가 안전하다.
   */
  async function confirmPlan() {
    if (!planId || confirming) return;
    setConfirming(true);
    setConfirmError(false);
    try {
      const res = await postWithRetry(`/api/plans/${planId}/confirm`, {});
      setConfirmedLock(true); // 카드가 만들어졌다 — 이후 주제 수정은 「이어서 기획하기」로
      clearDraft(); // 초안의 역할 종료 — 다음 진입은 빈 상태여야 한다
      await postWithRetry(`/api/plans/${planId}/schedule`, {});
      // 상한을 넘겨 8장까지만 만든 경우 — 결과 화면이 한 줄 안내를 띄운다
      router.push(`/plan/${planId}/result${res.capped ? "?capped=1" : ""}`);
    } catch {
      setConfirmError(true);
      setConfirming(false);
    }
  }

  /** 기획안 카드에서의 부분 수정 — 화면은 즉시 반영, 저장은 서버가 한다 */
  function saveSummaryPatch(patch: PlanSummaryPatch) {
    setSummary((prev) => ({ ...prev, ...patch }));
    void runTurn({ kind: "update", patch });
  }

  const summaryStarted = summary.topic !== "";
  const summaryProps = {
    summary,
    onSave: saveSummaryPatch,
    topicLocked: confirmedLock,
    continueHref: planId ? `/plan/new?from=${planId}` : undefined,
    showPhotos: ready, // 기획이 정리된 뒤에 사진을 고른다 — 순서를 앞지르지 않는다
    photos: {
      stockOptions,
      stockLoading,
      selectedStockUrls: selectedStocks.map((p) => p.imageUrl),
      userPhotos,
      onSelectStock: pickStock,
      onAddUserPhotos: uploadPhotos,
      onRemoveUserPhoto: removePhoto,
    },
  };

  return (
    <div className="flex flex-1">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col lg:h-dvh lg:overflow-hidden">
        {/* 간격은 --plan-gap 하나로 관리 (08-31) — 바깥 좌우 여백 = 열 사이 간격 */}
        <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-[var(--plan-gap)] pb-36 pt-3 [--plan-gap:1rem] md:[--plan-gap:1.5rem] lg:max-w-[1080px] lg:min-h-0 lg:pb-[var(--plan-gap)] lg:pt-4">
          {/* 헤더·탭 — 그대로 (지시 §0) */}
          {/* 헤더 — [←] 와 제목만. 칩은 탭 줄로 옮겼다 (08-31 확정) */}
          <header>
            {/* GNB로 오가는 최상위 화면이라 뒤로가기가 없다 (09-02) */}
            <PageHeader title="AI 기획" isRoot />
            <PlanTabs
              action={
                <button
                  type="button"
                  onClick={startNewPlan}
                  disabled={
                    !(summary.topic !== "" || messages.some((m) => m.role === "user")) ||
                    sending ||
                    confirming
                  }
                  /* 중성 회색 알약 칩 (08-31 확정 지시). 값은 지시서 고정 색 —
                     DESIGN §2 팔레트 밖(토큰 승격은 DESIGN 반영과 함께, 보고됨).
                     대비 #444 on #EDEDED ≈ 8.2:1 (AA 통과) */
                  className="flex h-[30px] items-center whitespace-nowrap rounded-pill border border-[#DCDCDC] bg-[#EDEDED] px-3 text-[13px] font-medium text-[#444444] transition-colors duration-200 hover:bg-[#E4E4E4] active:bg-[#E4E4E4] disabled:opacity-50"
                >
                  다시 시작
                </button>
              }
            />
            {isMock && (
              <p className="mt-2 text-caption text-sub">
                모의 AI로 동작 중이에요 — API 키 연결 전 개발용 응답입니다.
              </p>
            )}
          </header>

          {/* 2열 (08-31 최종) — 좌 대화 5 : 우 기획안 박스 7, 간격 24px.
              1024px 미만은 1열 세로 누적(대화 → 기획안 박스) */}
          {/* 좌: 남는 폭 전부(flex:1 1 auto, min-w 0) · 우: 고정 420px (08-31 확정 — 비율 지정 폐기) */}
          <div className="mt-3 flex flex-1 flex-col gap-[var(--plan-gap)] lg:min-h-0 lg:flex-row">
            {/* 좌 — 대화만 (말풍선 + 추천 칩). 사진·버튼은 오른쪽 박스로 옮겼다 (§3) */}
            <section className="flex min-w-0 flex-1 flex-col lg:min-h-0">
              {/*
                대화가 시작되기 전에는 인사말·칩을 **세로 가운데**에 둔다 (09-02).

                말풍선 하나가 맨 위에 붙고 입력창은 화면 맨 아래에 고정돼 있어서,
                그 사이 600px가 통째로 비어 보였다. 대화가 시작되면(사용자 말풍선이
                하나라도 생기면) 위에서부터 쌓이는 원래 흐름으로 돌아간다 —
                말이 오가는 중에 가운데 정렬을 유지하면 글이 늘 때마다 위아래로 출렁인다.
              */}
              <div
                className={[
                  /*
                    `overflow-x-hidden`을 못박는다 (09-02). `overflow-y: auto`만 주면
                    CSS가 가로도 auto로 계산해서, 안쪽 템플릿 줄을 가로로 밀 때
                    **대화 칸 전체가 같이 옆으로 움직였다.**
                  */
                  "flex flex-col gap-4 overflow-x-hidden [scrollbar-gutter:stable] lg:min-h-0 lg:flex-1 lg:overflow-y-auto",
                  messages.some((m) => m.role === "user") ? "" : "lg:justify-center",
                ].join(" ")}
              >
                {restored && <RestoreBanner onNew={startNewPlan} />}

                {messages.map((m, i) => (
                  <div key={i} className="flex flex-col gap-4">
                    {m.role === "system" ? (
                      <SystemEventLine text={m.text} />
                    ) : (
                      <AIChatBubble
                        role={m.role}
                        text={m.text}
                        showAvatar={
                          m.role === "assistant" && messages[i - 1]?.role !== "assistant"
                        }
                      />
                    )}
                    {/* ① 주제 후보 — 대상 질문과 같은 흐름 (08-31 확정):
                        고르면 목록 전체가 사라지고, 값은 사용자 말풍선으로만 남는다 */}
                    {i === 0 && topicSuggestions && !sending && !failed && (
                      <TopicSuggestionPicker
                        suggestions={topicSuggestions}
                        onPick={(t) => {
                          dismissBanner();
                          setTopicSuggestions(null);
                          sendText(t);
                        }}
                        freeTopicUsed={freeTopic}
                        onFreeTopic={() => {
                          dismissBanner();
                          setFreeTopic(true);
                          setTopicSuggestions(null);
                          setMessages([]);
                          setPlanId(null);
                          void runTurn({ kind: "init", idea: "", from: null, freeTopic: true });
                        }}
                      />
                    )}
                  </div>
                ))}

                {/* ② 대상 후보 — sending 중에도 유지 (선택이 사라지면 안 된다) */}
                {proposal && !failed && (
                  <ProposalPicker
                    base={proposal.audiences}
                    extras={extraOptions.filter((o) => !proposal.audiences.includes(o))}
                    picked={picked}
                    topic={summary.topic}
                    onSaveTopic={(next) => {
                      dismissBanner();
                      saveSummaryPatch({ topic: next });
                    }}
                    onToggle={(a) => {
                      dismissBanner();
                      setPicked((prev) =>
                        prev.includes(a) ? prev.filter((v) => v !== a) : [...prev, a],
                      );
                    }}
                    onAddOption={(a) => {
                      dismissBanner();
                      setExtraOptions(addCustomAudience(a));
                      setPicked((prev) => (prev.includes(a) ? prev : [...prev, a]));
                    }}
                    onSubmit={(t, p) => sendSelection(picked, t, p)}
                  />
                )}

                {/*
                  ③④⑤ 기획안 — 만들고 · 고르고 · 다듬는다 (09-02).
                  여기를 지나야 분위기·사진으로 넘어간다.
                */}
                {ready && !confirmedLock && !draftsDone && (
                  <PlanDraftList
                    drafts={drafts}
                    loading={draftsLoading}
                    error={draftsError}
                    refining={refining}
                    refineIndex={refineIndex}
                    refineTurns={refineIndex === null ? [] : (refineTurns[refineIndex] ?? [])}
                    streamingText={refineStream}
                    onRetryLoad={() => void loadDrafts()}
                    onToggle={toggleDraft}
                    onOpenRefine={(i) => void openRefine(i)}
                    onCloseRefine={() => setRefineIndex(null)}
                    onSendRefine={(t) => void sendRefine(t)}
                    onNext={() => void saveChosen()}
                    saving={draftsSaving}
                    variants={refineIndex === null ? [] : (variants[refineIndex] ?? [])}
                    variantsLoading={refineIndex !== null && variantsLoading === refineIndex}
                    onApplyVariant={(v) =>
                      void applyToDraft({
                        angle: v.angle,
                        title: v.title,
                        shortTitle: v.shortTitle,
                        intent: v.intent,
                      })
                    }
                    onApplySlideCount={(n) => void applyToDraft({ slideCount: n })}
                  />
                )}

                {/*
                  ⑥ 분위기 고르기 (09-02) — **기획안이 정해진 뒤에** 나온다.
                  무엇을 담을지 모르는 채로 껍데기부터 고르면 순서가 뒤집힌다.
                */}
                {ready && !confirmedLock && draftsDone && (
                  <>
                    {/*
                      돌아갈 길을 남긴다 — 분위기를 고르다가 «아까 그 기획안 뭐였지»가
                      생기는데, 길이 없으면 처음부터 다시 하게 된다.
                    */}
                    <div className="flex items-center justify-between gap-3 rounded-md bg-surface-muted px-3 py-2">
                      <p className="min-w-0 truncate text-caption text-sub">
                        기획안 {drafts.filter((d) => d.chosen).length}개 ·{" "}
                        {drafts
                          .filter((d) => d.chosen)
                          .map((d) => d.audience)
                          .join(" · ")}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setDraftsDone(false);
                          setRefineIndex(null);
                        }}
                        className="shrink-0 text-caption font-semibold text-berry-dark underline underline-offset-2"
                      >
                        다시 고르기
                      </button>
                    </div>
                    <StylePicker selected={effectiveStyle} onPick={pickStyle} />
                  </>
                )}

                {/* 만들어지는 중인 답 — 다 오면 위 목록의 진짜 말풍선이 자리를 넘겨받는다 */}
                {streamingText !== null && (
                  <AIChatBubble
                    role="assistant"
                    text={streamingText}
                    showAvatar={messages[messages.length - 1]?.role !== "assistant"}
                  />
                )}

                {sending && <WaitingIndicator />}

                {failed && (
                  <div className="flex flex-col items-start gap-2">
                    <p className="text-body text-ink">응답을 만들지 못했어요.</p>
                    <button
                      type="button"
                      onClick={() => void runTurn(failed)}
                      className="flex h-11 items-center justify-center rounded-md border-2 border-berry bg-surface px-5 text-body font-semibold text-berry transition-colors duration-200 hover:bg-berry-tint"
                    >
                      다시 보내기
                    </button>
                  </div>
                )}

                <div ref={bottomRef} className="scroll-mb-40 md:scroll-mb-32 lg:scroll-mb-2" />
              </div>

              {/* 좌측 하단 — 대화 입력. ready 후 수정은 박스 연필 하나로만 (08-31) */}
              {!ready && (
                <ChatInputBar
                  disabled={sending || !planId}
                  value={chatText}
                  onChange={setChatText}
                  focusToken={focusToken}
                  onSend={sendText}
                />
              )}
            </section>

            {/* 우 — 기획안 박스: 주제·대상 + 사진 그리드 + 버튼 전부 (§2).
                sticky·자체 스크롤 — 왼쪽 스크롤에 따라 움직이지 않는다 */}
            {/* ⑦⑧ 사진·확정 — 기획안이 정해진 뒤에 (09-02). 그 전에는 왼쪽에 집중한다 */}
            {ready && draftsDone && (
              <aside className="min-h-0 lg:h-full lg:w-[420px] lg:flex-none">
                <div className="lg:sticky lg:top-0 lg:h-full">
                  <PlanBox
                    summary={summary}
                    photos={summaryProps.photos}
                    onSave={saveSummaryPatch}
                    onConfirm={() => void confirmPlan()}
                    confirming={confirming}
                    confirmError={confirmError}
                    saving={sending}
                    chosenDrafts={drafts.filter((d) => d.chosen)}
                    onEditDrafts={() => {
                      setDraftsDone(false);
                      setRefineIndex(null);
                    }}
                  />
                </div>
              </aside>
            )}
          </div>
        </main>
      </div>

      {undoOpen && (
        /* 5초 되돌리기 토스트 — 확인 모달 대신 (DESIGN §13 Toast) */
        <div
          role="status"
          className="fixed inset-x-0 bottom-32 z-30 flex justify-center px-4 md:bottom-24"
        >
          <div className="flex items-center gap-3 rounded-md bg-ink px-4 py-3 text-body text-white shadow-lg">
            다시 시작했어요
            <button
              type="button"
              onClick={undoNewPlan}
              className="shrink-0 font-semibold underline underline-offset-2"
            >
              되돌리기
            </button>
          </div>
        </div>
      )}

      <MobileBottomNav />
    </div>
  );
}

/* ============================================================
   기획안 박스 (08-31 최종·2열) — 주제·대상 + 사진 그리드 + 버튼을 전부 담는다.
   라벨 없이 값만, 기획의도(intent)는 internal — 표시하지 않는다.
   연필은 박스 오른쪽 위 하나 — 주제·대상을 함께 편집한다.
   ============================================================ */

function PlanBox({
  summary,
  photos,
  onSave,
  onConfirm,
  confirming,
  confirmError,
  saving,
  chosenDrafts,
  onEditDrafts,
}: {
  summary: PlanSummary;
  photos: PlanPhotos;
  onSave: (patch: PlanSummaryPatch) => void;
  /**
   * ④에서 고른 기획안 (09-02).
   *
   * **여기에 ②의 대상을 그대로 보여주면 안 된다.** 대상을 넷 고르고 기획안은 둘만
   * 골랐는데 박스가 넷을 적고 있어서, 만들어질 카드와 화면이 어긋났다.
   * (실제로 「선택하지 않은 기획안이 나온다」는 말이 나온 자리다 — 카드는 맞게
   * 나오는데 박스가 틀렸다.)
   */
  chosenDrafts: PlanDraft[];
  /** 기획안을 고치러 ④로 돌아간다 */
  onEditDrafts: () => void;
  onConfirm: () => void;
  confirming: boolean;
  confirmError: boolean;
  /** 방금 고친 값이 서버로 가는 중 (09-02). 이때 카드를 만들면 옛 값으로 만들어진다 */
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [topicDraft, setTopicDraft] = useState("");
  const [audDraft, setAudDraft] = useState("");
  const hasDrafts = chosenDrafts.length > 0;

  function startEdit() {
    setTopicDraft(summary.topic);
    setAudDraft(summary.audiences.join(", "));
    setEditing(true);
  }
  function saveEdit() {
    setEditing(false);
    const patch: PlanSummaryPatch = {};
    const t = topicDraft.trim();
    const list = audDraft
      .split(/[,·]/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (t && t !== summary.topic) patch.topic = t;
    if (list.length > 0 && list.join("|") !== summary.audiences.join("|")) patch.audiences = list;
    if (Object.keys(patch).length > 0) onSave(patch);
  }

  return (
    <div className="flex max-h-full flex-col overflow-y-auto rounded-lg border border-line bg-surface p-5 lg:h-full">
      <div className="flex items-start justify-between gap-2">
        {editing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input
              autoFocus
              value={topicDraft}
              onChange={(e) => setTopicDraft(e.target.value)}
              aria-label="주제 입력"
              className="h-10 w-full rounded-md border border-line bg-surface px-3 text-body font-semibold text-ink"
            />
            <input
              value={audDraft}
              onChange={(e) => setAudDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  saveEdit();
                }
                if (e.key === "Escape") setEditing(false);
              }}
              aria-label="대상 입력"
              className="h-10 w-full rounded-md border border-line bg-surface px-3 text-caption text-ink"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={saveEdit}
                aria-label="기획안 확정"
                className="flex h-10 w-10 items-center justify-center rounded-md bg-berry text-white"
              >
                <Check size={16} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-1 text-body text-sub hover:text-ink"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            {/* 라벨 없이 값만 — 읽으면 무엇인지 안다 (08-31 §2) */}
            <p className="truncate text-body-l font-bold text-ink">{summary.topic}</p>
            <p className="mt-0.5 truncate text-caption text-sub">
              {/* 만들어질 것만 적는다 — ②의 대상이 아니라 ④에서 고른 기획안이다 (09-02) */}
              {hasDrafts
                ? `카드 ${chosenDrafts.length}장 · ${chosenDrafts.map((d) => d.audience).join(" · ")}`
                : `${summary.audiences.join(" · ")}에게`}
            </p>
          </div>
        )}

        {/*
          기획안이 있으면 **여기서 고치지 않고 ④로 보낸다** (09-02).

          이 자리의 「수정」은 주제·대상을 바꾸는데, 기획안은 이미 그 값으로 만들어진
          뒤라 따라가지 않는다. 대상을 「러너」로 바꿔도 기획안 제목은 옛 대상 그대로다.
          고칠 곳이 따로 있으면 그리로 보내는 편이 맞다.
        */}
        {!editing && hasDrafts && (
          <button
            type="button"
            onClick={onEditDrafts}
            className="flex h-11 shrink-0 items-center gap-1 rounded-md px-3 text-body font-semibold
                       text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
          >
            <Pencil size={16} aria-hidden />
            기획안 고치기
          </button>
        )}

        {!editing && !hasDrafts && (
          /*
            아이콘만 두면 «눌러도 되는 것»인지 모른다 (09-02).
            글자를 붙이고 높이를 44로 올렸다 — DESIGN.md §5가 아이콘 단독 클릭 영역을
            최소 44px로 정해뒀는데 32px이었다.
          */
          <button
            type="button"
            onClick={startEdit}
            className="flex h-11 shrink-0 items-center gap-1 rounded-md px-3 text-body font-semibold
                       text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
          >
            <Pencil size={16} aria-hidden />
            수정
          </button>
        )}
      </div>

      <div className="my-4 border-t border-line" />

      {/* 사진 — 내 사진 + 추천 5, 한 줄 3개 × 2줄. 가로 스크롤 없음 (§2) */}
      <PlanPhotoPicker wrap {...photos} />

      {/* 버튼 — 박스 맨 아래, 안쪽 폭 전체 (§2) */}
      <div className="mt-4">
        <ReadyActionBar
          onConfirm={onConfirm}
          confirming={confirming}
          error={confirmError}
          saving={saving}
        />
      </div>
    </div>
  );
}

/* ============================================================
   대기 표시 — 문구 최대 2단계 (DESIGN §10)
   ============================================================ */

function WaitingIndicator({
  first = "누구에게 말할지 살펴보는 중...",
  second = "콘텐츠 흐름을 잡고 있어요...",
}: {
  first?: string;
  second?: string;
}) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setStage(1), 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div aria-live="polite" className="flex items-center gap-2 text-body text-sub">
      {/* ✦는 대기 상태 전용 (DESIGN §7) */}
      <span aria-hidden className="text-purple">✦</span>
      <span>차곡이 정리하고 있어요 · {stage === 0 ? first : second}</span>
    </div>
  );
}

/* ============================================================
   액션 바 — 기획안 완성 후. 핵심 행동은 하나다 (DESIGN §16)
   ============================================================ */

function ReadyActionBar({
  onConfirm,
  confirming,
  saving,
  error,
}: {
  onConfirm: () => void;
  confirming: boolean;
  saving: boolean;
  error: boolean;
}) {
  return (
    <div>
      <div className="flex w-full flex-col gap-2">
        {confirming ? (
          <div className="flex h-12 items-center justify-center">
            <WaitingIndicator
              first="카드마다 메시지와 이미지를 맞추고 있어요..."
              second="올리기 좋은 날짜를 잡고 있어요..."
            />
          </div>
        ) : (
          <>
            {/*
              **고친 값이 서버에 닿기 전에는 못 누른다** (09-02).

              주제를 고치면 서버로 한 번 다녀오는데(약 1초), 그 사이에 이 버튼을
              누르면 카드 생성이 **옛 주제**를 읽어간다 — 고쳤는데 반영이 안 된
              것처럼 보인다. 실제로 겪은 문제라 버튼을 잠근다.

              Primary는 --berry 단색 — 그라데이션 금지 (DESIGN §0·§6)
            */}
            <button
              type="button"
              onClick={onConfirm}
              disabled={saving}
              className="flex h-12 w-full items-center justify-center rounded-md bg-berry text-[15px]
                         font-semibold text-white transition-colors duration-200 hover:bg-berry-dark
                         disabled:bg-surface-muted disabled:text-sub"
            >
              {saving ? "고친 내용을 저장하는 중···" : "이대로 카드 만들기"}
            </button>
            {/* 에러는 인라인 · 빨간색 금지 — 글자는 --ink (DESIGN §2 하단) */}
            {error && (
              <p className="text-caption text-ink">카드를 만들지 못했어요 — 한 번 더 눌러주세요.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   초안 복구 배너 — 얇은 한 줄, 말풍선 아님 (08-28).
   F11 「이어서 기획하기」와 다른 기능 — 그 라벨을 쓰지 않는다
   ============================================================ */

function RestoreBanner({ onNew }: { onNew: () => void }) {
  /*
    09-03 — 배너에 「새로 시작」을 붙였다. 원래는 정보만 전하고(08-31) 비우기는 헤더
    [다시 시작]뿐이었는데, 막힌 세션이 자동 복원으로 계속 되살아나면 그 탈출구가
    안 보여 답답하다는 실사용 피드백. 되돌리기(5초)는 startNewPlan이 그대로 제공한다.
  */
  return (
    <div role="status" className="flex items-center gap-2 rounded-md bg-surface-muted px-3 py-2">
      <span className="text-[13px] text-sub">하던 기획을 이어서 열었어요</span>
      <button
        type="button"
        onClick={onNew}
        className="ml-auto shrink-0 rounded-pill border border-[#DCDCDC] bg-surface px-2.5 py-1 text-[13px] font-medium text-[#444444] transition-colors duration-200 hover:bg-[#E4E4E4]"
      >
        새로 시작
      </button>
    </div>
  );
}

/* ============================================================
   ① 주제 후보 — 열린 질문 금지, 4개 제시 (IA 2.1-①)
   ============================================================ */

function TopicSuggestionPicker({
  suggestions,
  onPick,
  onFreeTopic,
  freeTopicUsed,
}: {
  suggestions: string[];
  onPick: (topic: string) => void;
  /** 설정한 분야 말고 다른 이야기로 후보를 다시 받는다 (09-02) */
  onFreeTopic?: () => void;
  /** 이미 다른 이야기로 받아온 상태면 칩을 숨긴다 — 누를 데가 없다 */
  freeTopicUsed?: boolean;
}) {
  // 대상 질문과 **같은 Chip 컴포넌트·같은 흐름** (08-31 확정) —
  // 고르는 즉시 전송되고 목록은 사라진다. 값은 사용자 말풍선으로 남는다
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((t) => (
        <Chip key={t} label={t} selected={false} onToggle={() => onPick(t)} />
      ))}

      {/*
        「다른 이야기」 (09-02) — 온보딩에서 정한 분야가 대화의 기본값인데,
        다른 주제를 쓰려면 설정을 고치러 가야 했다. 여기서 그 기획에 한해 분야를
        풀어준다. **가로막는 선택 화면을 두지 않는다** — 칩 줄에 하나 더 얹으면
        같은 선택을 마찰 없이 준다 (DESIGN.md §1 「빈칸을 주지 않는다」).
      */}
      {onFreeTopic && !freeTopicUsed && (
        <button
          type="button"
          onClick={onFreeTopic}
          className="flex h-9 items-center rounded-pill border border-dashed border-line bg-surface px-4
                     text-body text-sub transition-colors duration-200 hover:border-berry hover:text-ink"
        >
          다른 이야기
        </button>
      )}
    </div>
  );
}

/* ============================================================
   ② 대상·목적 선택 — 후보 멀티 선택 + 기타 직접 입력 (IA 2.1-②)
   ============================================================ */

function Chip({
  label,
  selected,
  custom,
  onToggle,
}: {
  label: string;
  selected: boolean;
  custom?: boolean; // 사용자가 직접 쓴 대상 — 점선으로 시스템 정의와 구분 (08-28)
  onToggle: () => void;
}) {
  // 선택 칩: 배경 --berry-light · 테두리 2px --berry · 글자 --berry-dark + Check (DESIGN §6)
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={[
        "flex min-h-11 items-center gap-1.5 rounded-pill px-4 text-body transition-colors duration-200",
        custom ? "border-dashed" : "",
        selected
          ? "border-2 border-berry bg-berry-light font-semibold text-berry-dark"
          : "border border-line bg-surface text-ink hover:bg-surface-muted",
      ].join(" ")}
    >
      {selected && <Check size={16} aria-hidden />}
      {label}
    </button>
  );
}

function ProposalPicker({
  base,
  extras,
  picked,
  topic,
  onSaveTopic,
  onToggle,
  onAddOption,
  onSubmit,
}: {
  base: string[];
  extras: string[]; // 직접 입력으로 추가된 후보 — 점선으로 구분
  picked: string[];
  topic: string;
  onSaveTopic: (next: string) => void;
  onToggle: (audience: string) => void;
  onAddOption: (audience: string) => void;
  onSubmit: (targeting: Targeting, promo: Promo) => void;
}) {
  const [custom, setCustom] = useState("");
  // 「직접 쓰기」는 기본 접힘 — 하단 채팅창과 입력창이 두 개로 보이지 않게 (08-28)
  const [customOpen, setCustomOpen] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);

  /*
    세부 대상·홍보 대상 (09-03) — **여기서 받는다.** 예전엔 다듬기(⑤)에 있었는데,
    그러면 기획안이 이미 만들어진 뒤라 생성에는 못 썼다. 기본 접힘(선택) — 안 열어도 된다.
  */
  const [detailOpen, setDetailOpen] = useState(false);
  const [targeting, setTargeting] = useState<Targeting>({});
  const [promo, setPromo] = useState<Promo>({});

  useEffect(() => {
    if (customOpen) customInputRef.current?.focus();
  }, [customOpen]);

  function addCustom() {
    const value = custom.trim();
    if (!value) return;
    onAddOption(value);
    setCustom("");
    setCustomOpen(false); // 추가하고 나면 다시 접는다
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      {/* 주제 줄 — 대상을 고르는 동안에도 주제가 보이고, 그 자리에서 고칠 수 있다 (08-28).
          데스크톱·모바일 동일 노출 — 우측 패널 유무와 무관 */}
      <TopicLine topic={topic} onSave={onSaveTopic} />
      <div className="my-3 border-t border-line" />

      <h2 className="text-body font-bold text-ink">누구에게 말할까요?</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {base.map((a) => (
          <Chip key={a} label={a} selected={picked.includes(a)} onToggle={() => onToggle(a)} />
        ))}
        {extras.map((a) => (
          <Chip
            key={a}
            label={a}
            custom
            selected={picked.includes(a)}
            onToggle={() => onToggle(a)}
          />
        ))}

        {customOpen ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <label htmlFor="custom-audience" className="sr-only">
              대상 직접 입력
            </label>
            <input
              id="custom-audience"
              ref={customInputRef}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addCustom();
                }
                if (e.key === "Escape") setCustomOpen(false);
              }}
              placeholder="누구에게 말할까요?"
              className="h-11 w-44 min-w-0 rounded-pill border border-dashed border-line bg-surface px-4 text-body text-ink placeholder:text-sub/60"
            />
            <button
              type="button"
              onClick={addCustom}
              aria-label="대상 추가"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
            >
              <Plus size={18} aria-hidden />
            </button>
          </span>
        ) : (
          /*
            옆 칩들과 **같은 알약 형태**로 맞춘다 (09-02). 맨 글자로 두니 나란히 놓인
            대상 칩들 사이에서 혼자 눌리는 것처럼 안 보였다.

            점선 테두리는 이 저장소가 이미 쓰는 규칙이다 — 직접 쓴 대상 칩(`custom`)과
            「다른 이야기」가 점선이다. **점선 = 내가 채우는 자리**로 읽힌다.
          */
          <button
            type="button"
            onClick={() => setCustomOpen(true)}
            className="flex min-h-11 items-center gap-1 rounded-pill border border-dashed border-line
                       bg-surface px-4 text-body text-sub transition-colors duration-200
                       hover:border-berry hover:text-ink"
          >
            <Plus size={16} aria-hidden />
            직접 쓰기
          </button>
        )}
      </div>

      {/*
        누구에게 더 가까이 (09-03) — 연령·성별·말투·시간대 + 카드에 넣을 이름.

        **버튼 뒤로 옮겼다** (09-04). 09-03엔 접힌 아코디언이었는데 머리글이 작아
        있는 줄도 모르고 지나갔다. 「더 상세히 다듬기」와 「차곡이 정해줄게요」를
        나란히 놓으면 갈림길 자체가 안내가 된다 — 질문을 하나 더 세우지 않으면서
        (「빈칸 안 주기」·TTV) 원하는 사람은 확실히 찾아 들어간다.
      */}
      {detailOpen && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-label text-sub">
            고르면 말투·단어가 그 사람에 맞춰져요. 연령·성별은 여러 개 고를 수 있어요.
          </p>
          <TargetingChips
            targeting={targeting}
            disabled={false}
            onPick={(patch) => setTargeting((prev) => ({ ...prev, ...patch }))}
          />
          <PromoFields
            promo={promo}
            disabled={false}
            onSave={(patch) => setPromo((prev) => ({ ...prev, ...patch }))}
          />
        </div>
      )}

      {/*
        대상을 하나도 안 고른 상태 (09-04). **막지는 않는다** — 0개는 «차곡이 정해준다»는
        뜻으로 설계된 정상 경로다(08-28). 다만 고르는 걸 잊은 사람과 일부러 맡기는 사람이
        같은 화면을 보고 있어서, 무슨 일이 일어날지만 말해준다.
      */}
      {picked.length === 0 && (
        <div className="mt-4">
          <InlineAlert>아직 대상을 고르지 않았어요. 이대로 진행하면 차곡이 대신 정해요.</InlineAlert>
        </div>
      )}

      {/*
        09-02 — 「카드 N장 만들기」였는데, 이제 여기서 카드가 나오지 않는다.
        기획안을 먼저 보여주고 고르게 하는 단계(③④⑤)가 사이에 생겼다.
        버튼이 약속한 것과 다음 화면이 어긋나면 그게 곧 «속았다»는 인상이 된다.
      */}
      {detailOpen ? (
        <>
          <button
            type="button"
            onClick={() => onSubmit(targeting, promo)}
            className="mt-5 flex h-11 w-full items-center justify-center rounded-md bg-berry text-body font-semibold text-white transition-colors duration-200 hover:bg-berry-dark"
          >
            {picked.length === 0
              ? "이대로 기획안 보기"
              : `이 ${picked.length}명에게 어떻게 말할지 보기`}
          </button>
          {/* 되돌아갈 길 — 열고 보니 필요 없더라도 갈림길로 돌아올 수 있어야 한다 */}
          <button
            type="button"
            onClick={() => setDetailOpen(false)}
            className="mt-2 flex h-9 w-full items-center justify-center rounded-md text-label text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
          >
            상세 설정 접기
          </button>
        </>
      ) : (
        /*
          솔리드는 하나만 (DESIGN §7) — 둘 다 진하면 서로 경쟁해 «무엇이 기본인지»가
          사라진다. 빠른 길인 「차곡이 정해줄게요」를 솔리드로 두고, 상세는 아웃라인.
        */
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="flex h-11 flex-1 items-center justify-center rounded-md border-2 border-berry bg-surface text-body font-semibold text-berry transition-colors duration-200 hover:bg-berry-light hover:text-berry-dark"
          >
            더 상세히 다듬기
          </button>
          <button
            type="button"
            onClick={() => onSubmit(targeting, promo)}
            className="flex h-11 flex-1 items-center justify-center rounded-md bg-berry text-body font-semibold text-white transition-colors duration-200 hover:bg-berry-dark"
          >
            차곡이 정해줄게요
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   입력 바
   ============================================================ */

function ChatInputBar({
  disabled,
  value,
  onChange,
  focusToken,
  placeholder,
  onSend,
}: {
  disabled: boolean;
  value: string;
  onChange: (next: string) => void;
  focusToken: number;
  placeholder?: string;
  onSend: (text: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 칩 선택·[수정하기]·① 단계 진입 시 입력창에 커서를 준다
  useEffect(() => {
    if (focusToken > 0) {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length); // 커서를 끝으로
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }
    }
  }, [focusToken]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onChange("");
    const el = textareaRef.current;
    if (el) el.style.height = "auto";
    onSend(trimmed);
  }

  return (
    <div className="fixed inset-x-0 bottom-14 z-10 border-t border-line bg-bg p-3 md:bottom-0 lg:static lg:inset-auto lg:z-auto lg:border-t-0 lg:bg-transparent lg:p-0 lg:pt-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mx-auto flex w-full max-w-[720px] items-end gap-2 rounded-lg border border-line bg-surface p-3 focus-within:border-berry lg:mx-0 lg:max-w-none"
      >
        <label htmlFor="chat-input" className="sr-only">
          메시지 입력
        </label>
        <textarea
          id="chat-input"
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            const el = textareaRef.current;
            if (el) {
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder ?? "떠오른 생각을 그대로 적어주세요"}
          /*
            focus는 바깥 form이 `focus-within:border-berry`로 그린다 (09-02).
            이 속성이 없으면 globals.css의 입력칸 규칙이 투명한 칸 둘레에
            1px 사각형을 덧그려 «상자 안에 또 상자»가 된다.
          */
          data-focus-ring="none"
          className="max-h-32 min-w-0 flex-1 resize-none bg-transparent text-body text-ink outline-none placeholder:text-sub/60 focus-visible:outline-none"
        />
        <button
          type="submit"
          aria-label="전송"
          disabled={disabled}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-berry text-white transition-colors duration-200 hover:bg-berry-dark disabled:bg-surface-muted disabled:text-sub"
        >
          <ArrowUp size={18} aria-hidden />
        </button>
      </form>
    </div>
  );
}

/**
 * ⑥ 템플릿 고르기 (09-02) — 6종 중 하나.
 *
 * **「분위기」에서 「템플릿」으로 이름을 바꿨다 (09-02).** 원래 「템플릿」은 제작 결과
 * 화면에서 «몇 장을 어떤 순서로»를 고르는 다른 것이었는데, 그 선택을 없애면서
 * 그 말이 비었다. 사용자가 여기서 고르는 것은 실제로 시안 한 벌이므로
 * 「템플릿」이 맞고, 「분위기」는 무엇을 고르는지 짐작이 안 된다는 말이 있었다.
 * 코드의 `styleId`·`CARD_STYLES`는 그대로 둔다 — 화면 12곳이 함께 걸린다.
 *
 * **미리보기는 실제 렌더러가 그린 그림이다** (`/api/styles/[id]/preview`).
 * 시안 이미지를 쓰면 고를 때 본 것과 나오는 결과가 달라진다.
 *
 * 그림 에셋이 아직 없는 템플릿은 **고를 수 없게 막고 이유를 적는다** —
 * 목록에서 아예 빼면 「왜 6개라더니 3개지」가 되고, 그냥 고르게 두면
 * 시안과 다른 결과를 받게 된다.
 */
function StylePicker({
  selected,
  onPick,
}: {
  selected: StyleId | null;
  onPick: (id: StyleId) => void;
}) {
  /*
    자세히 보고 있는 템플릿 (09-02).

    **누르면 곧바로 정해지지 않고 먼저 크게 보여준다.** 표지 한 장만으로는
    「이 템플릿이 내 이야기를 담을 수 있나」를 알 수 없다 — 목차·비교·체크리스트
    같은 장이 있는지가 고르는 데 실제로 중요하다. 작은 칸에 여섯 장을 늘어놓는
    대신 한 장씩 크게 넘겨 본다.
  */
  const [detail, setDetail] = useState<StyleId | null>(null);

  /*
    **순서를 섞는다** (09-02). 고정 순서로 두면 맨 앞 한둘만 눌린다 —
    뒤에 있는 템플릿은 있는 줄도 모르고 지나간다. 가로로 넘겨 보게 만든 것도 같은 이유다.

    `useState` 초깃값으로 한 번만 섞는다. 그릴 때마다 섞으면 고르려고 손을 뻗는 사이에
    자리가 바뀐다. 이 화면은 ⑥에서야 나타나므로 서버에서 그려질 일이 없어
    («기획안을 고른 뒤»는 브라우저에서 정해진다) 서버·브라우저 순서가 어긋날 걱정도 없다.

    쓸 수 없는 템플릿(에셋 준비 중)은 섞지 않고 뒤에 붙인다 — 못 고르는 것이 앞줄에
    끼어 있으면 넘겨 보는 흐름이 끊긴다.
  */
  const [order] = useState<StyleId[]>(() => {
    const ready = STYLE_ORDER.filter((id) => isReady(CARD_STYLES[id]));
    const rest = STYLE_ORDER.filter((id) => !isReady(CARD_STYLES[id]));
    for (let i = ready.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ready[i], ready[j]] = [ready[j], ready[i]];
    }
    return [...ready, ...rest];
  });

  return (
    <section aria-label="템플릿 고르기" className="flex flex-col gap-3">
      <p className="text-body text-ink">어떤 템플릿으로 만들까요?</p>

      {/*
        **가로로 넘겨 본다** (09-02). 세로로 깔면 여섯 장이 화면을 통째로 먹어서,
        아래 사진·[이대로 카드 만들기]까지 스크롤이 한참이다. 오른쪽 칸이 반쯤 잘려
        보이는 것이 «더 있다»는 신호가 된다.

        **음수 여백으로 화면 끝까지 흘려보내지 않는다.** 바깥 대화 칸이 `overflow-y: auto`라
        (그러면 CSS가 가로도 auto로 계산한다) 여백 밖으로 내민 만큼이 잘려서, 첫 칸의
        왼쪽이 뭉텅 사라졌다. 칸 안에서 얌전히 흐르게 둔다.
      */}
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1">
        {order.map((id) => {
          const style = CARD_STYLES[id];
          const ready = isReady(style);
          const on = selected === id;
          const count = TEMPLATE_SHEETS[id]?.length ?? 0;

          return (
            <button
              key={id}
              type="button"
              disabled={!ready}
              onClick={() => setDetail(id)}
              aria-pressed={on}
              aria-label={`${style.label} 템플릿 자세히 보기${on ? " (지금 고른 것)" : ""}`}
              className={[
                // 폭을 못박아 마지막 칸이 반쯤 잘리게 한다 — 그게 «더 있다»는 신호다
                "relative flex w-[168px] shrink-0 snap-start flex-col overflow-hidden rounded-lg border text-left transition-colors duration-200 sm:w-[196px]",
                on ? "border-2 border-berry" : "border-line",
                ready ? "bg-surface hover:border-berry" : "cursor-not-allowed bg-surface-muted",
              ].join(" ")}
            >
              {/*
                next/image를 쓰지 않는다 — 이 주소는 우리 서버가 그때그때 그리는
                PNG라 최적화기를 거치면 한 번 더 굽기만 하고 얻는 게 없다.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/styles/${id}/preview?v=${PREVIEW_VERSION}`}
                alt=""
                width={320}
                height={320}
                className={[
                  "aspect-square w-full bg-surface-muted object-cover",
                  ready ? "" : "opacity-40",
                ].join(" ")}
              />

              {/* 고른 것에 표시를 남긴다 — 테두리만으로는 좁은 화면에서 잘 안 보인다 */}
              {on && (
                <span className="absolute right-2 top-2 flex items-center gap-1 rounded-pill bg-berry px-2 py-1 text-label font-semibold text-white">
                  <Check size={11} strokeWidth={3} aria-hidden />
                  고름
                </span>
              )}

              <span className="flex flex-col gap-0.5 p-3">
                <span className="text-body font-semibold text-ink">{style.label}</span>
                <span className="text-caption text-sub">
                  {ready ? style.hint : "준비 중이에요"}
                </span>
                {/* 왜 못 고르는지 적는다 — 「준비 중」만 보이면 언제 되는지 알 수 없다 */}
                {!ready ? (
                  <span className="text-caption text-sub">
                    {style.missing.map((m) => m.what).join(" · ")}이 필요해요
                  </span>
                ) : (
                  <span className="text-label text-sub">{count}장 · 눌러서 자세히 보기</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {detail && (
        <TemplateModal
          styleId={detail}
          selected={selected === detail}
          onPick={() => {
            onPick(detail);
            setDetail(null);
          }}
          onClose={() => setDetail(null)}
        />
      )}
    </section>
  );
}

/**
 * 템플릿 자세히 보기 (09-02) — 한 장씩 크게, ‹ ›로 넘긴다.
 *
 * 작은 칸에 여섯 장을 늘어놓던 것을 대신한다. 카드뉴스는 한 장이 1080×1080이라
 * 격자에 넣으면 글자가 뭉개져서 «무슨 장인지»를 알 수 없었다.
 *
 * 화면을 덮는 창이므로 빠져나갈 길을 셋 둔다 — Esc · 바깥 누르기 · 닫기 버튼.
 * 하나라도 빠지면 갇혔다고 느끼는 사람이 생긴다.
 */
function TemplateModal({
  styleId,
  selected,
  onPick,
  onClose,
}: {
  styleId: StyleId;
  selected: boolean;
  onPick: () => void;
  onClose: () => void;
}) {
  const sheets = TEMPLATE_SHEETS[styleId] ?? [];
  const [at, setAt] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const total = sheets.length;
  // 끝에서 처음으로 돈다 — 여섯 장뿐이라 막다른 끝이 있는 편이 더 답답하다
  const go = useCallback(
    (step: number) => setAt((v) => (total === 0 ? 0 : (v + step + total) % total)),
    [total],
  );

  useEffect(() => {
    // 창이 열리면 여기로 초점을 옮긴다 — 그래야 화살표·Esc가 바로 먹는다
    boxRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (total === 0) return null;
  const sheet = sheets[at];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${CARD_STYLES[styleId].label} 템플릿 자세히 보기`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
      onClick={onClose}
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        data-focus-ring="none"
        /* 바깥을 누르면 닫히는데, 안쪽 클릭까지 올라가면 그림을 눌러도 닫힌다 */
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-[520px] flex-col overflow-y-auto rounded-lg bg-surface p-4 outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-body font-bold text-ink">{CARD_STYLES[styleId].label}</p>
            <p className="mt-0.5 text-caption text-sub">{CARD_STYLES[styleId].hint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink transition-colors duration-200 hover:bg-surface-muted"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="relative mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/styles/${styleId}/preview?sheet=${at + 1}&v=${PREVIEW_VERSION}`}
            alt={`${at + 1}번째 장 — ${sheet.role}`}
            width={1080}
            height={1080}
            className="aspect-square w-full rounded-md border border-line bg-surface-muted object-contain"
          />

          {/*
            넘기는 버튼은 그림 **위에** 얹는다. 아래로 내리면 그림이 클수록
            손이 멀어지고, 넘길 때마다 시선이 위아래로 왕복한다.
          */}
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="앞 장"
            className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-pill bg-surface/90 text-ink shadow-sm transition-colors duration-200 hover:bg-surface"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="다음 장"
            className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-pill bg-surface/90 text-ink shadow-sm transition-colors duration-200 hover:bg-surface"
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>

        {/* 지금 몇 번째 장이고 무슨 장인지 — 그림만으로는 역할을 못 읽는 장이 있다 */}
        <p aria-live="polite" className="mt-3 text-center text-caption text-sub">
          <b className="text-ink">
            {at + 1} / {total}
          </b>{" "}
          · {sheet.role}
        </p>

        {/* 장 건너뛰기 — ‹ ›로만 다니면 6장 중 5장을 보려고 네 번 눌러야 한다 */}
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {sheets.map((sh, i) => (
            <button
              key={sh.file}
              type="button"
              onClick={() => setAt(i)}
              aria-label={`${i + 1}번째 장 — ${sh.role}`}
              aria-current={i === at}
              className={[
                "size-8 rounded-md border text-label font-semibold transition-colors duration-200",
                i === at
                  ? "border-berry bg-berry text-white"
                  : "border-line bg-surface text-sub hover:bg-surface-muted",
              ].join(" ")}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onPick}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-md bg-berry text-body font-semibold text-white transition-colors duration-200 hover:bg-berry-dark"
        >
          {selected ? "이 템플릿으로 계속하기" : "이 템플릿으로 만들기"}
        </button>
      </div>
    </div>
  );
}
