"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clampElement } from "@/lib/free-layout";
import type { SlideElement } from "@/types";

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
  onCommit,
}: Props) {
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
      className="relative aspect-square w-full max-w-[420px] touch-none select-none overflow-hidden rounded-lg border border-line bg-surface-muted"
    >
      {/* 바탕은 «진짜 결과물»이다 — 흉내 낸 그림이 아니라 내려받을 그 PNG */}
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- blob URL은 next/image 대상이 아니다
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full" />
      )}

      {shown.map((el) => {
        const active = el.id === selectedId;
        return (
          <div
            key={el.id}
            role="button"
            tabIndex={0}
            aria-label={
              mode === "edit" ? `${el.slot ?? el.kind} 옮기기` : `${el.slot ?? el.kind} 고르기`
            }
            onPointerDown={(e) => start(e, el, "move")}
            onKeyDown={(e) => onKeyDown(e, el)}
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
