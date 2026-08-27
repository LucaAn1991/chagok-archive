/**
 * 카드뉴스 렌더러 스모크 테스트.
 *
 * 실행: npx tsx scripts/render-smoke.ts [출력폴더]
 *
 * 레이아웃 6종을 더미 데이터로 각 1장씩 렌더링해 PNG로 저장하고
 * 장당 소요 시간을 출력한다 — PLAN.md §12 「렌더링 성능 재측정」(Node 실측) 대응.
 * 아래 텍스트는 렌더링 확인용 더미이며 실제 서비스 카피가 아니다.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderSlidePng } from "../src/lib/render/render-slide";
import type { SlideContent } from "../src/lib/render/layouts";

const SAMPLES: SlideContent[] = [
  {
    layoutId: "cover",
    texts: { title: "아침 10분 홈트, 진짜 효과 있을까?", subtitle: "3년차 트레이너가 정리했어요" },
    imageUrl: null,
  },
  {
    layoutId: "text-only",
    texts: {
      title: "결론부터 말하면",
      body: "짧아도 매일 하는 쪽이 이깁니다. 주 1회 1시간보다 매일 10분이 근육에 주는 신호가 더 일정해요.",
    },
    imageUrl: null,
  },
  {
    layoutId: "image-top",
    texts: { title: "오늘의 루틴", body: "스쿼트 15회 × 3세트. 무릎이 발끝을 넘지 않게, 호흡은 일어설 때 내쉽니다." },
    imageUrl: null,
  },
  {
    layoutId: "image-full",
    texts: { title: "운동 전 스트레칭, 오히려 독이 될 수 있어요" },
    imageUrl: null,
  },
  {
    layoutId: "list",
    texts: {
      title: "홈트가 무너지는 3가지 이유",
      item1: "목표가 너무 큽니다 — 매일 1시간은 계획이 아니라 소원이에요",
      item2: "기록하지 않습니다 — 어제 몇 개 했는지 모르면 늘 수 없어요",
      item3: "혼자 합니다 — 지켜보는 사람이 없으면 내일로 미뤄져요",
    },
    imageUrl: null,
  },
  {
    layoutId: "closing",
    texts: { message: "내일 아침, 딱 10분만\n같이 시작해요", cta: "저장해두고 아침에 다시 보기" },
    imageUrl: null,
  },
];

async function main() {
  const outDir = process.argv[2] ?? "render-smoke-out";
  await mkdir(outDir, { recursive: true });

  let total = 0;
  for (const sample of SAMPLES) {
    const start = performance.now();
    const png = await renderSlidePng(sample);
    const ms = performance.now() - start;
    total += ms;

    const file = path.join(outDir, `${sample.layoutId}.png`);
    await writeFile(file, png);
    console.log(`${sample.layoutId.padEnd(10)} ${ms.toFixed(0).padStart(5)}ms  ${file}`);
  }

  console.log(`\n합계 ${SAMPLES.length}장 ${total.toFixed(0)}ms (장당 평균 ${(total / SAMPLES.length).toFixed(0)}ms)`);
  console.log("첫 장은 폰트 로딩이 포함되어 느립니다 — 서버에서는 캐시되어 이후 요청부터 빨라집니다.");
}

main().catch((err) => {
  console.error("렌더링 실패:", err);
  process.exit(1);
});
