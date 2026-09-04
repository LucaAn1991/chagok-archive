"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Loader2 } from "lucide-react";
import type { DraftVariant, PlanDraft } from "@/types";

/**
 * ③④⑤ — 대상별 기획안을 보여주고, 고르고, 다듬는다 (09-02).
 *
 * **원래도 만들고 있던 값을 화면으로 꺼낸 자리다.** 예전에는 「이대로 카드 만들기」를
 * 누르는 순간 대상마다 기획안이 만들어져 곧바로 카드가 됐다 — 사용자는 자기가 뭘 받게
 * 될지 **보지 못한 채** 결과를 받았다.
 *
 * 세 가지를 한 컴포넌트에 둔 이유 — 「고르기」와 「다듬기」는 같은 카드 위에서 일어난다.
 * 화면을 나누면 고른 것을 다듬으러 갔다가 무엇을 골랐는지 다시 확인하러 돌아오게 된다.
 *
 * 다듬기는 **건너뛸 수 있다.** 대상을 셋 고르면 다듬기도 세 번인데, 매번 강제하면
 * 그 자리가 곧 이탈 구간이 된다. 안 다듬으면 ③에서 만든 값이 그대로 카드가 된다.
 */

export type RefineTurn = { role: "user" | "assistant"; text: string };

export default function PlanDraftList({
  drafts,
  loading,
  error,
  refining,
  refineIndex,
  refineTurns,
  streamingText,
  onRetryLoad,
  onToggle,
  onOpenRefine,
  onCloseRefine,
  onSendRefine,
  onNext,
  saving,
  variants,
  variantsLoading,
  onApplyVariant,
  onApplySlideCount,
}: {
  drafts: PlanDraft[];
  /** ③ 기획안을 만드는 중 */
  loading: boolean;
  error: string | null;
  /** ⑤ 다듬기 응답을 기다리는 중 */
  refining: boolean;
  /** 지금 다듬고 있는 기획안. null이면 목록 화면 */
  refineIndex: number | null;
  /** 지금 다듬는 기획안의 대화 */
  refineTurns: RefineTurn[];
  /** 만들어지는 중인 답 */
  streamingText: string | null;
  /** ⑤ 다듬기 후보 — 지금 열어둔 기획안 것 */
  variants: DraftVariant[];
  variantsLoading: boolean;
  onApplyVariant: (v: DraftVariant) => void;
  onApplySlideCount: (n: number) => void;
  onRetryLoad: () => void;
  onToggle: (index: number) => void;
  onOpenRefine: (index: number) => void;
  onCloseRefine: () => void;
  onSendRefine: (text: string) => void;
  onNext: () => void;
  saving: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-lg bg-surface p-4 shadow-e1">
        <h2 className="text-body font-bold text-ink">기획안을 만들고 있어요</h2>
        <p className="mt-1 text-caption text-sub">
          고른 대상마다 하나씩, 어떻게 말을 걸지 정리하는 중이에요.
        </p>
        <div className="mt-4 flex flex-col gap-2" aria-hidden>
          {/* 몇 개가 나올지 아직 모른다 — 두 칸만 두고 실제 개수는 도착하면 그린다 */}
          {[0, 1].map((i) => (
            <div key={i} className="h-[92px] animate-pulse rounded-md bg-surface-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-surface p-4 shadow-e1">
        <p className="text-body text-ink">{error}</p>
        <button
          type="button"
          onClick={onRetryLoad}
          className="mt-3 flex h-11 items-center justify-center rounded-md border-2 border-berry bg-surface px-5 text-body font-semibold text-berry transition-colors duration-200 hover:bg-berry-tint hover:text-berry-dark"
        >
          다시 만들기
        </button>
      </div>
    );
  }

  if (drafts.length === 0) return null;

  // ⑤ 다듬기 — 고른 기획안 하나만 크게 놓고 대화한다
  if (refineIndex !== null && drafts[refineIndex]) {
    return (
      <RefinePanel
        /*
          기획안이 바뀌면 **패널을 새로 그린다.** 「다른 안도 보기」로 펼쳐둔 것이나
          쓰다 만 글이 다음 기획안까지 따라오면 안 된다. effect로 되돌리는 것보다
          key로 새로 만드는 편이 되돌릴 것을 빠뜨릴 일이 없다.
        */
        key={refineIndex}
        draft={drafts[refineIndex]}
        turns={refineTurns}
        streamingText={streamingText}
        refining={refining}
        variants={variants}
        variantsLoading={variantsLoading}
        onApplyVariant={onApplyVariant}
        onApplySlideCount={onApplySlideCount}
        onClose={onCloseRefine}
        onSend={onSendRefine}
      />
    );
  }

  const chosenCount = drafts.filter((d) => d.chosen).length;

  return (
    <div className="rounded-lg bg-surface p-4 shadow-e1">
      <h2 className="text-body font-bold text-ink">이렇게 만들어 볼게요</h2>
      <p className="mt-1 text-caption text-sub">
        대상마다 하나씩 준비했어요. 만들 것만 남기고, 더 손보고 싶으면 「다듬기」를 눌러주세요.
      </p>

      <ul className="stagger mt-4 flex flex-col gap-2">
        {drafts.map((d, i) => (
          <li key={`${d.audience}-${i}`}>
            <DraftCard
              draft={d}
              onToggle={() => onToggle(i)}
              onRefine={() => onOpenRefine(i)}
              /* 마지막 하나는 끄지 못한다 — 만들 게 없는 상태로 다음 단계에 가면 헛걸음이다 */
              lockedOn={d.chosen && chosenCount === 1}
            />
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onNext}
        disabled={saving || chosenCount === 0}
        className="mt-4 flex h-12 w-full items-center justify-center rounded-md bg-berry text-body font-semibold text-white transition-colors duration-200 hover:bg-berry-dark disabled:opacity-60"
      >
        {saving ? "저장하는 중···" : `이 ${chosenCount}개로 갈게요`}
      </button>
    </div>
  );
}

function DraftCard({
  draft,
  onToggle,
  onRefine,
  lockedOn,
}: {
  draft: PlanDraft;
  onToggle: () => void;
  onRefine: () => void;
  lockedOn: boolean;
}) {
  return (
    <div
      className={[
        "rounded-md border p-3 transition-colors duration-200",
        draft.chosen ? "border-berry bg-berry-tint" : "border-line bg-surface",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={lockedOn}
          aria-pressed={draft.chosen}
          /* 체크는 켜고 끄는 것이라 라벨을 함께 읽어준다 — 색만으로 알리지 않는다 (DESIGN §15) */
          aria-label={`${draft.audience}용 기획안 ${draft.chosen ? "빼기" : "넣기"}`}
          className={[
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm border-2 transition-colors duration-200",
            draft.chosen ? "border-berry bg-berry text-white" : "border-line bg-surface",
            lockedOn ? "cursor-not-allowed opacity-70" : "",
          ].join(" ")}
        >
          {draft.chosen && <Check size={13} strokeWidth={3} aria-hidden />}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-label font-semibold text-sub">{draft.audience}</p>
          {/*
            장수는 **제목에 붙여 쓴다** (09-02). 아래 따로 떼어 두니 한 알만 덩그러니
            남아 무엇에 딸린 값인지 흐렸다. 「이 카드가 몇 장인가」는 제목의 성질에 가깝다.
            제목이 두 줄이면 마지막 줄 끝에 자연스럽게 따라붙는다.
          */}
          <p className="mt-0.5 break-keep text-body font-bold text-ink">
            {draft.title}
            {draft.slideCount !== null && (
              <span className="ml-1.5 whitespace-nowrap align-middle rounded-pill bg-surface-muted px-2 py-0.5 text-label font-semibold text-sub">
                {draft.slideCount}장
              </span>
            )}
          </p>
          <p className="mt-1 break-keep text-caption leading-relaxed text-sub">{draft.intent}</p>

          {draft.extraNote && (
            <p className="mt-2 max-w-full truncate rounded-pill bg-surface-muted px-2 py-0.5 text-label text-sub">
              꼭 넣기 · {draft.extraNote}
            </p>
          )}
        </div>

        {/*
          연필만 두면 무엇을 하는 버튼인지 모른다 (09-02 — 주제 수정 아이콘에서 같은 문제).
          글자를 함께 둔다.
        */}
        <button
          type="button"
          onClick={onRefine}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-caption font-semibold text-ink transition-colors duration-200 hover:bg-surface-muted"
        >
          <Pencil size={13} aria-hidden />
          다듬기
        </button>
      </div>
    </div>
  );
}

/**
 * 이 기획안에 적용된 세부 대상·홍보 대상을 한 줄로 요약한다 (09-03).
 * ②에서 받은 값을 다듬기에서 읽기 전용으로 보여줄 때 쓴다. 아무것도 없으면 빈 문자열.
 */
function targetingSummary(draft: PlanDraft): string {
  const t = draft.targeting;
  /* 연령·성별은 복수다 (09-04) — 옛 문서의 문자열 하나도 그대로 읽힌다 */
  const listed = (v: string[] | string | undefined) =>
    v ? (Array.isArray(v) ? v : [v]).filter(Boolean).join("·") : "";
  const bits = [listed(t?.ageRange), listed(t?.gender), t?.tone, t?.timeOfDay].filter(
    Boolean,
  ) as string[];
  const brand = draft.promo?.brandName?.trim();
  if (brand) bits.push(`\u2018${brand}\u2019 홍보`);
  return bits.join(" · ");
}

function RefinePanel({
  draft,
  turns,
  streamingText,
  refining,
  variants,
  variantsLoading,
  onApplyVariant,
  onApplySlideCount,
  onClose,
  onSend,
}: {
  draft: PlanDraft;
  turns: RefineTurn[];
  streamingText: string | null;
  refining: boolean;
  variants: DraftVariant[];
  variantsLoading: boolean;
  onApplyVariant: (v: DraftVariant) => void;
  onApplySlideCount: (n: number) => void;
  onClose: () => void;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  /*
    후보를 하나 고르면 **나머지는 접는다.** 다 골라놓고도 셋이 그대로 남아 있으면
    무엇을 정한 것인지 흐려지고, 아래 대화가 그만큼 밀려 내려간다.
    「다른 안도 보기」로 다시 펼 수 있다.
  */
  const [showAll, setShowAll] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  /** 고른 후보가 있나 — 제목이 같으면 그것을 쓰고 있는 것으로 본다 */
  const picked = variants.some((v) => v.title === draft.title);
  const shown = picked && !showAll ? variants.filter((v) => v.title === draft.title) : variants;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);


  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, streamingText]);

  function send() {
    const value = text.trim();
    if (!value || refining) return;
    onSend(value);
    setText("");
  }

  return (
    <div className="rounded-lg bg-surface p-4 shadow-e1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label font-semibold text-sub">{draft.audience}</p>
          <p className="mt-0.5 break-keep text-body font-bold text-ink">{draft.title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-9 shrink-0 rounded-md border border-line bg-surface px-3 text-caption font-semibold text-ink transition-colors duration-200 hover:bg-surface-muted"
        >
          목록으로
        </button>
      </div>

      <p className="mt-3 rounded-md bg-surface-muted p-3 text-caption leading-relaxed text-sub">
        {draft.intent}
      </p>

      {/*
        **바꿀 거리를 차려준다** (09-02). 빈 입력창만 주면 무엇을 고칠 수 있는지 모른 채
        커서만 본다 — ③에서 기획안을 차려주고 여기서만 빈칸을 주면 앞뒤가 안 맞는다
        (DESIGN.md §1 「빈칸을 주지 않는다」 · IA 2.1 「열린 질문 금지」).
      */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-label font-semibold text-sub">
            {picked && !showAll ? "이걸로 바꿨어요" : "이렇게 바꿔볼 수도 있어요"}
          </p>
          {/*
            고른 뒤에도 되돌아갈 길은 남긴다 — 후보는 이 기획안당 한 번만 뽑으므로,
            완전히 지워버리면 «아까 그 안이 나았는데»가 됐을 때 방법이 없다.
          */}
          {picked && !showAll && variants.length > 1 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="shrink-0 text-label font-semibold text-berry-dark underline underline-offset-2"
            >
              다른 안도 보기
            </button>
          )}
        </div>

        {variantsLoading ? (
          <div className="mt-2 flex flex-col gap-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[64px] animate-pulse rounded-md bg-surface-muted" />
            ))}
          </div>
        ) : variants.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2">
            {shown.map((v, i) => {
              // 지금 쓰고 있는 후보인가 — 눌러놓고도 표시가 없으면 무엇을 골랐는지 잊는다
              const applied = draft.title === v.title;
              return (
              <li key={`${v.angle}-${i}`}>
                <button
                  type="button"
                  onClick={() => onApplyVariant(v)}
                  disabled={refining || applied}
                  aria-pressed={applied}
                  /*
                    버튼 이름을 짧게 준다 — 안 주면 제목·의도가 통째로 이름이 되어
                    화면 낭독기가 세 문장을 다 읽는다. 눈으로 보는 내용은 그대로 둔다.
                  */
                  /* 각도 라벨이 「~으로」로 끝나는 일이 잦아 조사를 붙이면 «실패담으로로»가 된다 */
                  aria-label={applied ? `${v.angle} — 지금 쓰는 중` : `${v.angle} — 이걸로 바꾸기`}
                  className={[
                    "w-full rounded-md border p-3 text-left transition-colors duration-200",
                    applied
                      ? "border-berry bg-berry-tint"
                      : "border-line bg-surface hover:border-berry hover:bg-berry-tint",
                    refining && !applied ? "opacity-60" : "",
                  ].join(" ")}
                >
                  <span className="block text-label font-semibold text-berry-dark">
                    {v.angle}
                  </span>
                  <span className="mt-0.5 block break-keep text-caption font-bold text-ink">
                    {v.title}
                  </span>
                  <span className="mt-1 block break-keep text-label leading-relaxed text-sub">
                    {v.intent}
                  </span>
                  {applied && (
                    <span className="mt-1.5 block text-label font-semibold text-berry-dark">
                      지금 이걸로 되어 있어요
                    </span>
                  )}
                </button>
              </li>
              );
            })}
          </ul>
        ) : (
          /* 후보를 못 만들어도 다듬기는 된다 — 거들어주는 것이지 관문이 아니다 */
          <p className="mt-2 break-keep text-caption leading-relaxed text-sub">
            «무릎 보호대 얘기도 넣어줘» 처럼 적어주시면 고쳐드릴게요.
          </p>
        )}

        {/* 장수는 값이 정해져 있어 AI를 부를 것도 없다 — 누르면 곧바로 바뀐다 */}
        <p className="mt-4 text-label font-semibold text-sub">몇 장으로 만들까요</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[4, 5, 6, 7].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onApplySlideCount(n)}
              disabled={refining}
              aria-pressed={draft.slideCount === n}
              className={[
                "h-9 rounded-pill px-3.5 text-caption font-semibold transition-colors duration-200 disabled:opacity-60",
                draft.slideCount === n
                  ? "bg-berry text-white"
                  : "border border-line bg-surface text-ink hover:bg-surface-muted",
              ].join(" ")}
            >
              {n}장
            </button>
          ))}
          {draft.slideCount === null && (
            <span className="flex h-9 items-center text-label text-sub">
              안 고르면 차곡이 정해요
            </span>
          )}
        </div>

        {/*
          세부 대상·홍보 대상 (09-03) — **입력은 ②(대상 선택)로 옮겼다.** 여기선 «무엇이
          적용됐는지»만 읽기 전용으로 보여준다. 다듬기에서 또 물으면 같은 질문이 두 번 된다.
          아무것도 설정 안 했으면 이 줄은 그리지 않는다(막다른 빈칸을 주지 않는다).
        */}
        {targetingSummary(draft) && (
          <p className="mt-4 text-label text-sub">
            <span className="font-semibold">이 기획안 대상</span> · {targetingSummary(draft)}
          </p>
        )}
      </div>

      {turns.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {turns.map((t, i) => (
            <p
              key={i}
              className={[
                "max-w-[85%] break-keep rounded-md px-3 py-2 text-caption leading-relaxed",
                t.role === "user"
                  ? "self-end bg-berry text-white"
                  : "self-start bg-surface-muted text-ink",
              ].join(" ")}
            >
              {t.text}
            </p>
          ))}
        </div>
      )}

      {streamingText !== null && (
        <p className="mt-2 max-w-[85%] self-start break-keep rounded-md bg-surface-muted px-3 py-2 text-caption leading-relaxed text-ink">
          {streamingText}
        </p>
      )}

      {refining && streamingText === null && (
        <p className="mt-3 flex items-center gap-2 text-caption text-sub">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          고치는 중이에요···
        </p>
      )}

      <div ref={bottomRef} />

      {/*
        칸 자체에는 테두리를 두지 않고 바깥 상자가 그린다 — 안팎으로 두 겹이 되지 않게
        (globals.css의 `data-focus-ring="none"` 주석 참고).
      */}
      <div className="mt-4 border-t border-line pt-3">
        <p className="text-label font-semibold text-sub">직접 말해도 돼요</p>
      </div>
      <div className="mt-2 flex items-end gap-2 rounded-md border border-line bg-surface p-2 focus-within:border-berry">
        <label htmlFor="refine-input" className="sr-only">
          기획안 고치기
        </label>
        <textarea
          id="refine-input"
          ref={inputRef}
          rows={1}
          value={text}
          data-focus-ring="none"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="어떻게 고칠까요?"
          className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-1 text-body text-ink outline-none placeholder:text-sub"
        />
        <button
          type="button"
          onClick={send}
          disabled={refining || !text.trim()}
          className="h-9 shrink-0 rounded-md bg-berry px-4 text-caption font-semibold text-white transition-colors duration-200 hover:bg-berry-dark disabled:opacity-60"
        >
          보내기
        </button>
      </div>
    </div>
  );
}
