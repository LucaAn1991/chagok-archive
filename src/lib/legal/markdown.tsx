import type { ReactNode } from "react";

/**
 * 약관용 최소 마크다운 변환 (09-01) — 제목(#) · 조문 제목(제N조 …) · 표 · 목록 ·
 * 인용(>) · 문단 · **굵게**. 서버(전문 페이지)와 클라이언트(동의 화면 아코디언)가
 * 같이 쓴다 — fs 의존 없음.
 *
 * 인라인 문법은 **굵게(별표 두 개)만** 처리한다 — 글자는 한 자도 바꾸지 않고
 * 강조 표시만 입힌다. 표현 하나가 의미를 바꾸는 문서라서다.
 * 외부 렌더러(react-markdown 등)는 **설치하지 않기로 확정(09-02)** —
 * 두 문서에 필요한 문법을 이미 다 처리하고, 팀 전원의 npm install 재실행 비용이 있으며,
 * 굵게만 처리하는 인라인 방침이 법적 문서에는 오히려 안전하다.
 */

/** 인라인 — «**굵게**»만 <strong>으로. 나머지 글자는 그대로 둔다 */
function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold">
        {p.slice(2, -2)}
    </strong>
    ) : (
      p
    ),
  );
}

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
  /*
    열이 많은 표(국외 이전 6열 등)는 좁은 화면에서 열폭이 40px대까지 줄어
    한 글자씩 세로로 쌓인다 (09-02 실측). 열당 최소 폭을 줘서 «표만» 가로
    스크롤되게 한다 — 페이지는 밀리지 않는다 (바깥 overflow-x-auto가 받는다).
  */
  const colCount = head.length;
  const minWidth = colCount >= 4 ? `${colCount * 160}px` : undefined;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-body" style={minWidth ? { minWidth } : undefined}>
        <thead>
          <tr>
            {head.map((c, i) => (
              <th
                key={`${keyBase}-h${i}`}
                className="border border-line bg-surface-muted px-3 py-2 text-left font-semibold text-ink"
              >
                {renderInline(c)}
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
                  {renderInline(c)}
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

    // 구분선(---) — 조문 뭉치 사이의 시각적 단락 (09-02 원문 반영 때 추가)
    if (lines.length === 1 && /^-{3,}$/.test(lines[0].trim())) {
      return <hr key={bi} className="border-t border-line" />;
    }

    // 인용(>) — 조용한 안내 상자. 본문보다 눈에 띄되 경고처럼 보이지 않게
    if (lines.every((l) => l.trim().startsWith(">"))) {
      const quote = lines.map((l) => l.replace(/^\s*>\s?/, "")).join("\n");
      return (
        <blockquote
          key={bi}
          className="whitespace-pre-wrap break-keep rounded-md border-l-2 border-line bg-surface-muted px-4 py-3 text-body leading-7 text-ink"
        >
          {renderInline(quote)}
        </blockquote>
      );
    }

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
          {renderInline(heading[2])}
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
                {renderInline(item)}
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
        {renderInline(block)}
      </p>
    );
  });
}
