import type { Timestamp } from "firebase/firestore";

/** 계정 + 온보딩에서 받은 콘텐츠 설정. Firestore 문서 ID = Firebase Auth uid */
export type User = {
  uid: string; // Firebase Auth uid. 문서 ID와 동일
  email: string; // 로그인 이메일

  /** 온보딩 2문항 (F1 — 08-28 축소). 설정-콘텐츠에서 나중에 수정 가능 */
  field: string; // 활동 분야·주로 만드는 콘텐츠 (예: "홈트레이닝")
  uploadFrequency: number; // 주당 업로드 목표 횟수. 캘린더 자동 배치(F4)의 간격 계산에 쓴다
  uploadDays?: number[]; // 업로드 요일 (0=월 … 6=일). 개수 = uploadFrequency. 08-28 추가 — 이전 문서엔 없을 수 있다
  /**
   * 온보딩 «게시물 취향» — 선택한 예시 id + 그 시각 속성 (08-28).
   * 특정 템플릿 반복이 아니라 취향 속성(사진 비중·밀도·무드…)의 재료다.
   * «잘 모르겠어요»면 null.
   */
  visualPreferences?: {
    selectedExamples: string[]; // src/lib/style-examples.ts 의 id
    attributes: StyleAttributes[]; // 선택 예시의 시각 속성 — 서버가 id로 매핑해 저장
    contentFormats: string[]; // 선택 예시의 콘텐츠 형식 (thought·editorial·routine·statement·diary·informational)
  } | null;

  /** 설정-콘텐츠에서 등록 (08-28 온보딩에서 이동). 정하기 전까지 null·빈 배열 */
  tone: ToneKey | null; // 말투. 예시 문장 카드 4종 중 선택 → 캡션 생성(F7)에 반영
  avoidExpressions: string[]; // 피할 표현. 캡션 생성 시 프롬프트의 금지 목록으로 들어간다

  /**
   * 「내 스타일」 — 카드뉴스 산출물의 색·폰트 (08-31 · DESIGN.md §12).
   *
   * **계정 단위다.** 한 번 정하면 이후 만드는 모든 카드에 적용된다 —
   * 인스타 계정에는 톤이 있고 카드뉴스가 그걸 따라야 피드가 흐트러지지 않는다.
   * 정하기 전에는 null이고, 그때는 카드의 테마(themeId)가 그대로 쓰인다.
   */
  brand?: Brand | null;

  onboardedAt: Timestamp | null; // null이면 온보딩 미완료 → 라우트 가드가 /onboarding으로 보낸다
  createdAt: Timestamp;
};

/** 게시물 예시 하나가 갖는 시각 속성 — AI가 조합할 취향 재료 (스펙 §9) */
export type StyleAttributes = {
  imageUsage: string; // low · medium · high …
  typography: string; // large-clean · editorial · soft · bold · minimal · structured
  density: string; // low · medium · high
  mood: string; // calm · sophisticated · warm · energetic · natural · informative
  decoration: string; // minimal · low · soft · medium · functional
};

/**
 * 카드뉴스 폰트 (08-31). 전부 한글 특화 — 라틴 전용을 쓰면 한글이 네모로 나온다.
 * `custom`은 사용자가 올린 폰트를 뜻하고, 실제 파일 주소는 `Brand.customFontUrl`에 있다.
 * 파일·이름은 `lib/render/font-registry.ts`.
 */
export type FontId = "pretendard" | "nanum-square-neo" | "nanum-myeongjo" | "custom";

/**
 * 「내 스타일」의 값.
 *
 * **글자색은 없다.** 배경색의 명도로 자동 계산한다 — 둘 다 고르게 하면
 * DESIGN.md §15의 대비 기준을 못 넘기는 조합이 나온다.
 */
export type Brand = {
  /** 배경색. `#RRGGBB` */
  bg: string;
  /** 강조색. 점·선 같은 작은 면에만 쓴다. `#RRGGBB` */
  accent: string;
  fontId: FontId;
  /** fontId가 'custom'일 때 올린 폰트 파일의 주소. 아니면 null */
  customFontUrl?: string | null;
  /** 올린 폰트의 원래 파일 이름 — 화면에 「무엇을 올렸는지」 보여주려고 */
  customFontName?: string | null;
};

/** 설정-콘텐츠에서 예시 문장 2~3줄짜리 카드 4종으로 보여주고 고르게 한다 */
export type ToneKey = "friendly" | "calm" | "energetic" | "professional";
// @TODO: 4종의 실제 키·예시 문장 미확정 — 설정-콘텐츠 화면 작업 시 필요
