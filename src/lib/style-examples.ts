import type { StyleAttributes } from "@/types";

/**
 * 온보딩 «게시물 취향» 샘플 세트 (08-28 확정 스펙).
 *
 * 같은 글의 템플릿 6종이 아니다 — 한 크리에이터의 Instagram 피드에서
 * 볼 법한 **서로 다른 게시물 6개**다. 선택 결과는 특정 템플릿 고정이
 * 아니라 visual attributes + content format 취향의 재료가 된다.
 *
 * 화면(그리기)과 API 라우트(검증·속성 매핑)가 같이 쓴다.
 * 내부 스타일 이름은 사용자에게 노출하지 않는다.
 * 문구·사진은 데모 콘텐츠 — 실사진·시안 확정 시 교체 (@TODO).
 */

export type ContentFormat =
  | "thought" // 짧은 생각 · 인사이트
  | "editorial" // 사진 + 에세이·매거진
  | "routine" // 데일리 루틴 정보
  | "statement" // 한 문장 비주얼 스테이트먼트
  | "comparison" // 비교·변화 (Before → After)
  | "diary" // 사진 중심 기록
  | "collage" // 사진 콜라주 (photo dump)
  | "checklist" // 체크리스트 (저장 유도형)
  | "quote" // 인용·글귀
  | "review" // 사용 후기 (별점·장단점)
  | "informational"; // 정보 카드뉴스

export type StyleExample = {
  id: string;
  contentFormat: ContentFormat;
  title: string; // 줄바꿈은 \n
  note?: string; // 보조 문구 (thought 본문 · diary 기록 줄)
  meta?: string; // diary WEEK 표시 등
  items?: string[]; // routine · informational 의 정보 단위
  photo?: string; // /public 경로 — 사진 중심 포맷만
  photos?: string[]; // 콜라주용 여러 장
  attributes: StyleAttributes;
};

/** 운동·자기관리·루틴 크리에이터 세트 */
const FITNESS_SET: StyleExample[] = [
  {
    id: "example_thought_01",
    contentFormat: "thought",
    title: "꾸준함에 대하여",
    note: "잘하는 날보다\n계속하는 날이 많기를",
    attributes: {
      imageUsage: "low",
      typography: "large-clean",
      density: "low",
      mood: "calm",
      decoration: "minimal",
    },
  },
  {
    id: "example_editorial_01",
    contentFormat: "editorial",
    title: "요즘 내가\n아침 운동을 하는 이유",
    photo: "/onboarding-samples/morning.jpg",
    attributes: {
      imageUsage: "medium-high",
      typography: "editorial",
      density: "medium",
      mood: "sophisticated",
      decoration: "low",
    },
  },
  {
    id: "example_routine_01",
    contentFormat: "routine",
    title: "오늘의 작은 루틴 3가지",
    items: ["물 한 잔으로 시작하기", "스트레칭 5분", "한 줄 기록 남기기"],
    attributes: {
      imageUsage: "low",
      typography: "soft",
      density: "medium",
      mood: "warm",
      decoration: "soft",
    },
  },
  {
    id: "example_statement_01",
    contentFormat: "statement",
    title: "의욕보다\n중요한 건\n환경이다",
    attributes: {
      imageUsage: "low",
      typography: "bold",
      density: "low",
      mood: "energetic",
      decoration: "medium",
    },
  },
  {
    id: "example_comparison_01",
    contentFormat: "comparison",
    title: "한 달 전의 나, 지금의 나",
    meta: "한 달 뒤",
    // «라벨|문구» 쌍 — 위 패널(전) · 아래 패널(후)
    items: ["한 달 전|작심삼일 반복", "지금|주 3회 루틴 유지"],
    attributes: {
      imageUsage: "low",
      typography: "clean",
      density: "medium",
      mood: "motivational",
      decoration: "low",
    },
  },
  {
    id: "example_diary_01",
    contentFormat: "diary",
    title: "이번 주 운동 기록",
    meta: "WEEK 2",
    note: "월 · 수 · 금 완료",
    photo: "/onboarding-samples/workout.jpg",
    attributes: {
      imageUsage: "high",
      typography: "clean",
      density: "low",
      mood: "natural",
      decoration: "minimal",
    },
  },
  {
    id: "example_collage_01",
    contentFormat: "collage",
    title: "8월의\n운동 기록 모음",
    note: "사진 4장",
    photos: ["/onboarding-samples/morning.jpg", "/onboarding-samples/workout.jpg"],
    attributes: {
      imageUsage: "high",
      typography: "minimal",
      density: "medium",
      mood: "casual",
      decoration: "low",
    },
  },
  {
    id: "example_checklist_01",
    contentFormat: "checklist",
    title: "운동 가기 전\n체크리스트",
    items: ["물통 챙기기", "수건 · 이어폰", "스트레칭 5분", "오늘 할 운동 정하기"],
    attributes: {
      imageUsage: "low",
      typography: "clean",
      density: "medium-high",
      mood: "practical",
      decoration: "functional",
    },
  },
  {
    id: "example_quote_01",
    contentFormat: "quote",
    title: "우리는 반복적으로 행동하는 존재다.\n탁월함은 행동이 아니라 습관이다.",
    note: "— 아리스토텔레스",
    attributes: {
      imageUsage: "low",
      typography: "literary",
      density: "low",
      mood: "emotional",
      decoration: "frame",
    },
  },
  {
    id: "example_review_01",
    contentFormat: "review",
    title: "폼롤러,\n솔직 후기",
    meta: "3주 사용",
    note: "#내돈내산 #폼롤러",
    // «라벨|문구» — 좋았던 점 / 아쉬운 점
    items: [
      "좋았던 점|아침 뻐근함이 줄었어요",
      "좋았던 점|하루 5분이면 충분해요",
      "아쉬운 점|첫 주엔 조금 아파요",
    ],
    attributes: {
      imageUsage: "low",
      typography: "clean",
      density: "medium-high",
      mood: "candid",
      decoration: "functional",
    },
  },
  {
    id: "example_info_01",
    contentFormat: "informational",
    title: "초보자가 놓치기 쉬운\n운동 습관 3가지",
    items: ["시간을 정한다", "목표를 작게 잡는다", "기록을 남긴다"],
    attributes: {
      imageUsage: "low",
      typography: "structured",
      density: "high",
      mood: "informative",
      decoration: "functional",
    },
  },
];

/**
 * 분야별 샘플 세트 — ①단계에서 입력한 콘텐츠 방향(field)에 맞는 세트로
 * 바꿀 수 있는 구조. MVP는 fitness 하나다.
 * @TODO: 뷰티·카페 등 세트 추가 또는 AI 동적 생성 (스펙 §5)
 */
export const SAMPLE_SETS: Record<string, StyleExample[]> = {
  fitness: FITNESS_SET,
};

export function getSampleSet(_field?: string): StyleExample[] {
  return SAMPLE_SETS.fitness;
}

export const STYLE_EXAMPLES = SAMPLE_SETS.fitness;
export const STYLE_EXAMPLE_IDS = STYLE_EXAMPLES.map((e) => e.id);
