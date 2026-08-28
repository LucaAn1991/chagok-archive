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
    attributes: StyleAttributes[]; // 선택 예시의 속성 — 서버가 id로 매핑해 저장
  } | null;

  /** 설정-콘텐츠에서 등록 (08-28 온보딩에서 이동). 정하기 전까지 null·빈 배열 */
  tone: ToneKey | null; // 말투. 예시 문장 카드 4종 중 선택 → 캡션 생성(F7)에 반영
  avoidExpressions: string[]; // 피할 표현. 캡션 생성 시 프롬프트의 금지 목록으로 들어간다

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

/** 설정-콘텐츠에서 예시 문장 2~3줄짜리 카드 4종으로 보여주고 고르게 한다 */
export type ToneKey = "friendly" | "calm" | "energetic" | "professional";
// @TODO: 4종의 실제 키·예시 문장 미확정 — 설정-콘텐츠 화면 작업 시 필요
