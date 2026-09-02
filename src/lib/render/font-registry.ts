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
  {
    /*
      갈무리 11 (09-02 추가) — SIL Open Font License 1.1, 상업적 사용 가능.
      원본은 `LICENSE-Galmuri.txt`로 같은 폴더에 뒀다. **지우지 말 것** —
      OFL은 폰트를 배포할 때 라이선스 전문을 함께 두도록 요구한다.

      비트맵이 박힌 판(`*Bitmap*.ttf`)이 아니라 **외곽선 판**을 골랐다.
      satori는 글자를 벡터로 그리므로 비트맵 글리프는 무시되어 빈칸이 된다.
    */
    id: "galmuri",
    label: "갈무리",
    hint: "네모난 픽셀 글씨 — 가볍고 장난스러운 느낌에 어울려요",
    files: [
      { file: "Galmuri11-Regular.ttf", weight: 400 },
      { file: "Galmuri11-Bold.ttf", weight: 700 },
    ],
  },
  {
    /*
      블랙한산스 — 파일은 09-01에 이미 들어와 있었는데 목록에 없어서
      아무도 쓸 수 없는 상태였다. 「대문자」 스타일이 이 글꼴을 쓴다.

      **굵기가 한 벌뿐**이라 400·700에 같은 파일을 넣는다. 원래 굵은 글꼴이고,
      없는 굵기를 요구하면 satori가 글자를 통째로 빠뜨린다.

      @TODO: 라이선스 파일이 없다. 갈무리처럼 원문을 함께 둘 것 (OFL로 알려져 있으나 확인 필요)
    */
    id: "black-han-sans",
    label: "블랙한산스",
    hint: "아주 굵은 제목용 — 짧게 외칠 때 어울려요",
    files: [
      { file: "BlackHanSans-Regular.ttf", weight: 400 },
      { file: "BlackHanSans-Regular.ttf", weight: 700 },
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
