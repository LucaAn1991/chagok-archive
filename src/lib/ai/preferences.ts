import type { User } from "../../types/user";

/**
 * 온보딩 «게시물 취향»(visualPreferences) → AI 프롬프트 지시문 변환 (08-31).
 *
 * 취향 반영 3단계 중 ②(문구 톤 반영)의 본체다:
 *   ① 생성 API가 users.visualPreferences를 읽어 전달  — caption·render route
 *   ② 여기서 한국어 지시문으로 변환                    — 이 파일
 *   ③ 비주얼(테마) 반영                                — 추후 (렌더러 테마 패밀리)
 *
 * 실제 Claude 호출이 붙기 전(목 모드)에는 결과가 화면에 드러나지 않는다 —
 * 실호출 구현 시 이 지시문을 시스템 프롬프트에 넣기만 하면 된다.
 *
 * 값 어휘는 src/lib/style-examples.ts 의 attributes·contentFormat을 따른다.
 * 새 예시가 추가돼 모르는 값이 오면 조용히 건너뛴다 (프롬프트 오염 방지).
 *
 * (주의: 형제 파일들과 달리 "server-only"를 넣지 않았다 — 순수 함수라
 * 스크립트 스모크 테스트에서 직접 import해 검증하기 위함이다.)
 */

type VisualPreferences = NonNullable<User["visualPreferences"]>;

const MOOD_KO: Record<string, string> = {
  calm: "차분한",
  "warm-natural": "따뜻하고 자연스러운",
  warm: "따뜻한",
  natural: "자연스러운",
  modern: "세련되고 현대적인",
  sophisticated: "세련된",
  "soft-bright": "부드럽고 밝은",
  energetic: "활기찬",
  informative: "정보 전달에 충실한",
  candid: "꾸미지 않은 솔직한",
  "personal-modern": "개인적이면서 감각적인",
  curated: "안목 있게 고른 듯한",
  sincere: "진솔한",
  "bold-graphic": "대담한",
  motivational: "동기를 주는",
  practical: "실용적인",
  emotional: "감성적인",
};

const FORMAT_KO: Record<string, string> = {
  thought: "짧은 생각·인사이트",
  editorial: "에세이·매거진",
  routine: "데일리 루틴",
  statement: "한 문장 선언",
  comparison: "비교·변화 기록",
  diary: "개인 기록(일기)",
  collage: "일상 모음",
  checklist: "체크리스트",
  quote: "인용·글귀",
  review: "솔직 후기",
  informational: "정보 카드뉴스",
};

const IMAGE_KO: Record<string, string> = {
  high: "사진 비중이 높은 구성을",
  "medium-high": "사진 비중이 높은 편인 구성을",
  medium: "사진과 글의 균형을",
  low: "글 중심 구성을",
  none: "글 중심 구성을",
};

const DENSITY_KO: Record<string, string> = {
  low: "여백 있고 간결한 밀도",
  medium: "적당한 정보 밀도",
  "medium-high": "정보가 충실한 밀도",
  high: "정보가 촘촘한 밀도",
};

/** 중복 제거하며 사전에 있는 값만 한국어로 */
function pick(values: string[], dict: Record<string, string>): string[] {
  return [...new Set(values.map((v) => dict[v]).filter(Boolean))];
}

/**
 * 최빈값 하나만 한국어로 — 사진 비중·밀도처럼 «정도»를 나타내는 속성은
 * 여러 개를 나열하면 지시가 모순돼 보인다. 가장 많이 고른 쪽을 따른다.
 */
function pickDominant(values: string[], dict: Record<string, string>): string | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (dict[v]) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? dict[top[0]] : null;
}

/**
 * 취향 → 프롬프트 지시문. 취향이 없거나(«잘 모르겠어요» = null) 비어 있으면
 * null — 지시문 자체를 넣지 않는다 (기본 말투).
 */
export function buildPreferenceDirective(
  prefs: VisualPreferences | null | undefined,
): string | null {
  if (!prefs || prefs.selectedExamples.length === 0) return null;

  const moods = pick(prefs.attributes.map((a) => a.mood), MOOD_KO);
  const formats = pick(prefs.contentFormats ?? [], FORMAT_KO);
  const image = pickDominant(prefs.attributes.map((a) => a.imageUsage), IMAGE_KO);
  const density = pickDominant(prefs.attributes.map((a) => a.density), DENSITY_KO);

  const parts: string[] = [];
  if (moods.length) parts.push(`${moods.join(", ")} 무드`);
  if (formats.length) parts.push(`${formats.join(", ")} 형식의 말투`);
  if (density) parts.push(density);
  if (image) parts.push(`${image} 선호`);

  if (parts.length === 0) return null;

  return [
    `사용자가 온보딩에서 고른 게시물 취향: ${parts.join(" · ")}.`,
    "캡션과 슬라이드 문구의 말투·어조·밀도에 이 취향을 반영하라.",
    "단, 주제의 사실성과 «피할 표현» 목록이 취향보다 우선한다.",
  ].join(" ");
}
