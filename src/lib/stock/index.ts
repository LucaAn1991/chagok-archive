import "server-only";

/**
 * 무료 스톡 사진 — 이미지 폴백 사슬의 2순위 (DESIGN.md §12).
 *
 *   ① 사용자 사진 → ② **스톡** → ③ text-only
 *
 * **provider는 Pexels다** (08-31 확정 · PLAN.md §12 미결 9 해소).
 * 고른 이유: 무료 한도가 시간당 200건·월 2만 건으로 넉넉하고,
 * **출처 표기 의무가 없어** 카드뉴스 디자인을 건드리지 않는다.
 * (Unsplash는 시간당 50건에 표기가 필수라 산출물에 크레딧을 넣어야 한다.)
 *
 * `PEXELS_API_KEY`가 없으면 조용히 빈손으로 돌아간다 — 그때는 ③ text-only로
 * 내려앉아 카드가 어쨌든 완성된다. 「어디서 멈춰도 완성된다」(DESIGN §12).
 *
 * 검색어는 **영어**다. 카드 제목은 한국어인데 스톡 검색은 영어가 훨씬 정확해서,
 * 슬라이드를 만들 때 Claude가 영어 검색어를 함께 내도록 했다 (`lib/ai/slides.ts`).
 */

const SEARCH_URL = "https://api.pexels.com/v1/search";

/** 카드뉴스는 정사각형(1080×1080)이라 세로로 긴 사진은 위아래가 잘린다 */
const ORIENTATION = "landscape";

/**
 * 한 검색어에 여러 장을 받아 «같은 사진이 두 장 들어가는» 것을 피한다.
 *
 * 09-02 — 5에서 12로 늘렸다. 기획 화면에서 사진을 **여러 장 고르게** 바뀌었는데,
 * 다섯 장뿐이면 「마음에 드는 게 없다」가 되기 쉽다. 카드뉴스도 4~7장이라
 * 고를 수 있는 폭이 그보다는 넓어야 한다.
 */
const PER_PAGE = 12;

export function isStockConfigured(): boolean {
  return Boolean(process.env.PEXELS_API_KEY);
}

type PexelsResponse = {
  photos?: {
    url?: string; // 사진 페이지 (사진가 크레딧 링크의 목적지)
    photographer?: string;
    photographer_url?: string;
    src?: { large?: string; large2x?: string };
  }[];
};

/**
 * 고른 스톡 사진 하나.
 *
 * **URL만 들고 있으면 안 된다** — Pexels API 약관이 사진가 크레딧을 요구하므로
 * 이름과 사진 페이지 주소를 함께 저장한다. 나중에 화면에서 표시하려면
 * 그때 다시 조회할 방법이 없다.
 */
export type StockPhoto = {
  imageUrl: string;
  photographer: string;
  /** 사진 페이지 — 크레딧 링크가 여기로 간다 */
  sourceUrl: string;
};

/**
 * 검색어 하나로 사진 후보를 받아온다. 못 찾으면 빈 배열.
 *
 * 던지지 않는다 — 스톡은 «있으면 좋은» 것이라 실패해도 카드 생성이 멈추면 안 된다.
 */
async function search(query: string): Promise<StockPhoto[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query.trim()) return [];

  const url = `${SEARCH_URL}?query=${encodeURIComponent(query)}&per_page=${PER_PAGE}&orientation=${ORIENTATION}`;

  try {
    const res = await fetch(url, { headers: { Authorization: key } });
    if (!res.ok) return []; // 한도 초과·키 오류 — 조용히 넘어간다
    const data = (await res.json()) as PexelsResponse;

    return (data.photos ?? []).flatMap((p) => {
      const imageUrl = p.src?.large ?? p.src?.large2x;
      if (!imageUrl) return [];
      return [
        {
          imageUrl,
          photographer: p.photographer ?? "Pexels",
          sourceUrl: p.url ?? "https://www.pexels.com",
        },
      ];
    });
  } catch {
    return [];
  }
}

/**
 * 검색어 하나로 후보 여러 장을 받아온다 — **기획 단계의 사진 고르기**용 (09-01).
 *
 * `pickStockPhotos`는 슬라이드마다 한 장씩 «배정»하는 함수라 후보를 보여주지 못한다.
 * 기획 단계는 반대로 «여러 장 중에 사용자가 고르는» 자리라 목록이 필요하다.
 *
 * 던지지 않는다. 키가 없거나 실패하면 빈 배열 — 그때 화면은 「내 사진」만 보여준다.
 */
export async function searchStockPhotos(query: string): Promise<StockPhoto[]> {
  return search(query);
}

/**
 * 검색어 목록에 사진을 하나씩 짝지어 준다. 못 채운 자리는 `null`.
 *
 * **같은 사진이 두 번 쓰이지 않게** 이미 고른 것은 건너뛴다 — 카드뉴스를 넘기다
 * 같은 사진이 또 나오면 성의 없어 보인다.
 */
export async function pickStockPhotos(
  queries: string[],
): Promise<(StockPhoto | null)[]> {
  if (!isStockConfigured() || queries.length === 0) return queries.map(() => null);

  // 검색은 서로 독립이라 한꺼번에 — 순서대로 하면 슬라이드 수만큼 시간이 곱해진다
  const results = await Promise.all(queries.map((q) => search(q)));

  const used = new Set<string>();
  return results.map((candidates) => {
    const pick = candidates.find((p) => !used.has(p.imageUrl));
    if (pick) used.add(pick.imageUrl);
    return pick ?? null;
  });
}
