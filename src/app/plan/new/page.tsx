"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { ArrowUp, Check, Plus } from "lucide-react";
import { auth } from "@/lib/firebase/client";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft";
import { addCustomAudience, loadCustomAudiences } from "@/lib/custom-audiences";
import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
import AIChatBubble, { SystemEventLine } from "@/components/AIChatBubble";
import PlanningSummaryPanel, {
  PlanningSummaryInline,
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

async function postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
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
  return res.json();
}

/** 자동 1회 재시도 (PRD §5-7 ①) — 그다음부터는 사용자가 누른다 */
async function postWithRetry(path: string, body: unknown) {
  try {
    return await postJson(path, body);
  } catch {
    return await postJson(path, body);
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
  const [topicSuggestions, setTopicSuggestions] = useState<string[] | null>(null); // ① 후보 4개
  const [proposal, setProposal] = useState<Proposal | null>(null); // ② 후보
  const [summary, setSummary] = useState<PlanSummary>({
    topic: "",
    audiences: [],
    purposes: [],
    intent: "",
  });
  const [sending, setSending] = useState(false);
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

  // 사진 — 추천 1번을 미리 골라둔다 (「이렇게 골랐어요」 — DESIGN §1·§12).
  // @TODO: F3 연결 시 카드로 전달. 내 사진 업로드 저장은 Storage 구성 후 (PLAN §8)
  const [selectedStockId, setSelectedStockId] = useState<string | null>(
    STOCK_SUGGESTIONS[0].id,
  );
  const [userPhotos, setUserPhotos] = useState<string[]>([]);

  // 입력창이 주인공 — 칩은 입력창을 채울 뿐, 전송은 사용자가 한다 (08-28)
  const [chatText, setChatText] = useState("");
  const [focusToken, setFocusToken] = useState(0); // 올리면 입력창에 포커스

  // 기획안 완성 후에는 입력창을 숨기고 [수정하기]를 눌렀을 때만 연다 —
  // CTA와 입력창이 동시에 보이면 다음 행동이 흐려진다 (DESIGN §16, 08-27 피드백)
  const [chatMode, setChatMode] = useState(false);

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

  async function runTurn(payload: TurnPayload) {
    setSending(true);
    setFailed(null);
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
            );

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
        // 주제 등 부분 수정 턴에서는 후보·선택 상태를 건드리지 않는다 (08-28 — 선택 유지)
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
      setChatMode(false); // 응답이 오면 액션 바로 되돌린다
    } catch {
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
      onAddUserPhotos: (files: FileList) => {
        // 미리보기용 Object URL — Storage 연결 전이라 세션 안에서만 유지된다
        const urls = Array.from(files).map((f) => URL.createObjectURL(f));
        setUserPhotos((prev) => [...prev, ...urls]);
      },
      onRemoveUserPhoto: (url: string) => {
        URL.revokeObjectURL(url);
        setUserPhotos((prev) => prev.filter((u) => u !== url));
      },
    },
  };
  // 기획안이 준비됐고 조용한 상태 → 다음 행동은 [이대로 카드 만들기] 하나다
  const showActionBar = ready && !chatMode && !sending && !failed;

  return (
    <div className="flex flex-1">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col lg:h-dvh lg:overflow-hidden">
        <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col p-4 pb-40 md:p-6 md:pb-36 min-[1200px]:p-8 lg:min-h-0 lg:pb-6">
          {/* 헤더·탭 — 그대로. 2열보다 위에 두어 오른쪽 박스가 «탭 아래부터» 시작하게 한다 */}
          <header>
            {/* 탭 [새 기획]/[지난 기획] · 기본값 새 기획 (IA 2) */}
            <PageHeader
              title="AI 기획"
              action={
                <button
                  type="button"
                  onClick={startNewPlan}
                  disabled={
                    !(summary.topic !== "" || messages.some((m) => m.role === "user")) ||
                    sending ||
                    confirming
                  }
                  /* 중성 회색 알약 칩 (08-31 확정 지시 — 말풍선과 색·형태 모두 구분).
                     값은 지시서의 고정 색(#EDEDED/#DCDCDC/#444444, hover #E4E4E4) —
                     DESIGN §2 팔레트 밖이라 토큰 승격은 DESIGN 반영과 함께 필요 (보고됨).
                     대비 #444 on #EDEDED ≈ 8.2:1 (AA 통과). 주 버튼과 무관한 독립 스타일 */
                  className="flex h-[30px] items-center rounded-pill border border-[#DCDCDC] bg-[#EDEDED] px-3 text-[13px] font-medium text-[#444444] transition-colors duration-200 hover:bg-[#E4E4E4] active:bg-[#E4E4E4] disabled:opacity-50"
                >
                  새 기획
                </button>
              }
            />
            <PlanTabs />
            {isMock && (
              <p className="mt-2 text-caption text-sub">
                모의 AI로 동작 중이에요 — API 키 연결 전 개발용 응답입니다.
              </p>
            )}
          </header>

          {/* 2열 (08-31) — 왼쪽 대화 5 : 오른쪽 기획 박스 7, 간격 24px.
              1024px 미만은 기존 1열 그대로 */}
          <div className="mt-4 flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-12 lg:gap-6">
            {/* 좌 — 대화 + 추천 칩 + 하단 버튼. 대화만 열 안에서 스크롤된다 */}
            <section className="flex min-w-0 flex-col lg:col-span-5 lg:min-h-0">
              <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
              {restored && <RestoreBanner />}

                {messages.map((m, i) =>
                  m.role === "system" ? (
                    <SystemEventLine key={i} text={m.text} />
                  ) : (
                    <AIChatBubble
                      key={i}
                      role={m.role}
                      text={m.text}
                      showAvatar={m.role === "assistant" && messages[i - 1]?.role !== "assistant"}
                    />
                  ),
                )}

                {/* ① 주제 후보 — 열린 질문 금지 (IA 2.1-①).
                    칩은 바로 전송하지 않고 입력창을 채운다 — 다듬어 보내는 건 사용자 몫 */}
                {topicSuggestions && !sending && !failed && (
                  <TopicSuggestionPicker
                    suggestions={topicSuggestions}
                    onPick={(t) => {
                      dismissBanner();
                      setChatText(t);
                      setFocusToken((k) => k + 1);
                    }}
                  />
                )}

                {/* ② 대상 후보 — sending 중에도 유지: 주제 저장 중 선택이 사라지면 안 된다 */}
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

                {/* <lg — 기획안 인라인 카드 (사진 포함, 기존 그대로) */}
                {summaryStarted && !sending && <PlanningSummaryInline {...summaryProps} />}

                {/* lg+ — 사진 추천은 왼쪽 열에서 2개씩 3줄로 (08-31 2열) */}
                {ready && !sending && !failed && (
                  <div className="hidden lg:block">
                    <PlanPhotoPicker {...summaryProps.photos} />
                  </div>
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

              {/* 좌측 열 하단 고정 버튼 — 대화를 스크롤해도 항상 보인다 (08-31 §3) */}
              <div className="lg:pt-3">
                {showActionBar ? (
                  <ReadyActionBar
                    onConfirm={() => void confirmPlan()}
                    confirming={confirming}
                    error={confirmError}
                    onEditByChat={() => {
                      setChatMode(true);
                      setFocusToken((k) => k + 1);
                    }}
                  />
                ) : (
                  <ChatInputBar
                    disabled={sending || !planId}
                    value={chatText}
                    onChange={setChatText}
                    focusToken={focusToken}
                    placeholder={
                      ready ? "바꾸고 싶은 부분을 알려주세요 (예: 대상을 직장인으로)" : undefined
                    }
                    onSend={sendText}
                  />
                )}
              </div>
            </section>

            {/* 우 — 기획 박스 (lg+ · 5:7의 7) — 비어 있으면 안내 한 줄 */}
            <PlanningSummaryPanel
              summary={summary}
              onSave={saveSummaryPatch}
              topicLocked={confirmedLock}
              continueHref={planId ? `/plan/new?from=${planId}` : undefined}
              started={summaryStarted}
            />
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
            새 기획으로 넘어왔어요
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
  onEditByChat,
}: {
  onConfirm: () => void;
  confirming: boolean;
  error: boolean;
  onEditByChat: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-14 z-10 border-t border-line bg-bg p-3 md:sticky md:bottom-0 md:border-t-0 md:px-6 md:pb-6 md:pt-2 lg:static lg:inset-auto lg:z-auto lg:bg-transparent lg:p-0">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-2 lg:mx-0 lg:max-w-none">
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
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={onEditByChat}
                className="flex h-11 items-center px-2 text-body font-semibold text-berry transition-colors duration-200 hover:text-berry-dark"
              >
                수정하기
              </button>
              {/* 에러는 인라인 · 빨간색 금지 — 글자는 --ink (DESIGN §2 하단) */}
              {error && (
                <p className="text-caption text-ink">
                  카드를 만들지 못했어요 — 한 번 더 눌러주세요.
                </p>
              )}
            </div>
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
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onPick(t)}
          className="flex min-h-11 items-center rounded-pill border border-line bg-surface px-4 text-body text-ink transition-colors duration-200 hover:bg-surface-muted"
        >
          {t}
        </button>
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
    <div className="fixed inset-x-0 bottom-14 z-10 border-t border-line bg-bg p-3 md:sticky md:bottom-0 md:border-t-0 md:px-6 md:pb-6 md:pt-2 lg:static lg:inset-auto lg:z-auto lg:bg-transparent lg:p-0">
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
