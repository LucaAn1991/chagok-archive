/**
 * 한국어 조사 처리 — «(으)로» 같은 병기가 화면에 노출되지 않게 한다 (08-28 확정).
 *
 * 규칙: 마지막 글자의 받침을 보고 고른다.
 * - 로/으로: 받침 없음 또는 ㄹ받침 → «로», 그 외 받침 → «으로»
 * - 을/를, 이/가, 은/는: 받침 있으면 앞엣것
 * 한글이 아닌 글자로 끝나면(영문·숫자·괄호 등) 받침 없는 쪽을 쓴다.
 */

/** 마지막 글자의 종성 코드. 한글이 아니면 -1 */
function jongseong(word: string): number {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return -1;
  return (last - 0xac00) % 28;
}

export function josa로(word: string): string {
  const jong = jongseong(word);
  // 받침 없음(0) 또는 ㄹ받침(8) → '로'
  return word + (jong <= 0 || jong === 8 ? "로" : "으로");
}

export function josa을(word: string): string {
  return word + (jongseong(word) > 0 ? "을" : "를");
}

export function josa이(word: string): string {
  return word + (jongseong(word) > 0 ? "이" : "가");
}

export function josa은(word: string): string {
  return word + (jongseong(word) > 0 ? "은" : "는");
}

/**
 * 조사만 필요할 때 — 「비 오는 날」처럼 괄호·따옴표로 감싼 표기 뒤에 붙인다.
 * 감싼 문자가 아니라 **단어의 마지막 글자** 기준으로 골라야 하기 때문.
 * 예) `「${topic}」${suffix로(topic)} 바꿨어요`
 */
export function suffix로(word: string): string {
  return josa로(word).slice(word.length);
}

export function suffix을(word: string): string {
  return josa을(word).slice(word.length);
}
