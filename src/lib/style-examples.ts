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

/** 9개 고정 Visual Frame — 렌더러가 이 값으로 그린다 (세트가 늘어도 재사용) */
export type Direction =
  | "warm" // Warm Lifestyle
  | "editorial" // Modern Editorial
  | "graphic" // Clean Typography
  | "casual" // Casual Photo Diary
  | "soft" // Soft Editorial
  | "info" // Clean Informational
  | "boldphoto" // Bold Photo + Type
  | "collage" // Personal Collage
  | "product"; // Product / Recommendation

export type StyleExample = {
  id: string;
  direction: Direction;
  contentFormat: ContentFormat;
  kicker?: string; // 세로 캡션·상단 라벨 (editorial·soft 등 주제별 문구)
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
  // 1. Warm Lifestyle — 사진 중심 · 개인적 · 편안 (유지)
  {
    id: "direction_warm_01",
    direction: "warm",
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
  // 2. Modern Editorial — 사진+타이포 · 세련 · 표현적 (유지)
  {
    id: "direction_editorial_01",
    direction: "editorial",
    kicker: "WORKOUT ESSAY",
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
  // 3. Clean Typography — 인스타에서 흔한 깔끔한 텍스트 카드 (08-28 재작업)
  {
    id: "direction_graphic_01",
    direction: "graphic",
    contentFormat: "statement",
    title: "운동 가기\n싫은 날에도\n이것만은 지킨다.",
    meta: "오늘의 다짐",
    attributes: {
      imageUsage: "none",
      typography: "clean-type",
      density: "low",
      mood: "sincere",
      decoration: "minimal",
    },
  },
  // 4. Casual Photo Diary — 디자인 안 한 듯 자연스러운 피드
  {
    id: "direction_casual_01",
    direction: "casual",
    contentFormat: "diary",
    title: "일요일 아침 러닝",
    note: "뛰고 나서 마시는 커피가 제일 맛있다",
    meta: "10.12 SUN",
    photos: ["/onboarding-samples/stairs.jpg", "/onboarding-samples/gym.jpg"],
    attributes: {
      imageUsage: "high",
      typography: "minimal",
      density: "low",
      mood: "candid",
      decoration: "none",
    },
  },
  // 5. Soft Editorial — 밝고 부드러운 사진 + 여백 + 섬세한 타이포
  {
    id: "direction_soft_01",
    direction: "soft",
    kicker: "MORNING FLOW",
    contentFormat: "editorial",
    title: "가볍게, 그러나 꾸준하게",
    note: "바닷가 모닝 요가",
    photo: "/onboarding-samples/beach.jpg",
    attributes: {
      imageUsage: "high",
      typography: "delicate",
      density: "low",
      mood: "soft-bright",
      decoration: "minimal",
    },
  },
  // 6. Clean Informational — 정보형이지만 UI 박스 없이 사진+번호+타이포
  {
    id: "direction_info_01",
    direction: "info",
    contentFormat: "informational",
    title: "운동하면서\n알게 된 것 3가지",
    items: ["몸은 거짓말을 하지 않는다", "쉬는 것도 운동이다", "기록이 꾸준함을 만든다"],
    photo: "/onboarding-samples/gym.jpg",
    attributes: {
      imageUsage: "medium",
      typography: "structured-clean",
      density: "medium",
      mood: "informative",
      decoration: "minimal",
    },
  },
  // 7. Bold Photo + Type — 큰 사진 크롭 + 아주 큰 타이포 겹침
  {
    id: "direction_boldphoto_01",
    direction: "boldphoto",
    contentFormat: "statement",
    title: "오늘도\n어김없이",
    meta: "DAY 47",
    photo: "/onboarding-samples/track.jpg",
    attributes: {
      imageUsage: "high",
      typography: "oversized",
      density: "low",
      mood: "energetic",
      decoration: "high-contrast",
    },
  },
  // 8. Personal Collage — contemporary editorial collage (스크랩북 아님)
  {
    id: "direction_collage_01",
    direction: "collage",
    contentFormat: "collage",
    title: "시월의 운동들",
    meta: "10.01 — 10.28",
    photos: [
      "/onboarding-samples/studio.jpg",
      "/onboarding-samples/stairs.jpg",
      "/onboarding-samples/beach.jpg",
    ],
    attributes: {
      imageUsage: "high",
      typography: "minimal",
      density: "medium",
      mood: "personal-modern",
      decoration: "collage",
    },
  },
  // 9. Product / Recommendation — 크리에이터의 «요즘 잘 쓰는 것»
  {
    id: "direction_product_01",
    direction: "product",
    contentFormat: "review",
    title: "1kg 아령, 3개월째",
    note: "손목에 무리 없이, 딱 좋은 무게",
    meta: "PICK 01",
    photo: "/onboarding-samples/gear.jpg",
    attributes: {
      imageUsage: "high",
      typography: "clean",
      density: "low",
      mood: "curated",
      decoration: "minimal",
    },
  },
];

/**
 * 분야별 샘플 세트 — ①단계에서 입력한 콘텐츠 방향(field)에 맞는 세트로
 * 바꿀 수 있는 구조. MVP는 fitness 하나다.
 * @TODO: 뷰티·카페 등 세트 추가 또는 AI 동적 생성 (스펙 §5)
 */
/** 뷰티·스킨케어 크리에이터 세트 — 같은 9개 Visual Frame에 뷰티 콘텐츠 (08-28) */
const BEAUTY_SET: StyleExample[] = [
  {
    id: "beauty_warm_01",
    direction: "warm",
    contentFormat: "diary",
    title: "별거 없지만, 요즘의 저녁 루틴",
    note: "세안 후 십 분, 나를 돌보는 시간",
    meta: "AUG 28",
    photo: "/onboarding-samples/beauty-spa.jpg",
    attributes: {
      imageUsage: "high",
      typography: "minimal",
      density: "low",
      mood: "warm-natural",
      decoration: "minimal",
    },
  },
  {
    id: "beauty_editorial_01",
    direction: "editorial",
    contentFormat: "editorial",
    kicker: "SKIN ESSAY",
    title: "요즘 스킨케어가\n조금\n단순해진 이유",
    note: "— 덜어내니 남은 것들",
    photo: "/onboarding-samples/beauty-portrait.jpg",
    attributes: {
      imageUsage: "high",
      typography: "expressive",
      density: "medium",
      mood: "modern",
      decoration: "editorial",
    },
  },
  {
    id: "beauty_graphic_01",
    direction: "graphic",
    contentFormat: "statement",
    title: "피부가 좋아지는 건\n화장품보다\n습관이었다.",
    meta: "오늘의 기록",
    attributes: {
      imageUsage: "none",
      typography: "clean-type",
      density: "low",
      mood: "sincere",
      decoration: "minimal",
    },
  },
  {
    id: "beauty_casual_01",
    direction: "casual",
    contentFormat: "diary",
    title: "일요일 아침 홈케어",
    note: "팩 올려두고 마시는 커피가 제일 맛있다",
    meta: "10.12 SUN",
    photos: [
      "/onboarding-samples/beauty-shelf.jpg",
      "/onboarding-samples/beauty-collection.jpg",
    ],
    attributes: {
      imageUsage: "high",
      typography: "minimal",
      density: "low",
      mood: "candid",
      decoration: "none",
    },
  },
  {
    id: "beauty_soft_01",
    direction: "soft",
    contentFormat: "editorial",
    kicker: "GLOW ROUTINE",
    title: "은은하게, 그러나 확실하게",
    note: "모닝 글로우 루틴",
    photo: "/onboarding-samples/beauty-vanity.jpg",
    attributes: {
      imageUsage: "high",
      typography: "delicate",
      density: "low",
      mood: "soft-bright",
      decoration: "minimal",
    },
  },
  {
    id: "beauty_info_01",
    direction: "info",
    contentFormat: "informational",
    title: "쿠션 고르면서\n알게 된 것 3가지",
    items: ["호수보다 톤이 먼저다", "광은 베이스에서 나온다", "향이 강하면 오래 못 쓴다"],
    photo: "/onboarding-samples/beauty-flatlay.jpg",
    attributes: {
      imageUsage: "medium",
      typography: "structured-clean",
      density: "medium",
      mood: "informative",
      decoration: "minimal",
    },
  },
  {
    id: "beauty_boldphoto_01",
    direction: "boldphoto",
    contentFormat: "statement",
    title: "오늘도\n꼼꼼하게",
    meta: "DAY 21",
    photo: "/onboarding-samples/beauty-collection.jpg",
    attributes: {
      imageUsage: "high",
      typography: "oversized",
      density: "low",
      mood: "energetic",
      decoration: "high-contrast",
    },
  },
  {
    id: "beauty_collage_01",
    direction: "collage",
    contentFormat: "collage",
    title: "시월의 화장대",
    meta: "10.01 — 10.28",
    photos: [
      "/onboarding-samples/beauty-vanity.jpg",
      "/onboarding-samples/beauty-spa.jpg",
      "/onboarding-samples/beauty-shelf.jpg",
    ],
    attributes: {
      imageUsage: "high",
      typography: "minimal",
      density: "medium",
      mood: "personal-modern",
      decoration: "collage",
    },
  },
  {
    id: "beauty_product_01",
    direction: "product",
    contentFormat: "review",
    title: "레티놀 크림, 3개월째",
    note: "자극 없이, 딱 좋은 농도",
    meta: "PICK 01",
    photo: "/onboarding-samples/beauty-flatlay.jpg",
    attributes: {
      imageUsage: "high",
      typography: "clean",
      density: "low",
      mood: "curated",
      decoration: "minimal",
    },
  },
];

export const SAMPLE_SETS: Record<string, StyleExample[]> = {
  fitness: FITNESS_SET,
  beauty: BEAUTY_SET,
};

/**
 * ①단계 콘텐츠 방향(field) 키워드로 세트를 고른다. 못 찾으면 fitness.
 * V2: LLM 카피+이미지 동적 생성 — PRD Future/V2 «Onboarding Visual
 * Preference Personalization» 참조 (실패 시 이 세트들이 fallback).
 */
export function getSampleSet(field?: string): StyleExample[] {
  const text = field ?? "";
  if (/뷰티|화장품|화장|스킨|스킨케어|메이크업|코스메틱|미용|피부/.test(text)) {
    return SAMPLE_SETS.beauty;
  }
  return SAMPLE_SETS.fitness;
}

/** 서버 검증·속성 매핑용 — 모든 세트의 예시 */
export const STYLE_EXAMPLES = Object.values(SAMPLE_SETS).flat();
export const STYLE_EXAMPLE_IDS = STYLE_EXAMPLES.map((e) => e.id);
