import type { StyleAttributes } from "@/types";

/**
 * 온보딩 «게시물 취향» 예시 6종 — id와 시각 속성 (08-28 확정 스펙 §3·§9).
 *
 * 선택 결과는 «이 템플릿을 쓰겠다»가 아니라 취향 속성(사진 비중·타이포·
 * 밀도·무드·장식)으로 해석한다. AI는 나중에 이 속성을 조합해 새 레이아웃을
 * 만든다 — MVP는 저장까지만 한다.
 *
 * 화면(그리기)과 API 라우트(검증·속성 매핑)가 같이 쓴다.
 * 내부 스타일 이름(Minimal 등)은 사용자에게 노출하지 않는다 (스펙 §7).
 */
export type StyleExample = {
  id: string;
  attributes: StyleAttributes;
};

export const STYLE_EXAMPLES: StyleExample[] = [
  // Minimal — 여백·큰 타이포·낮은 밀도
  {
    id: "style_minimal_01",
    attributes: {
      imageUsage: "low",
      typography: "large-clean",
      density: "low",
      mood: "calm",
      decoration: "minimal",
    },
  },
  // Editorial — 사진+타이포, 매거진 위계
  {
    id: "style_editorial_01",
    attributes: {
      imageUsage: "medium",
      typography: "editorial",
      density: "medium",
      mood: "sophisticated",
      decoration: "low",
    },
  },
  // Soft — 파스텔·둥근 요소·따뜻함
  {
    id: "style_soft_01",
    attributes: {
      imageUsage: "medium",
      typography: "soft",
      density: "medium",
      mood: "warm",
      decoration: "soft",
    },
  },
  // Bold — 큰 헤드라인·강한 대비
  {
    id: "style_bold_01",
    attributes: {
      imageUsage: "low-medium",
      typography: "bold",
      density: "low",
      mood: "energetic",
      decoration: "medium",
    },
  },
  // Photo-led — 사진이 캔버스 대부분
  {
    id: "style_photo_01",
    attributes: {
      imageUsage: "high",
      typography: "minimal",
      density: "low",
      mood: "natural",
      decoration: "minimal",
    },
  },
  // Informational — 숫자·구조·높은 밀도
  {
    id: "style_info_01",
    attributes: {
      imageUsage: "low-medium",
      typography: "structured",
      density: "high",
      mood: "informative",
      decoration: "functional",
    },
  },
];

export const STYLE_EXAMPLE_IDS = STYLE_EXAMPLES.map((e) => e.id);
