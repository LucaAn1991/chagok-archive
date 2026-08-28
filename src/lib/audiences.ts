/**
 * 대상(audience) 정의 — ② 대상 선택 단계의 단일 출처 (08-28 확정).
 *
 * - `label`  : 칩에 보이는 전부. 부제·설명·툴팁을 붙이지 않는다 — 길면 선택이 피곤해진다
 * - `prompt` : 실AI가 캡션·카드를 만들 때 프롬프트에 들어갈 서술.
 *              @TODO: lib/prompts.ts(실AI 프롬프트 조립)가 생기면 거기서 참조한다
 *
 * 클라이언트·서버가 함께 쓴다. 비밀이 아니므로 server-only를 걸지 않는다.
 */
export const AUDIENCES = [
  {
    id: "knows_me",
    label: "나를 아는 사람",
    prompt: "이미 화자를 아는 사이. 배경 설명과 자기소개 금지. 근황을 나누듯.",
  },
  {
    id: "stranger",
    label: "나를 모르는 사람",
    prompt: "화자를 처음 봄. 첫 문장에 멈춰 세울 훅. 화자가 누구인지 한 줄로 드러낼 것.",
  },
  {
    id: "seeker",
    label: "이 주제를 찾는 사람",
    prompt: "검색·해시태그 유입. 정보 밀도 최우선. 목록·숫자 허용. 검색될 단어를 본문에 포함.",
  },
] as const;

export type AudienceId = (typeof AUDIENCES)[number]["id"];

export const AUDIENCE_DEFAULT = "stranger";
export const MAX_CARDS_PER_RUN = 8;
