"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { ArrowUp, Check, ChevronRight, Pencil, Plus } from "lucide-react";
import { auth, db } from "@/lib/firebase/client";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft";
import { addCustomAudience, loadCustomAudiences } from "@/lib/custom-audiences";
import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import AIChatBubble, { SystemEventLine } from "@/components/AIChatBubble";
import {
  TopicLine,
  type PlanSummary,
  type PlanSummaryPatch,
} from "@/components/PlanningSummaryPanel";
import PlanPhotoPicker, { STOCK_SUGGESTIONS } from "@/components/PlanPhotoPicker";
import PageHeader from "@/components/PageHeader";
import PlanTabs from "@/components/PlanTabs";

/**
 * 새 기획 — AI 기획 대화 3단계 (F2 · IA 2.1, 08-27 원안 복원).
 *   ① 주제 확인 — 주제가 전혀 없을 때만. 후보 4개 제시 · 열린 질문 금지
 *   ② 대상·목적 선택 — 후보 멀티 선택 + 기타 입력. 안 고르면 AI가 알아서 정한다
 *   ③ 카드 생성 — [이대로 카드 만들기] → 배치 결과 확인
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
  | { kind: "init"; idea: string; from: string | null }
  | { kind: "resume"; id: string } // 이탈 후 복원 — 진행 단계만 다시 받는다
  | { kind: "text"; text: string }
  | { kind: "selection"; audiences: string[]; purposes: string[] }
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
): Promise<Record<string, unknown>> {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method: "POST",
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
    사진 — 올린 사진은 기획에 저장되고, 카드 생성 때 주소를 물려준다 (08-31).
    추천(스톡) 칩은 기획안 박스의 3×2 그리드로 유지한다 — 09-01 병합 시 확정.
    실제 스톡 배정은 제작 단계에서 슬라이드 내용을 보고 다시 고른다 (`lib/ai/slides.ts`).
  */
  const [selectedStockId, setSelectedStockId] = useState<string | null>(STOCK_SUGGESTIONS[0].id);
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

  async function runTurn(payload: TurnPayload) {
    setSending(true);
    setFailed(null);
    setStreamingText(null);
    try {
      const data =
        payload.kind === "init"
          ? payload.from
            ? await postWithRetry(`/api/plans/${payload.from}/continue`, {})
            : await postWithRetry("/api/plans", { idea: payload.idea })
          : payload.kind === "resume"
            ? await postWithRetry(`/api/plans/${payload.id}/messages`, { resume: true })
            : await postWithRetry(
              `/api/plans/${planId}/messages`,
              payload.kind === "text"
                ? { text: payload.text }
                : payload.kind === "selection"
                  ? { selection: { audiences: payload.audiences, purposes: payload.purposes } }
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

  /** ② 대상 선택 제출 — 빈 선택이면 AI가 알아서 정한다. 목적은 대상에 딸려온다 (08-28) */
  function sendSelection(audiences: string[]) {
    dismissBanner();
    const label = audiences.length > 0 ? audiences.join(" · ") : "차곡이 알아서 정해주세요.";
    setMessages((prev) => [...prev, { role: "user", text: label }]);
    setProposal(null);
    void runTurn({ kind: "selection", audiences, purposes: [] });
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
      selectedStockId,
      userPhotos,
      onSelectStock: setSelectedStockId,
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
            <PageHeader title="AI 기획" />
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
              <div className="flex flex-col gap-4 [scrollbar-gutter:stable] lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                {restored && <RestoreBanner />}

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
                    onSubmit={() => sendSelection(picked)}
                  />
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
            {ready && (
              <aside className="min-h-0 lg:h-full lg:w-[420px] lg:flex-none">
                <div className="lg:sticky lg:top-0 lg:h-full">
                  <PlanBox
                    summary={summary}
                    photos={summaryProps.photos}
                    onSave={saveSummaryPatch}
                    onConfirm={() => void confirmPlan()}
                    confirming={confirming}
                    confirmError={confirmError}
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
}: {
  summary: PlanSummary;
  photos: {
    selectedStockId: string | null;
    userPhotos: string[];
    onSelectStock: (id: string) => void;
    onAddUserPhotos: (files: FileList) => void;
    onRemoveUserPhoto: (url: string) => void;
  };
  onSave: (patch: PlanSummaryPatch) => void;
  onConfirm: () => void;
  confirming: boolean;
  confirmError: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [topicDraft, setTopicDraft] = useState("");
  const [audDraft, setAudDraft] = useState("");

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
              {summary.audiences.join(" · ")}에게
            </p>
          </div>
        )}
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            aria-label="기획안 수정"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-sub transition-colors duration-200 hover:bg-surface-muted hover:text-ink"
          >
            <Pencil size={14} aria-hidden />
          </button>
        )}
      </div>

      <div className="my-4 border-t border-line" />

      {/* 사진 — 내 사진 + 추천 5, 한 줄 3개 × 2줄. 가로 스크롤 없음 (§2) */}
      <PlanPhotoPicker
        wrap
        selectedStockId={photos.selectedStockId}
        userPhotos={photos.userPhotos}
        onSelectStock={photos.onSelectStock}
        onAddUserPhotos={photos.onAddUserPhotos}
        onRemoveUserPhoto={photos.onRemoveUserPhoto}
      />

      {/* 버튼 — 박스 맨 아래, 안쪽 폭 전체 (§2) */}
      <div className="mt-4">
        <ReadyActionBar onConfirm={onConfirm} confirming={confirming} error={confirmError} />
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
  error,
}: {
  onConfirm: () => void;
  confirming: boolean;
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
            {/* Primary는 --berry 단색 — 그라데이션 금지 (DESIGN §0·§6) */}
            <button
              type="button"
              onClick={onConfirm}
              className="flex h-12 w-full items-center justify-center rounded-md bg-berry text-[15px] font-semibold text-white transition-colors duration-200 hover:bg-berry-dark"
            >
              이대로 카드 만들기
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

function RestoreBanner() {
  // 대화를 비우는 방법은 헤더의 [새 기획] 하나뿐 (08-31) — 배너는 정보만 전한다
  return (
    <div role="status" className="flex items-center rounded-md bg-surface-muted px-3 py-2">
      <span className="text-[13px] text-sub">하던 기획을 이어서 열었어요</span>
    </div>
  );
}

/* ============================================================
   ① 주제 후보 — 열린 질문 금지, 4개 제시 (IA 2.1-①)
   ============================================================ */

function TopicSuggestionPicker({
  suggestions,
  onPick,
}: {
  suggestions: string[];
  onPick: (topic: string) => void;
}) {
  // 대상 질문과 **같은 Chip 컴포넌트·같은 흐름** (08-31 확정) —
  // 고르는 즉시 전송되고 목록은 사라진다. 값은 사용자 말풍선으로 남는다
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((t) => (
        <Chip key={t} label={t} selected={false} onToggle={() => onPick(t)} />
      ))}
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
  onSubmit: () => void;
}) {
  const [custom, setCustom] = useState("");
  // 「직접 쓰기」는 기본 접힘 — 하단 채팅창과 입력창이 두 개로 보이지 않게 (08-28)
  const [customOpen, setCustomOpen] = useState(false);
  const customInputRef = useRef<HTMLInputElement>(null);

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
          <button
            type="button"
            onClick={() => setCustomOpen(true)}
            className="flex min-h-11 items-center px-2 text-caption font-semibold text-sub transition-colors duration-200 hover:text-ink"
          >
            + 직접 쓰기
          </button>
        )}
      </div>

      {/* 라벨이 곧 안내다 — 0개면 AI가 정한다는 뜻, 고르면 몇 장이 나올지 약속 (08-28).
          N = 선택 대상 수 × 주제 수 — 현 흐름은 대화당 주제 1개라 대상 수와 같다 */}
      <button
        type="button"
        onClick={onSubmit}
        className="mt-5 flex h-11 w-full items-center justify-center rounded-md bg-berry text-body font-semibold text-white transition-colors duration-200 hover:bg-berry-dark"
      >
        {picked.length === 0 ? "차곡이 정해줄게요" : `카드 ${picked.length}장 만들기`}
      </button>
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
