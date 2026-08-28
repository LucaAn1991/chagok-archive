import { CircleAlert } from "lucide-react";

/**
 * 인라인 알럿 — 입력 검증·에러 안내 공용.
 *
 * 빨간 글씨를 쓰지 않는다 (DESIGN.md §0). 대신 아이콘에만 --warn을 쓴다 —
 * DESIGN.md §2 «색이 꼭 필요한 곳에만 토큰 하나»가 마련해둔 바로 그 색이다
 * (코랄 계열을 어둡게 내려 AA 통과). 글자는 --ink 그대로.
 *
 * CircleAlert 아이콘 — 사용자 확정(08-28). DESIGN.md §5 표에는 아직 없다.
 * @TODO: DESIGN.md §5 아이콘 표에 «인라인 알럿 | CircleAlert» 행 추가 필요 (사람이 수정)
 */
export default function InlineAlert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex items-center gap-1.5 text-body text-ink">
      <CircleAlert size={16} aria-hidden className="shrink-0 text-warn" />
      <span>{children}</span>
    </p>
  );
}
