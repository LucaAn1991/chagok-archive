import type { FontId } from "../../types/user";

/**
 * 카드뉴스에 쓸 수 있는 폰트 목록 (08-31).
 *
 * **전부 한글 특화 폰트만 둔다.** 라틴 전용 폰트를 쓰면 한글이 네모(□)로 나온다.
 *
 * **satori는 `.ttf`·`.otf`만 읽는다.** UI가 쓰는 `.woff2`는 못 읽어서,
 * 같은 폰트라도 렌더러용 `.ttf`를 따로 둬야 한다 (PLAN.md §8).
 * 그래서 파일이 아직 없는 폰트가 있을 수 있고, **없으면 목록에서 빠진다** —
 * 고를 수 없는 폰트가 화면에 뜨는 것보다 낫다.
 */

export type FontFile = {
  /** `src/lib/render/fonts/` 안의 파일 이름 */
  file: string;
  weight: 400 | 700;
};

export type FontDef = {
  id: FontId;
  /** 화면에 보이는 이름 */
  label: string;
  /** 한 줄 성격 — 고를 때 판단 근거 */
  hint: string;
  files: FontFile[];
};

export const BUILT_IN_FONTS: FontDef[] = [
  {
    id: "pretendard",
    label: "프리텐다드",
    hint: "깔끔한 고딕 — 정보 전달에 무난해요",
    files: [
      { file: "Pretendard-Regular.ttf", weight: 400 },
      { file: "Pretendard-Bold.ttf", weight: 700 },
    ],
  },
  {
    id: "nanum-square-neo",
    label: "나눔스퀘어 네오",
    hint: "또렷한 고딕 — 제목이 힘있게 보여요",
    files: [
      { file: "NanumSquareNeo-Regular.ttf", weight: 400 },
      { file: "NanumSquareNeo-Bold.ttf", weight: 700 },
    ],
  },
  {
    id: "nanum-myeongjo",
    label: "나눔명조",
    hint: "부드러운 명조 — 기록·에세이에 어울려요",
    files: [
      { file: "NanumMyeongjo-Regular.ttf", weight: 400 },
      { file: "NanumMyeongjo-Bold.ttf", weight: 700 },
    ],
  },
];

export const DEFAULT_FONT_ID: FontId = "pretendard";

export function findFont(id: string | null | undefined): FontDef {
  return (
    BUILT_IN_FONTS.find((f) => f.id === id) ??
    BUILT_IN_FONTS.find((f) => f.id === DEFAULT_FONT_ID)!
  );
}
