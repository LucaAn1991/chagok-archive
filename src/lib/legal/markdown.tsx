import type { ReactNode } from "react";

/**
 * 약관용 최소 마크다운 변환 (09-01) — 제목(#) · 조문 제목(제N조 …) · 표 · 목록 · 문단.
 * 서버(전문 페이지)와 클라이언트(동의 화면 아코디언)가 같이 쓴다 — fs 의존 없음.
 *
 * 인라인 문법은 건드리지 않는다(원문 그대로) — 표현 하나가 의미를 바꾸는 문서라서다.
 * 프로젝트에 마크다운 렌더러가 없어 직접 변환한다 (09-01 확인 — 설치는 승인 대기).
 * @TODO: 본문 원문(표·중첩 목록 포함)이 오면 react-markdown + remark-gfm 승인 후 교체.
 */

/** 표 한 덩어리 — 넘치면 «표만» 가로 스크롤 (페이지는 밀리지 않는다) */
function Table({ lines, keyBase }: { lines: string[]; keyBase: number }) {
  const rows = lines
    .filter((l) => !/^\s*\|?\s*:?-{2,}/.test(l)) // 구분선(|---|) 제거
    .map((l) =>
      l
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((c) => c.trim()),
    );
  if (rows.length === 0) return null;
  const [head, ...body] = rows;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-body">
        <thead>
          <tr>
            {head.map((c, i) => (
              <th
                key={`${keyBase}-h${i}`}
                className="border border-line bg-surface-muted px-3 py-2 text-left font-semibold text-ink"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={`${keyBase}-r${ri}`}>
              {r.map((c, ci) => (
                <td
                  key={`${keyBase}-r${ri}c${ci}`}
                  className="border border-line px-3 py-2 text-ink"
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function renderLegalMarkdown(md: string): ReactNode[] {
  const text = md.replace(/<!--[\s\S]*?-->/g, ""); // 주석은 화면에 내보내지 않는다
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trimEnd())
    .filter((b) => b.trim() !== "");

  return blocks.map((block, bi) => {
    const lines = block.split("\n");

    // 표 — 파이프로 시작하는 줄 묶음
    if (lines.every((l) => l.trim().startsWith("|"))) {
      return <Table key={bi} lines={lines} keyBase={bi} />;
    }

    // 제목 (#, ##, ###)
    const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0]);
    if (heading && lines.length === 1) {
      const level = heading[1].length;
      const cls =
        level === 1
          ? "text-h3 font-bold text-ink"
          : level === 2
            ? "text-title font-bold text-ink"
            : "text-body-l font-semibold text-ink";
      // 조문 번호가 제목과 떨어지지 않게 — 단어 단위 줄바꿈만 허용
      return (
        <h2 key={bi} className={`${cls} break-keep`}>
          {heading[2]}
        </h2>
      );
    }

    // 목록 (-, *, 1. — 들여쓰기 2칸 = 한 단계 중첩)
    if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
      return (
        <ul key={bi} className="flex flex-col gap-1">
          {lines.map((l, li) => {
            const depth = Math.floor((/^\s*/.exec(l)?.[0].length ?? 0) / 2);
            const item = l.replace(/^\s*([-*]|\d+\.)\s+/, "");
            const marker = /^\s*\d+\./.test(l) ? `${l.trim().split(".")[0]}.` : "·";
            return (
              <li
                key={`${bi}-${li}`}
                className="break-keep text-body leading-7 text-ink"
                style={{ paddingLeft: `${depth * 1.25}rem` }}
              >
                <span className="mr-1.5 text-sub">{marker}</span>
                {item}
              </li>
            );
          })}
        </ul>
      );
    }

    // 조문 제목 문단 — «제1조 (목적)» 형태는 본문보다 굵게, 번호가 떨어지지 않게
    if (lines.length === 1 && /^제\d+조/.test(lines[0].trim())) {
      return (
        <h2 key={bi} className="break-keep text-body-l font-semibold text-ink">
          {lines[0].trim()}
        </h2>
      );
    }

    // 일반 문단 — 줄바꿈 보존
    return (
      <p key={bi} className="whitespace-pre-wrap break-keep text-body leading-7 text-ink">
        {block}
      </p>
    );
  });
}
