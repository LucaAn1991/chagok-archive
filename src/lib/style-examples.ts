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
  | "diary" // 사진 중심 기록
  | "informational"; // 정보 카드뉴스

export type StyleExample = {
  id: string;
  contentFormat: ContentFormat;
  title: string; // 줄바꿈은 \n
  note?: string; // 보조 문구 (thought 본문 · diary 기록 줄)
  meta?: string; // diary WEEK 표시 등
  items?: string[]; // routine · informational 의 정보 단위
  photo?: string; // /public 경로 — 사진 중심 포맷만
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
