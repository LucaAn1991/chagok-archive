"use client";

/**
 * 추이 라인 차트 (admin-design.md — 장식 없이 기능만).
 * 차트 라이브러리 없이 SVG로 직접 그린다 — 30개 점을 잇는 선 하나에
 * 수백 KB 의존성은 과잉이다. 규모가 커져 축·줌이 필요해지면 재검토.
 */
export default function TrendChart({
  points,
  height = 140,
}: {
  /** [날짜, 값] 시간순 */
  points: [string, number][];
  height?: number;
}) {
  if (points.length === 0) return null;

  // viewBox를 넓게 잡을수록 같은 화면 폭에서 글자·점이 작게 그려진다
  const w = 760;
  const pad = { top: 10, right: 16, bottom: 20, left: 30 };
  const innerW = w - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...points.map(([, v]) => v));
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

  const x = (i: number) => pad.left + i * stepX;
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const path = points.map(([, v], i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ");

  // 눈금 — 0 · 중간 · 최대 세 줄이면 읽는 데 충분하다
  const ticks = [0, Math.round(max / 2), max];

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label="추이 그래프">
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={pad.left}
            x2={w - pad.right}
            y1={y(t)}
            y2={y(t)}
            stroke="#E5E7EB"
            strokeDasharray={t === 0 ? undefined : "3 3"}
          />
          <text x={pad.left - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#6B7280">
            {t}
          </text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#1677FF" strokeWidth="1.5" />
      {points.map(([date, v], i) => (
        <circle key={date} cx={x(i)} cy={y(v)} r="2" fill="#1677FF">
          <title>{`${date} · ${v}`}</title>
        </circle>
      ))}
      {/* x축 라벨 — 처음·중간·끝만 (30개를 다 쓰면 겹친다) */}
      {[0, Math.floor((points.length - 1) / 2), points.length - 1]
        .filter((i, idx, arr) => arr.indexOf(i) === idx)
        .map((i) => (
          <text
            key={i}
            x={x(i)}
            y={height - 6}
            // 양끝 라벨은 안쪽 정렬 — 가운데 정렬이면 절반이 차트 밖으로 잘린다
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
            fontSize="9"
            fill="#6B7280"
          >
            {points[i][0].slice(5)}
          </text>
        ))}
    </svg>
  );
}
