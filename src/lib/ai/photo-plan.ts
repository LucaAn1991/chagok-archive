import "server-only";

import { BASE_SYSTEM, callJson, obj } from "./client";

/**
 * 어느 사진을 어느 장에 넣을지 정한다 (09-02).
 *
 * **순서로 돌려 배정하던 것 위에 얹는 층이다** (`lib/imagegen/build-sheets.ts`의
 * `photosForSheet`). 돌려 배정은 중복과 「안 쓰이는 사진」은 없애주지만,
 * **무엇이 찍혔는지는 아무도 안 봤다** — 등산화 사진이 준비물 장이 아니라
 * 엉뚱한 장에 들어가도 그대로였다.
 *
 * 여기서는 클로드가 **사진을 직접 보고** 각 장의 문구와 맞춰 고른다.
 * 실패하면 돌려 배정으로 물러선다 — 사진 배정이 안 됐다고 카드를 못 만들면 안 된다
 * (DESIGN §12 「어디서 멈춰도 완성된다」).
 */

const PHOTO_PLAN_SCHEMA = obj(
  {
    assignments: {
      type: "array",
      items: obj(
        { sheet: { type: "integer" }, photos: { type: "array", items: { type: "integer" } } },
        ["sheet", "photos"],
      ),
    },
  },
  ["assignments"],
);

export type PhotoPlanInput = {
  /** 장마다 무슨 이야기가 들어가는지 — 사진을 고르는 근거다 */
  sheets: { role: string; lines: string[] }[];
  /** 후보 사진 (PNG/JPEG 바이트). 순서가 곧 번호다 */
  photos: Buffer[];
};

/**
 * 장마다 쓸 사진 번호를 돌려준다. 길이는 `sheets`와 같고,
 * 정할 수 없었던 장은 빈 배열이라 부르는 쪽이 돌려 배정으로 채운다.
 */
export async function planPhotoPlacement(input: PhotoPlanInput): Promise<number[][]> {
  const { sheets, photos } = input;
  if (sheets.length === 0 || photos.length === 0) return sheets.map(() => []);

  const result = await callJson<{ assignments: { sheet: number; photos: number[] }[] }>({
    system: BASE_SYSTEM,
    user: [
      `그림 ${photos.length}장은 사용자가 고른 사진이다. 순서대로 0번부터 ${photos.length - 1}번이다.`,
      "",
      "이 사진들을 넣을 카드뉴스 장은 이렇다:",
      ...sheets.map(
        (s, i) => `${i}. [${s.role}] ${s.lines.join(" / ").slice(0, 120)}`,
      ),
      "",
      "할 일: **각 장에 어울리는 사진을 골라라.** 장마다 1~3개, 어울리는 순서대로.",
      "",
      "규칙:",
      "- **사진에 무엇이 찍혔는지 보고 고른다.** 그 장의 글과 사진이 맞아야 한다.",
      "  준비물 이야기에는 물건이 보이는 사진을, 사람 이야기에는 사람이 있는 사진을.",
      "- **되도록 겹치지 않게 나눈다.** 같은 사진이 여러 장에 나오면 카드가 단조로워진다.",
      `  다만 사진(${photos.length}장)이 카드(${sheets.length}장)보다 적으면 겹칠 수밖에 없다 — 그때는 겹쳐도 된다.`,
      "- **각 장의 첫 번째 번호가 그 장의 주인공**이다. 가장 큰 자리에 들어간다.",
      "- 어느 사진도 어울리지 않는 장은 `photos`를 **빈 배열**로 둬라. 억지로 넣지 마라.",
      "- 모든 장을 빠짐없이 답해라.",
    ].join("\n"),
    schema: PHOTO_PLAN_SCHEMA,
    // 사진을 보는 일이라 대화 턴보다 무겁지만, 카드마다 한 번뿐이라 medium으로 둔다
    effort: "medium",
    // 그림은 질문 앞에 온다 — 무엇을 보고 답하라는 것인지가 먼저 와야 한다
    imagesBase64: photos.map((b) => b.toString("base64")),
  });

  /*
    **범위를 벗어난 번호는 버린다.** 스키마로는 못 막는 값이라 여기서 거른다 —
    없는 사진을 넘기면 그 장이 통째로 실패한다.
  */
  const out: number[][] = sheets.map(() => []);
  for (const a of result.assignments ?? []) {
    if (!Number.isInteger(a?.sheet) || a.sheet < 0 || a.sheet >= sheets.length) continue;
    out[a.sheet] = (Array.isArray(a.photos) ? a.photos : [])
      .filter((n) => Number.isInteger(n) && n >= 0 && n < photos.length)
      .slice(0, 3);
  }
  return out;
}
