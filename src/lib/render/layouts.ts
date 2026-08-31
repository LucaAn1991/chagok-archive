import type { LayoutId } from "../../types/card";
// 편집기와 같은 표를 본다 — 여기 숫자를 박아두면 편집칸 크기가 어긋난다
import { LAYOUT_FONT_SIZE as F } from "../slide-layout";
import { applyBrand, resolveTheme, type Theme } from "./themes";
import type { Brand } from "../../types/user";
import type { SlideElement, SlotStyle } from "../../types/card";
import {
  DEFAULT_SLOT_STYLE,
  LINE_HEIGHT_VALUE,
  OPACITY_VALUE,
  SIZE_SCALE,
  TRACKING_DELTA,
  type ResolvedSlotStyle,
} from "../slot-style";
import { baseFamily } from "./fonts";

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
  /** 산출물 테마 (08-31). 없으면 기본 테마로 그린다 — 옛 카드엔 이 값이 없다 */
  themeId?: string;
  /**
   * 「내 스타일」 (08-31). 있으면 테마의 색·폰트를 덮어쓴다 —
   * 계정 톤이 테마 3종보다 우선한다 (DESIGN.md §12).
   */
  brand?: Brand | null;
  /** 이 카드만의 배경색 (08-31). 계정 스타일보다 우선 */
  bgOverride?: string | null;
  /** 슬롯별 글자 조절 (08-31). 없는 슬롯은 레이아웃·테마 그대로 */
  styleOverrides?: Record<string, SlotStyle>;
  /**
   * 자유 배치 요소 (08-31 · 편집기). **있으면 레이아웃 대신 이걸로 그린다.**
   */
  elements?: SlideElement[];
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

/*
  색·글자 비율은 테마가 든다 (`./themes.ts`). 예전에는 여기 상수 하나로
  고정돼 있어서 온보딩에서 어떤 취향을 골랐든 결과물이 똑같았다 (08-31 해소).

  여백·이미지 비율의 «시안»은 아직 미결이다 (DESIGN.md §18) — 테마별 값도
  통상값 초안이며, 시안이 나오면 themes.ts만 갈아끼운다.
*/

// @TODO: 통상값 — 캔버스 1080×1080(1:1)
export const SLIDE_SIZE = 1080;

function el(
  type: string,
  style: Record<string, unknown>,
  children?: unknown,
  src?: string,
): Node {
  return { type, props: { style, children, ...(src ? { src } : {}) } };
}

function root(th: Theme, children: unknown[]): Node {
  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      backgroundColor: th.color.bg,
      color: th.color.ink,
      padding: th.type.pad,
    },
    children,
  );
}

/**
 * 그리기에 필요한 것 한 묶음 — 테마와 슬롯 조절값.
 * 레이아웃 함수마다 두 개를 따로 들고 다니면 인자가 계속 늘어난다.
 */
type Ctx = {
  th: Theme;
  ov: Record<string, SlotStyle>;
  /** 요소가 폰트를 따로 안 고르면 쓸 이름 */
  family: string;
};

/**
 * 조절값에서 «글자에 붙일 스타일»을 뽑는다. 자유 배치와 레이아웃이 같이 쓴다.
 *
 * 직접 찍은 색(`colorHex`)이 역할 색(`color`)을 이긴다 — 굳이 찍었다는 건
 * 그 색을 쓰겠다는 뜻이다. 대신 브랜드 색을 바꿔도 따라오지 않는다.
 */
function styleOf(ctx: Ctx, o: ResolvedSlotStyle): Record<string, unknown> {
  const { th } = ctx;
  const roleColor =
    o.color === "accent" ? th.color.accent : o.color === "sub" ? th.color.sub : undefined;
  const color = o.colorHex ?? roleColor;

  /*
    밑줄·취소선을 `textDecoration`으로 하지 않는다 (08-31 실측).

    satori는 이 속성을 **글자가 아니라 상자에** 걸어서, 밑줄이 글자 «위»에
    그어지고 취소선과 겹치면 한 줄로 뭉친다. 대신 테두리로 긋는다 —
    `borderBottom`은 글자 아래에 정확히 붙고, 취소선은 가운데 놓은 얇은 면으로 만든다.

    **글자 상자가 글자에 딱 맞아야** 선 길이가 맞으므로 `alignSelf`로 폭을 좁힌다.
  */
  const line = color ?? th.color.ink;
  const width = Math.max(2, Math.round(2 * SIZE_SCALE[o.size]));

  return {
    fontFamily: o.fontId ?? ctx.family,
    ...(color ? { color } : {}),
    ...(o.underline ? { borderBottom: `${width}px solid ${line}`, alignSelf: "flex-start" } : {}),
    ...(o.opacity !== "100" ? { opacity: OPACITY_VALUE[o.opacity] } : {}),
  };
}

/**
 * 글자 한 덩이. `size`는 «기준 크기»이고 테마의 `scale`이 곱해진다 —
 * 레이아웃끼리의 크기 관계(제목이 본문보다 얼마나 큰가)는 그대로 두고
 * 전체만 키우거나 줄이려는 것이다.
 *
 * `slot`을 받는 이유는 **사용자가 그 슬롯만 따로 조절했을 수 있어서**다 (08-31).
 * 조절값도 곱셈·덧셈이라 레이아웃이 정한 관계를 완전히 깨뜨리지는 않는다.
 */
function text(
  ctx: Ctx,
  slot: string,
  value: string,
  size: number,
  weight: 400 | 600 | 700,
  extra: Record<string, unknown> = {},
): Node {
  const { th } = ctx;
  const o = { ...DEFAULT_SLOT_STYLE, ...(ctx.ov[slot] ?? {}) };
  const adjusted = ctx.ov[slot] ?? {};

  /*
    정렬은 `textAlign`이 아니라 `justifyContent`다. 이 div는 `display: flex`라
    글자가 flex 아이템이 되고, flex 컨테이너에서는 textAlign이 아이템을 옮기지 못한다.
    (처음에 textAlign으로 썼다가 부제가 안 움직여서 08-31에 고쳤다)
  */
  const JUSTIFY = { left: "flex-start", center: "center", right: "flex-end" } as const;

  const styled = styleOf(ctx, o);

  /*
    취소선은 글자 «가운데»를 지나야 해서 테두리로는 안 된다.
    글자 위에 얇은 면을 겹쳐 놓는다 — 상자가 글자에 맞아야 길이가 맞으므로
    `alignSelf: flex-start`로 폭을 좁힌 뒤 그 안에 절대 위치로 얹는다.
  */
  const node = el(
    "div",
    {
      display: "flex",
      // px로 직접 넣었으면 그 값 그대로 — 테마 배율도 곱하지 않는다 (08-31)
      fontSize: o.sizePx ?? Math.round(size * th.type.scale * SIZE_SCALE[o.size]),
      // 볼드를 고르지 않았으면 레이아웃이 정한 굵기를 그대로 쓴다
      fontWeight: adjusted.weight ? (o.weight === "bold" ? 700 : 400) : weight,
      letterSpacing: th.type.tracking + TRACKING_DELTA[o.tracking],
      lineHeight: LINE_HEIGHT_VALUE[o.lineHeight],
      ...extra,
      /*
        조절값은 `extra`보다 **뒤에** 온다. 레이아웃이 박아둔 색
        (예: 부제의 `color: sub`)이 사용자가 고른 색을 덮어쓰면 안 된다.
      */
      ...styled,
      ...(adjusted.align
        ? { justifyContent: JUSTIFY[o.align], width: "100%", textAlign: o.align }
        : {}),
      ...(o.strike ? { position: "relative" } : {}),
    },
    o.strike
      ? [
          value,
          el("div", {
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            height: Math.max(2, Math.round(2 * SIZE_SCALE[o.size])),
            backgroundColor: (styled.color as string) ?? th.color.ink,
          }),
        ]
      : value,
  );

  return node;
}

/** 사진이 없을 때의 자리 표시 면. 폴백 사슬의 마지막은 text-only라 여기 안 온다 */
function imageArea(th: Theme, imageUrl: string | null, style: Record<string, unknown>): Node {
  if (imageUrl) {
    return el("img", { objectFit: "cover", ...style }, undefined, imageUrl);
  }
  return el("div", { display: "flex", backgroundColor: th.color.soft, ...style });
}

/**
 * 글자만 있는 레이아웃의 정렬 — 테마가 «가운데»면 가운데로.
 * list·image-* 에는 쓰지 않는다. 목록이나 사진 아래 설명까지 가운데로 몰면
 * 읽는 눈이 매 줄 시작점을 다시 찾아야 한다.
 */
function alignStyle(th: Theme): Record<string, unknown> {
  return th.type.align === "center"
    ? { alignItems: "center", textAlign: "center" }
    : { alignItems: "flex-start" };
}

/* ── 레이아웃 6종 ─────────────────────────────────────────── */

/** cover — 표지. 캡션의 hook을 크게 싣는다 */
function cover(ctx: Ctx, t: Record<string, string>): Node {
  const th = ctx.th;
  return root(ctx.th, [
    el(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        justifyContent: "center",
        gap: 32,
        ...alignStyle(ctx.th),
      },
      [
        text(ctx, "title", t.title ?? "", F.cover.title, 700, { lineHeight: 1.3 }),
        text(ctx, "subtitle", t.subtitle ?? "", F.cover.subtitle, 400, { color: th.color.sub }),
      ],
    ),
  ]);
}

/** text-only — 글자만. 이미지 폴백 3순위의 착지점 */
function textOnly(ctx: Ctx, t: Record<string, string>): Node {
  const th = ctx.th;
  return root(ctx.th, [
    el(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        justifyContent: "center",
        gap: 40,
        ...alignStyle(ctx.th),
      },
      [
        text(ctx, "title", t.title ?? "", F["text-only"].title, 700),
        text(ctx, "body", t.body ?? "", F["text-only"].body, 400, { lineHeight: th.type.lineHeight, color: th.color.ink }),
      ],
    ),
  ]);
}

/** image-top — 위 이미지 + 아래 글 */
function imageTop(ctx: Ctx, t: Record<string, string>, imageUrl: string | null): Node {
  const th = ctx.th;
  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      backgroundColor: th.color.bg,
      color: th.color.ink,
    },
    [
      imageArea(ctx.th, imageUrl, { width: "100%", height: 560 }),
      el(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          padding: `64px ${th.type.pad}px`,
          gap: 28,
        },
        [
          text(ctx, "title", t.title ?? "", F["image-top"].title, 700),
          text(ctx, "body", t.body ?? "", F["image-top"].body, 400, { lineHeight: th.type.lineHeight }),
        ],
      ),
    ],
  );
}

/** image-full — 전면 이미지 + 오버레이 글 */
function imageFull(ctx: Ctx, t: Record<string, string>, imageUrl: string | null): Node {
  const th = ctx.th;
  return el("div", { width: "100%", height: "100%", display: "flex", position: "relative" }, [
    imageArea(ctx.th, imageUrl, {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
    }),
    el(
      "div",
      {
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        padding: th.type.pad,
        backgroundColor: th.color.scrim,
      },
      // 사진 위 글자는 늘 흰색이다 — 테마 색을 쓰면 밝은 사진에서 읽히지 않는다
      [text(ctx, "title", t.title ?? "", F["image-full"].title, 700, { color: "#FFFFFF", lineHeight: 1.35 })],
    ),
  ]);
}

/** list — 번호 목록. «3가지 이유» 같은 구조. 슬롯 키 item1~item4 @TODO */
function list(ctx: Ctx, t: Record<string, string>): Node {
  const th = ctx.th;
  const items = ["item1", "item2", "item3", "item4"]
    .map((k) => t[k])
    .filter((v): v is string => Boolean(v));

  // 번호 원도 글자와 같이 커져야 한다 — 원만 그대로면 큰 글자 옆에서 단추처럼 보인다
  const dot = Math.round(72 * th.type.scale);

  return root(ctx.th, [
    text(ctx, "title", t.title ?? "", F.list.title, 700, { marginBottom: 48 }),
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
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: th.color.soft,
              fontSize: Math.round(34 * th.type.scale),
              fontWeight: 700,
              flexShrink: 0,
            },
            String(i + 1),
          ),
          text(ctx, `item${i + 1}`, item, F.list.item1, 400, { lineHeight: 1.5, flexGrow: 1 }),
        ]),
      ),
    ),
  ]);
}

/** closing — 마무리. 캡션의 cta·팔로우 유도 */
function closing(ctx: Ctx, t: Record<string, string>): Node {
  const th = ctx.th;
  return root(ctx.th, [
    el(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        gap: 40,
      },
      [
        text(ctx, "message", t.message ?? "", F.closing.message, 700, { textAlign: "center", lineHeight: 1.4 }),
        text(ctx, "cta", t.cta ?? "", F.closing.cta, 600, { color: th.color.sub }),
      ],
    ),
  ]);
}

/* ── 자유 배치 ────────────────────────────────────────────── */

/**
 * 좌표를 가진 요소들을 그린다 (08-31 · 편집기).
 *
 * 레이아웃(flexbox 자동 배치)과 달리 **요소마다 절대 좌표**를 쓴다.
 * 좌표는 0~1 비율이라 캔버스 크기가 바뀌어도 같은 값을 쓴다 —
 * 편집 화면(작게)과 산출물(1080)이 같은 데이터를 본다.
 *
 * 글자 크기는 상자 높이에서 뽑는다. 상자를 키우면 글자가 커지는 게
 * 직관에 맞고, 크기를 따로 저장하지 않아도 된다.
 */
function freeform(ctx: Ctx, elements: SlideElement[]): Node {
  const { th } = ctx;
  const sorted = [...elements].sort((a, b) => a.z - b.z);

  return el(
    "div",
    {
      width: "100%",
      height: "100%",
      display: "flex",
      position: "relative",
      backgroundColor: th.color.bg,
      color: th.color.ink,
    },
    sorted.map((e) => {
      const box = {
        position: "absolute",
        left: `${e.x * 100}%`,
        top: `${e.y * 100}%`,
        width: `${e.w * 100}%`,
        height: `${e.h * 100}%`,
        display: "flex",
      } as Record<string, unknown>;

      if (e.kind === "image") {
        return imageArea(th, e.imageUrl ?? null, { ...box, objectFit: "cover" });
      }

      const o = { ...DEFAULT_SLOT_STYLE, ...(e.style ?? {}) };
      const JUSTIFY = { left: "flex-start", center: "center", right: "flex-end" } as const;

      return el(
        "div",
        {
          ...box,
          alignItems: "flex-start",
          justifyContent: JUSTIFY[o.align],
          // 상자 높이에 비례한 글자 크기 — 상자를 키우면 글자가 커진다
          fontSize: o.sizePx ?? Math.round(SLIDE_SIZE * e.h * 0.42 * SIZE_SCALE[o.size]),
          fontWeight: o.weight === "bold" ? 700 : 400,
          letterSpacing: th.type.tracking + TRACKING_DELTA[o.tracking],
          lineHeight: LINE_HEIGHT_VALUE[o.lineHeight],
          color: th.color.ink,
          textAlign: o.align,
          ...styleOf(ctx, o),
        },
        e.text ?? "",
      );
    }),
  );
}

/* ── 진입점 ──────────────────────────────────────────────── */

export function buildLayout(content: SlideContent): Node {
  const { layoutId, texts, imageUrl } = content;
  const th = applyBrand(resolveTheme(content.themeId), content.brand, content.bgOverride);
  const ctx: Ctx = {
    th,
    ov: content.styleOverrides ?? {},
    family: baseFamily(content.brand),
  };

  // 자유 배치로 전환한 슬라이드는 레이아웃을 거치지 않는다 (08-31)
  if (content.elements && content.elements.length > 0) {
    return freeform(ctx, content.elements);
  }

  switch (layoutId) {
    case "cover":
      return cover(ctx, texts);
    case "text-only":
      return textOnly(ctx, texts);
    case "image-top":
      return imageTop(ctx, texts, imageUrl);
    case "image-full":
      return imageFull(ctx, texts, imageUrl);
    case "list":
      return list(ctx, texts);
    case "closing":
      return closing(ctx, texts);
    default:
      return textOnly(ctx, texts);
  }
}
