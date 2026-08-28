import type { LayoutId } from "../../types/card";

/**
 * 카드뉴스 레이아웃 6종의 satori 템플릿 골격.
 *
 * 이름 6종은 확정(PLAN.md §2-3), **시안은 미결**(DESIGN.md §18 — 여백·글자
 * 크기·이미지 비율·텍스트 슬롯 키). 여기 값은 전부 「통상값 초안」이며,
 * 시안이 나오면 이 파일의 상수만 갈아끼운다. DESIGN.md §18 — *"통일이 값보다
 * 중요하다. 그때까지 이 파일의 값을 그대로 쓴다."*
 *
 * JSX를 쓰지 않고 satori가 받는 순수 객체 노드로 작성한다 —
 * React 없이 스크립트(스모크 테스트)에서도 그대로 돌릴 수 있다.
 */

export type SlideContent = {
  layoutId: LayoutId;
  /** 레이아웃별 텍스트 슬롯. @TODO: 슬롯 키는 시안 확정 시 재정의 (아래 통상값) */
  texts: Record<string, string>;
  /** @TODO: 골격 단계에서는 data URI만 지원. 원격 URL 페치는 render API에서 처리 */
  imageUrl: string | null;
};

/** satori가 받는 최소 노드 형태 */
type Node = {
  type: string;
  props: { style?: Record<string, unknown>; children?: unknown; src?: string };
};

// @TODO: 산출물 팔레트는 시안 미결 — UI 토큰과 별개다(PRD §3 "UI 팔레트는
// 도구의 색이지 산출물의 색이 아니다"). 중립 통상값으로 시작한다.
const C = {
  bg: "#FFFFFF",
  ink: "#2D292B",
  sub: "#746F72",
  soft: "#F6F2F4",
  scrim: "rgba(0,0,0,0.45)", // image-full 글자 가독용
};

// @TODO: 통상값 — 캔버스 1080×1080(1:1), 패딩 96
export const SLIDE_SIZE = 1080;
const PAD = 96;

function el(
  type: string,
  style: Record<string, unknown>,
  children?: unknown,
  src?: string,
): Node {
  return { type, props: { style, children, ...(src ? { src } : {}) } };
}

function root(children: unknown[], background = C.bg): Node {
  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      backgroundColor: background,
      color: C.ink,
      padding: PAD,
    },
    children,
  );
}

function text(
  value: string,
  size: number,
  weight: 400 | 600 | 700,
  extra: Record<string, unknown> = {},
): Node {
  return el(
    "div",
    { display: "flex", fontSize: size, fontWeight: weight, lineHeight: 1.4, ...extra },
    value,
  );
}

/** 사진이 없을 때의 자리 표시 면. 폴백 사슬의 마지막은 text-only라 여기 안 온다 */
function imageArea(imageUrl: string | null, style: Record<string, unknown>): Node {
  if (imageUrl) {
    return el("img", { objectFit: "cover", ...style }, undefined, imageUrl);
  }
  return el("div", { display: "flex", backgroundColor: C.soft, ...style });
}

/* ── 레이아웃 6종 ─────────────────────────────────────────── */

/** cover — 표지. 캡션의 hook을 크게 싣는다 */
function cover(t: Record<string, string>): Node {
  return root([
    el(
      "div",
      { display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 32 },
      [
        text(t.title ?? "", 76, 700, { lineHeight: 1.3 }),
        text(t.subtitle ?? "", 34, 400, { color: C.sub }),
      ],
    ),
  ]);
}

/** text-only — 글자만. 이미지 폴백 3순위의 착지점 */
function textOnly(t: Record<string, string>): Node {
  return root([
    el("div", { display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", gap: 40 }, [
      text(t.title ?? "", 52, 700),
      text(t.body ?? "", 36, 400, { lineHeight: 1.6, color: C.ink }),
    ]),
  ]);
}

/** image-top — 위 이미지 + 아래 글 */
function imageTop(t: Record<string, string>, imageUrl: string | null): Node {
  return el(
    "div",
    { width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: C.bg, color: C.ink },
    [
      imageArea(imageUrl, { width: "100%", height: 560 }),
      el("div", { display: "flex", flexDirection: "column", flexGrow: 1, padding: `64px ${PAD}px`, gap: 28 }, [
        text(t.title ?? "", 46, 700),
        text(t.body ?? "", 32, 400, { lineHeight: 1.6 }),
      ]),
    ],
  );
}

/** image-full — 전면 이미지 + 오버레이 글 */
function imageFull(t: Record<string, string>, imageUrl: string | null): Node {
  return el(
    "div",
    { width: "100%", height: "100%", display: "flex", position: "relative" },
    [
      imageArea(imageUrl, { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }),
      el(
        "div",
        {
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          padding: PAD,
          backgroundColor: C.scrim,
        },
        [text(t.title ?? "", 52, 700, { color: "#FFFFFF", lineHeight: 1.35 })],
      ),
    ],
  );
}

/** list — 번호 목록. «3가지 이유» 같은 구조. 슬롯 키 item1~item4 @TODO */
function list(t: Record<string, string>): Node {
  const items = ["item1", "item2", "item3", "item4"]
    .map((k) => t[k])
    .filter((v): v is string => Boolean(v));

  return root([
    text(t.title ?? "", 48, 700, { marginBottom: 48 }),
    el(
      "div",
      { display: "flex", flexDirection: "column", gap: 36 },
      items.map((item, i) =>
        el("div", { display: "flex", alignItems: "center", gap: 28 }, [
          el(
            "div",
            {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: C.soft,
              fontSize: 34,
              fontWeight: 700,
              flexShrink: 0,
            },
            String(i + 1),
          ),
          text(item, 34, 400, { lineHeight: 1.5, flexGrow: 1 }),
        ]),
      ),
    ),
  ]);
}

/** closing — 마무리. 캡션의 cta·팔로우 유도 */
function closing(t: Record<string, string>): Node {
  return root([
    el("div", { display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", alignItems: "center", gap: 40 }, [
      text(t.message ?? "", 56, 700, { textAlign: "center", lineHeight: 1.4 }),
      text(t.cta ?? "", 34, 600, { color: C.sub }),
    ]),
  ]);
}

/* ── 진입점 ──────────────────────────────────────────────── */

export function buildLayout(content: SlideContent): Node {
  const { layoutId, texts, imageUrl } = content;
  switch (layoutId) {
    case "cover":
      return cover(texts);
    case "text-only":
      return textOnly(texts);
    case "image-top":
      return imageTop(texts, imageUrl);
    case "image-full":
      return imageFull(texts, imageUrl);
    case "list":
      return list(texts);
    case "closing":
      return closing(texts);
  }
}
