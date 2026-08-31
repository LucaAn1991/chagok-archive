"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clampElement } from "@/lib/free-layout";
import {
  DEFAULT_SLOT_STYLE,
  LINE_HEIGHT_VALUE,
  OPACITY_VALUE,
  SIZE_SCALE,
  TRACKING_DELTA,
} from "@/lib/slot-style";
import type { SlideElement } from "@/types";

/** 렌더러(`lib/render/layouts.ts`)와 같은 식 — 상자 높이에서 글자 크기를 뽑는다 */
const SLIDE_SIZE = 1080;

/**
 * 자유 배치 편집기 (08-31 · 편집기 B단계).
 *
 * **화면을 다시 그리지 않는다.** 브라우저에서 슬라이드를 흉내 내면
 * 미리보기와 산출물이 어긋나는 고전적인 문제가 생긴다(폰트 메트릭이 다르다).
 * 대신 **진짜 렌더링된 PNG를 깔고 그 위에 투명한 조작 상자만 얹는다.**
 * 요소마다 좌표를 우리가 갖고 있으니 상자 위치를 정확히 알 수 있고,
 * 렌더링이 5~10ms라 놓는 즉시 다시 그려도 끊기지 않는다.
 *
 * 그래서 여기에는 레이아웃 엔진도, 폰트도, 글자 그리기도 없다.
 * 하는 일은 «어느 상자를 얼마나 옮겼나»뿐이다.
 *
 * 터치도 같은 코드로 받는다 — Pointer 이벤트라 마우스·손가락을 구분하지 않는다
 * (PRD가 모바일 우선이다).
 *
 * **두 가지 모드가 있다** (08-31).
 * - `edit` — 자유 배치. 끌어서 옮기고 크기를 바꾼다.
 * - `select` — 레이아웃 모드. **고르기만 한다.** 위치는 레이아웃이 정하지만,
 *   «글자를 눌러서 그 줄을 고른다»는 동작은 두 모드가 같아야 한다.
 *   그래야 아래 입력칸을 찾아 누르지 않아도 된다.
 */

/** 한 번에 얼마나 잘게 움직일지 — 너무 잘면 손이 떨리고, 너무 크면 못 맞춘다 */
const SNAP = 0.005;

type Drag = {
  id: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  origin: SlideElement;
};

type Props = {
  /** 지금 렌더링된 슬라이드 PNG (blob URL) */
  imageUrl: string | null;
  elements: SlideElement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** 끄는 중(저장 중)에는 못 만지게 */
  disabled?: boolean;
  /** 'select'면 고르기만 한다 — 레이아웃 모드에서는 위치를 못 바꾼다 */
  mode?: "edit" | "select";
  /**
   * 캔버스 배경색. 글자를 그 자리에서 고칠 때 **밑에 깔린 PNG의 옛 글자를 덮으려고** 쓴다.
   * 안 덮으면 옛 글자와 지금 치는 글자가 겹쳐 보인다.
   */
  bg: string;
  ink: string;
  /** 캔버스의 자간 기준(테마 값) — 편집칸을 그려진 글자와 맞추려면 필요하다 */
  tracking?: number;
  /** 브랜드가 고른 폰트 이름 — 요소가 따로 안 고르면 이걸 쓴다 */
  family?: string;
  /** 글자를 그 자리에서 고쳤을 때. 없으면 그 자리 편집이 꺼진다 */
  onEditText?: (id: string, text: string) => void;
  /** 손을 뗐을 때만 부른다 — 끄는 동안 저장하면 요청이 폭주한다 */
  onCommit: (next: SlideElement[]) => void;
};

export default function SlideEditor({
  imageUrl,
  elements,
  selectedId,
  onSelect,
  disabled,
  mode = "edit",
  bg,
  ink,
  tracking = 0,
  family,
  onEditText,
  onCommit,
}: Props) {
  /** 지금 그 자리에서 고치는 중인 상자 */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  function beginEdit(el: SlideElement) {
    if (!onEditText || disabled || el.kind !== "text") return;
    setEditingId(el.id);
    setEditText(el.text ?? "");
  }

  function commitEdit() {
    const id = editingId;
    setEditingId(null);
    if (id) onEditText?.(id, editText);
  }
  const boxRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<SlideElement[] | null>(null);
  const dragRef = useRef<Drag | null>(null);

  /**
   * 끄는 중인 값을 ref로도 들고 있는다.
   *
   * 화면을 다시 그리려면 state가 필요하지만, **손을 뗄 때 저장하려면 그 값을
   * 업데이터 «밖»에서 읽어야 한다.** `setDraft(prev => { onCommit(prev) ... })`처럼
   * 업데이터 안에서 부모 상태를 바꾸면 React가 «렌더링 중에 다른 컴포넌트를
   * 갱신했다»고 막는다 (08-31 실제로 터졌다).
   */
  const draftRef = useRef<SlideElement[] | null>(null);

  const applyDraft = useCallback((next: SlideElement[] | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  // 끄는 동안에는 draft를 보여주고, 놓으면 부모가 준 값으로 돌아간다
  const shown = draft ?? elements;

  const snap = (v: number) => Math.round(v / SNAP) * SNAP;

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    const rect = boxRef.current?.getBoundingClientRect();
    if (!d || !rect) return;

    const dx = (e.clientX - d.startX) / rect.width;
    const dy = (e.clientY - d.startY) / rect.height;

    applyDraft(
      (draftRef.current ?? []).map((el) => {
        if (el.id !== d.id) return el;
        return clampElement(
          d.mode === "move"
            ? { ...el, x: snap(d.origin.x + dx), y: snap(d.origin.y + dy) }
            : { ...el, w: snap(d.origin.w + dx), h: snap(d.origin.h + dy) },
        );
      }),
    );
  }, [applyDraft]);

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;

    // 값을 먼저 읽고 초안을 비운 뒤에 저장한다 — 순서가 바뀌면 렌더링 중 갱신이 된다
    const next = draftRef.current;
    applyDraft(null);
    // 놓는 순간에만 저장한다 — 여기서 부모가 다시 그린다
    if (next) onCommit(next);
  }, [applyDraft, onCommit]);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  function start(e: React.PointerEvent, el: SlideElement, dragMode: Drag["mode"]) {
    if (disabled) return;
    e.stopPropagation();
    onSelect(el.id);
    // 고르기 전용일 때는 여기서 끝 — 끌어도 아무 일이 없어야 한다
    if (mode === "select") return;
    e.preventDefault();
    dragRef.current = { id: el.id, mode: dragMode, startX: e.clientX, startY: e.clientY, origin: el };
    applyDraft(elements);
  }

  /** 키보드로도 옮길 수 있어야 한다 — 손이 떨리거나 마우스가 없을 수 있다 */
  function onKeyDown(e: React.KeyboardEvent, el: SlideElement) {
    if (mode === "select") return;
    const step = e.shiftKey ? SNAP * 4 : SNAP;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = move[e.key];
    if (!d) return;
    e.preventDefault();
    onCommit(
      elements.map((x) =>
        x.id === el.id ? clampElement({ ...x, x: x.x + d[0], y: x.y + d[1] }) : x,
      ),
    );
  }

  return (
    <div
      ref={boxRef}
      onPointerDown={() => onSelect(null)}
      // `cqw`로 글자 크기를 재려면 이 상자가 기준이어야 한다
      style={{ containerType: "inline-size" }}
      className="relative aspect-square w-full max-w-[420px] touch-none select-none overflow-hidden rounded-lg border border-line bg-surface-muted"
    >
      {/* 바탕은 «진짜 결과물»이다 — 흉내 낸 그림이 아니라 내려받을 그 PNG */}
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- blob URL은 next/image 대상이 아니다
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full" />
      )}

      {shown.map((el) => {
        const active = el.id === selectedId;
        const o = { ...DEFAULT_SLOT_STYLE, ...(el.style ?? {}) };
        const fontSize = Math.round(SLIDE_SIZE * el.h * 0.42 * SIZE_SCALE[o.size]);

        /*
          그 자리 편집 — 밑에 깔린 PNG의 옛 글자를 배경색으로 덮고 그 위에 입력칸을 놓는다.
          크기·정렬·색을 렌더러와 같은 식으로 맞춰서, 치는 동안과 그려진 뒤가 비슷하게 보인다.
        */
        if (editingId === el.id) {
          return (
            <textarea
              key={el.id}
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setEditingId(null);
                } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  commitEdit();
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                left: `${el.x * 100}%`,
                top: `${el.y * 100}%`,
                width: `${el.w * 100}%`,
                height: `${el.h * 100}%`,
                background: bg,
                color: o.colorHex ?? ink,
                /*
                  캔버스는 1080 기준으로 계산했다. 미리보기는 그보다 작으므로
                  `cqw`(이 상자 폭의 %)로 환산해 **어느 크기에서도 같은 비율**로 보이게 한다.
                  자간·줄 간격·폰트까지 렌더러와 같은 값을 써야 «치는 동안»과
                  «그려진 뒤»가 어긋나지 않는다 (08-31).
                */
                fontSize: `${(fontSize / SLIDE_SIZE) * 100}cqw`,
                letterSpacing: `${((tracking + TRACKING_DELTA[o.tracking]) / SLIDE_SIZE) * 100}cqw`,
                lineHeight: LINE_HEIGHT_VALUE[o.lineHeight],
                fontFamily: o.fontId ?? family,
                textAlign: o.align,
                fontWeight: o.weight === "bold" ? 700 : 400,
                opacity: OPACITY_VALUE[o.opacity],
                textDecoration: [o.underline && "underline", o.strike && "line-through"]
                  .filter(Boolean)
                  .join(" "),
              }}
              className="absolute resize-none overflow-hidden rounded-sm border-2 border-berry p-0 outline-none"
            />
          );
        }

        return (
          <div
            key={el.id}
            role="button"
            tabIndex={0}
            aria-label={
              mode === "edit" ? `${el.slot ?? el.kind} 옮기기` : `${el.slot ?? el.kind} 고르기`
            }
            onPointerDown={(e) => start(e, el, "move")}
            onDoubleClick={() => beginEdit(el)}
            onKeyDown={(e) => {
              // 고른 상태에서 Enter로도 들어간다 — 마우스 없이 쓸 수 있어야 한다
              if (e.key === "Enter") {
                e.preventDefault();
                beginEdit(el);
                return;
              }
              onKeyDown(e, el);
            }}
            style={{
              left: `${el.x * 100}%`,
              top: `${el.y * 100}%`,
              width: `${el.w * 100}%`,
              height: `${el.h * 100}%`,
            }}
            className={`absolute rounded-sm border-2 ${
              mode === "edit" ? "cursor-move" : "cursor-pointer"
            } ${active ? "border-berry bg-berry/10" : "border-transparent hover:border-berry/40"}`}
          >
            {active && mode === "edit" && (
              <span
                aria-label="크기 조절"
                onPointerDown={(e) => start(e, el, "resize")}
                className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-pill border-2 border-berry bg-surface"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
