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
  verdict?: string; // review 총평 한 줄 — 별점 위젯 대신 타이포로 표현
  items?: string[]; // routine · informational 의 정보 단위
  photo?: string; // /public 경로 — 사진 중심 포맷만
  photos?: string[]; // 콜라주용 여러 장
  attributes: StyleAttributes;
};

/**
 * 운동·자기관리 크리에이터 세트 — 3개 visual direction (08-28 재작업).
 * 이전 11종 시안은 폐기했다. «실제 인스타그램에 올려도 어색하지 않은가»가
 * 퀄리티 기준이다.
 *
 * 게시물 캔버스 안 색은 브랜드 토큰을 따르지 않는다 (08-28 사용자 확정) —
 * 브랜드 팔레트는 바깥 제품 UI의 정체성이고, 예시 게시물은 사용자의
 * 콘텐츠 세계를 보여주는 영역이다. 하드코딩 금지 규칙의 의도적 예외.
 */
const FITNESS_SET: StyleExample[] = [
  // A — Warm Lifestyle: 자연광 사진 70%+ · 따뜻한 뉴트럴 · 작은 기록 타이포
  {
    id: "direction_warm_01",
    contentFormat: "diary",
    title: "별거 없지만, 요즘의 루틴",
    note: "아침 스무 분이면 충분한 날들",
    meta: "AUG 28",
    photo: "/onboarding-samples/lifestyle.jpg",
    attributes: {
      imageUsage: "high",
      typography: "minimal",
      density: "low",
      mood: "warm-natural",
      decoration: "minimal",
    },
  },
  // B — Modern Editorial: 흑백 사진 + 표현적 타이포 · 비대칭 · 레이어링
  {
    id: "direction_editorial_01",
    contentFormat: "editorial",
    title: "요즘 운동이\n조금\n재밌어진 이유",
    note: "— 기록 셋, 습관 하나",
    photo: "/onboarding-samples/editorial-bw.jpg",
    attributes: {
      imageUsage: "high",
      typography: "expressive",
      density: "medium",
      mood: "modern",
      decoration: "editorial",
    },
  },
  // C — Graphic/Typographic: 사진 없이 오버사이즈 타이포 · 지그재그 정렬 · 도형
  {
    id: "direction_graphic_01",
    contentFormat: "statement",
    title: "운동 가기\n싫은 날에도\n이것만은\n지킨다.",
    note: "오늘도, 일단 가기",
    attributes: {
      imageUsage: "none",
      typography: "oversized",
      density: "low",
      mood: "bold-graphic",
      decoration: "shape",
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
