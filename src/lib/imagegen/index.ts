import "server-only";

import type { StyleId } from "../../types/card";
import { TEMPLATE_SHEETS, type TemplateSheet } from "../render/template-sheets";
import { editImage, isImageGenConfigured } from "./gptproto";
import { templateUrl } from "./host";
import { verifyCard, type Verdict } from "./verify";

/**
 * 시안 템플릿으로 카드 한 장을 만든다 — **만들고, 보고, 안 되면 다시** (09-02).
 *
 * ```
 * 템플릿 올리기 → 글자 바꿔치기 → 클로드가 보고 판정 → 통과? 끝
 *                                            ↓ 실패
 *                                      ok:false로 돌려준다
 *                                      (부르는 쪽이 렌더러로 그린다)
 * ```
 *
 * **자동으로 다시 만들지 않는다** (09-02 결정). 처음엔 최대 3회까지 다시 만들었는데
 * 실측에서 **한 장이 세 번 다 같은 이유로 실패하며 7분과 세 장 값을 썼다.**
 * 될 재시도는 대개 첫 판에 되고, 안 될 재시도는 몇 번을 해도 안 된다.
 *
 * 대신 **실패한 장은 렌더러로 채워 내보내고, 다시 만들지는 사용자가 정한다.**
 * 결과를 보고 「이 정도면 됐다」면 그대로 쓰고, 아니면 그 장만 다시 만든다
 * (`POST /api/cards/[cardId]/slides/[order]/regenerate`).
 * 「AI가 먼저 정하고 사용자는 확인·수정」(DESIGN.md §1)과 같은 결이다.
 *
 * 렌더러가 물러설 자리라는 점은 그대로다 — 시안만큼 예쁘진 않아도 **항상 성공한다.**
 * `DESIGN.md` §12 「어디서 멈춰도 완성된다」.
 */

export { isImageGenConfigured };

/**
 * 한 번만 만든다 (09-02).
 *
 * 그림 생성이 실패해도 **여기서 다시 만들지 않는다.** 한 번이 2분이라 재시도는
 * 곧 사용자의 대기 시간이고, 실측에서 세 번 다 같은 이유로 실패했다.
 * 다시 만들지는 결과를 본 사용자가 정한다.
 */
const MAX_ATTEMPTS = 1;

export type SheetRequest = {
  styleId: StyleId;
  /** 템플릿 몇 번째 장인가 (0부터) */
  index: number;
  /** 이 장에 들어갈 문구 — `TemplateSheet.slots` 순서와 맞아야 한다 */
  lines: string[];
  /** 사진을 무엇으로 바꿀지. 비우면 시안의 사진을 그대로 둔다 */
  photoDirection?: string;
  /**
   * 사용자가 올린 사진 (09-02). 주소와 내용을 함께 받는다 —
   * 주소는 생성에 넘기고, 내용은 «그대로 들어갔는지» 검사할 때 원본으로 쓴다.
   *
   * 여기 값이 있으면 `photoDirection`은 무시된다. 올린 사진이 있는데
   * 다른 사진을 그려 넣으면 안 된다 (DESIGN.md §12 폴백 사슬 — 사용자 사진이 1순위).
   */
  photos?: { url: string; png: Buffer }[];
  /** 브랜드 강조색 `#RRGGBB`. 비우면 시안 색 그대로 */
  accent?: string | null;
  /**
   * 검사를 돌릴지 (09-03). 기본 true. **「이 장만 다시 만들기」에서는 false로 끈다.**
   *
   * 자동 생성은 검사로 «시안대로 나왔나»를 봐서 실패한 장만 렌더러로 물러선다 —
   * 그건 사용자가 안 보는 자동 판정이라 필요하다.
   *
   * 하지만 사용자가 손수 다시 만들 때는 **결과를 옆에 놓고 직접 고른다.** 여기서
   * 검사가 미리 버리면 «토큰만 쓰고 아무것도 못 본» 손해가 된다. 그림만 나오면
   * 무조건 돌려주고, 쓸지 말지는 사용자가 정한다.
   */
  verify?: boolean;
  /**
   * 사용자가 「이렇게 바꿔줘」로 적은 자유 지시 (09-03). 「이 장만 다시 만들기」에서만.
   *
   * **기대치를 낮춰 다룬다.** gpt-image-2는 글자 치환은 잘하지만 배치·크기 같은
   * 자유 요청은 될 때도 안 될 때도 있다. 그래서 **디자인 못박음 뒤에** 부탁조로 얹는다 —
   * 「이 디자인을 유지하라」를 이기지 않게 두고, 여지가 있으면 반영되게.
   */
  userRequest?: string;
};

export type SheetResult =
  | { ok: true; png: Buffer; attempts: number; sheet: TemplateSheet }
  | { ok: false; reason: string; attempts: number; lastVerdict?: Verdict };

/**
 * 편집 지시문을 만든다.
 *
 * **«디자인을 유지하라»가 먼저 온다.** 바꿀 것을 먼저 적으면 모델이 새로 그리려
 * 들어서 레이아웃이 무너진다. 지킬 것을 못박고 나서 바꿀 것을 준다.
 *
 * `problems`는 다시 만들 때만 들어간다 — 앞 시도에서 무엇이 틀렸는지 알려주면
 * 같은 실수를 덜 반복한다.
 */
function buildPrompt(req: SheetRequest, sheet: TemplateSheet, problems: string[]): string {
  const photos = req.photos ?? [];
  const parts = [
    ...(photos.length > 0
      ? [
          `The FIRST image is the design template. The next ${photos.length} image(s) are the user's own photos.`,
          "",
        ]
      : []),
    "Keep this exact design: same layout, same photo frames and shapes, same typography style,",
    "same spacing and same background. Do not move, resize or restyle the layout blocks.",
    "",
    /*
      **각 줄을 슬롯에 짝지어 준다** (09-03). 「위→아래 순서로」만 말하면 큰 제목이
      «디자인 장식»으로 오해돼 안 바뀌었다(특히 캐릭터 5번의 「비교 페이지」).
      슬롯 이름(한국어)까지 붙여 «이 줄은 맨 위 큰 제목» 처럼 자리를 못박는다.
      슬롯 수와 줄 수가 어긋나면 이름 없이 순서로만 준다(옛 방식).
    */
    "Replace each placeholder text slot with the matching line below. Each line goes to a specific slot:",
    ...(sheet.slots.length === req.lines.length
      ? req.lines.map((l, i) => `- Slot ${i + 1} (${sheet.slots[i]}): "${l}"`)
      : req.lines.map((l, i) => `${i + 1}) "${l}"`)),
    "",
    "**Every text slot is a placeholder — including the large title/heading and any small labels.**",
    "Replace ALL of them. Korean guide words that name the template's purpose",
    "(e.g. «비교 페이지», «흐름을 보여주는 페이지», «Notice», «Brand») are placeholders and must NOT remain.",
    "If a line is longer than the original, reduce its font size so it fits the same area.",
    "Render all Korean characters exactly as written: correct, legible Hangul. Do not invent or distort characters.",
  ];

  if (req.accent) {
    parts.push(
      "",
      `Change the brand accent color to ${req.accent} — apply it to badges, thin rules, numbers and small labels.`,
    );
  }
  if (photos.length > 0) {
    /*
      **«다시 그리지 마라»를 못박는다.** 이 한 줄이 있고 없고가 갈린다 —
      없으면 모델이 «비슷한» 사진을 새로 그려서, 사용자가 찍은 그 물건이 아니게 된다.
      실측에서 이 문장을 넣으니 거품 무늬·나뭇결까지 그대로 왔다.
    */
    parts.push(
      "",
      "Place the user's photo(s) into the photo frame(s) of the design, cropped to fit the frame shape.",
      /*
        **순서를 못박는다** (09-02). 부르는 쪽이 장마다 첫 사진을 한 칸씩 밀어 보내는데
        (`photosForSheet`), 모델이 그중 아무거나 고르면 그 배정이 헛수고가 된다.
      */
      "Use them in the order given: the first user photo goes in the main (largest) frame.",
      "If the design has fewer frames than photos, use only the first ones and ignore the rest.",
      "**Do not redraw, restyle or reinterpret the user's photos — they must remain the same photographs.**",
      "Cropping and resizing to fit the frame is fine; changing what is in the photo is not.",
    );
  } else if (req.photoDirection) {
    parts.push(
      "",
      `Replace every photo with: ${req.photoDirection}. Keep the same crop shape, the same number of photos and the same lighting mood.`,
    );
  }
  if (req.userRequest) {
    /*
      자유 지시는 **맨 뒤, 부탁조로** 넣는다 (09-03). 앞의 「Keep this exact design」을
      이기면 레이아웃이 무너지므로, «가능하면(if possible), 디자인을 깨지 않는 선에서»로
      묶는다. 안 먹혀도 «부탁이 안 통한 것»이지 고장이 아니다.
    */
    parts.push(
      "",
      `If possible, also honor this request from the user, but only without breaking the design above: ${req.userRequest}`,
    );
  }
  if (problems.length > 0) {
    parts.push(
      "",
      "The previous attempt had these problems. Fix them:",
      ...problems.map((p) => `- ${p}`),
    );
  }
  return parts.join(" ");
}

/**
 * 한 장을 만든다. **던지지 않는다** — 여러 장을 동시에 만들 때
 * 한 장이 던지면 `Promise.all`이 통째로 무너진다.
 */
export async function generateSheet(req: SheetRequest): Promise<SheetResult> {
  if (!isImageGenConfigured()) {
    return { ok: false, reason: "이미지 생성이 설정되지 않았습니다.", attempts: 0 };
  }

  const sheets = TEMPLATE_SHEETS[req.styleId];
  const sheet = sheets?.[req.index];
  if (!sheet) {
    return { ok: false, reason: `템플릿에 ${req.index + 1}번째 장이 없습니다.`, attempts: 0 };
  }

  const hosted = await templateUrl(req.styleId, sheet.file);
  if (!hosted.ok) return { ok: false, reason: hosted.reason, attempts: 0 };

  let problems: string[] = [];
  let lastVerdict: Verdict | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const made = await editImage({
      sourceUrl: hosted.url,
      photoUrls: (req.photos ?? []).map((p) => p.url),
      prompt: buildPrompt(req, sheet, problems),
    });
    if (!made.ok) {
      // 만들기 자체가 실패했다 — 검사할 그림이 없으니 그대로 다시 시도한다
      if (attempt === MAX_ATTEMPTS) {
        return { ok: false, reason: made.reason, attempts: attempt };
      }
      continue;
    }

    /*
      **검사를 끄면 그림만 나오면 통과다** (09-03). 사용자가 직접 다시 만들 때다 —
      좋고 나쁨은 비교 화면에서 사람이 정한다. 여기서 미리 버리지 않는다.
    */
    if (req.verify === false) {
      return { ok: true, png: made.png, attempts: attempt, sheet };
    }

    let verdict: Verdict;
    try {
      verdict = await verifyCard({
        png: made.png,
        expected: req.lines,
        // 올린 사진이 있으면 «그대로 들어갔는지»까지 본다
        sourcePhotos: (req.photos ?? []).map((p) => p.png),
      });
    } catch {
      /*
        검사가 못 돌았다고 카드를 버리지 않는다 — 그림은 나왔고, 검사기가
        답을 못 준 것뿐이다. 통과로 보고 내보낸다. 검사 실패로 멀쩡한 결과를
        버리면 사용자는 이유도 모른 채 더 나쁜 결과(폴백)를 받는다.
      */
      return { ok: true, png: made.png, attempts: attempt, sheet };
    }

    lastVerdict = verdict;
    if (verdict.ok) return { ok: true, png: made.png, attempts: attempt, sheet };

    problems = verdict.problems;
  }

  return {
    ok: false,
    reason: lastVerdict?.problems.join(" / ") || "검사를 통과하지 못했습니다.",
    attempts: MAX_ATTEMPTS,
    lastVerdict,
  };
}

/**
 * 여러 장을 **동시에** 만든다.
 *
 * 순차로 하면 장당 2분이라 6장에 13분이다. 동시에 던지면 3분 안쪽으로 끝난다
 * (실측 6장 153초). 실패한 장은 `ok: false`로 남고, 부르는 쪽이 그 자리만
 * 렌더러로 채운다.
 */
export async function generateSheets(reqs: SheetRequest[]): Promise<SheetResult[]> {
  return Promise.all(reqs.map((r) => generateSheet(r)));
}
