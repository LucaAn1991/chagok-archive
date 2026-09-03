"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { auth } from "@/lib/firebase/client";
import type { Card } from "@/types";

/**
 * 카드 한 장을 대표하는 그림 (09-03).
 *
 * **완성된 첫 장을 먼저 보여준다.** 만들어둔 카드라면 «올릴 그 그림»이 있는데,
 * 그동안 재료 사진(`photoUrls`)만 띄우고 있었다 — 결과가 아니라 재료를 보여준 셈이다.
 *
 * 순서: 완성 첫 장 → 올린 사진 → 고른 스톡 → 안내 문구
 * (뒤 셋은 DESIGN §12 폴백 사슬 그대로)
 *
 * **완성 장은 `<img src>`로 못 가져온다.** 그 주소는 Authorization 헤더가 필요한데
 * `<img>`는 헤더를 못 싣는다. 토큰을 붙여 `fetch`하고 blob 주소로 바꿔 쓴다
 * (제작 결과 화면과 같은 방식).
 *
 * 못 가져와도 조용히 재료 사진으로 물러선다 — 홈이 그림 때문에 멈추면 안 된다.
 */
export default function CardThumb({ card, className }: { card: Card; className: string }) {
  const [slideUrl, setSlideUrl] = useState<string | null>(null);
  /*
    못 쓰는 그림으로 판정된 주소 (09-03).

    **주소를 기억한다** — `broken` 같은 불리언을 두면 다음 그림으로 바뀌었을 때
    되돌려주는 일을 따로 해야 하고, 그걸 빠뜨리면 멀쩡한 그림이 계속 가려진다.
    주소를 비교하면 바뀌는 순간 저절로 풀린다.
  */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!card.slides?.length) return;
    let alive = true;
    let made: string | null = null;

    (async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const res = await fetch(`/api/cards/${card.id}/slides/0/image`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || !alive) return;
        made = URL.createObjectURL(await res.blob());
        if (alive) setSlideUrl(made);
        else URL.revokeObjectURL(made);
      } catch {
        // 재료 사진으로 물러선다
      }
    })();

    return () => {
      alive = false;
      // 화면을 떠나면 blob을 놓아준다 — 안 하면 홈을 오갈 때마다 쌓인다
      if (made) URL.revokeObjectURL(made);
    };
  }, [card.id, card.slides?.length]);

  const src = slideUrl ?? card.photoUrls?.[0] ?? card.stockPhotos?.[0]?.imageUrl ?? null;

  if (src && failedSrc !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- blob·Storage·Pexels 주소라 최적화기를 거칠 이유가 없다
      <img
        src={src}
        alt=""
        className={`${className} bg-surface-muted object-cover`}
        /* 주소가 깨졌으면 아래 «만들 자리»로 떨어진다 — 부서진 그림 아이콘을 두지 않는다 */
        onError={() => setFailedSrc(src)}
        onLoad={(e) => {
          /*
            **너무 작은 그림도 걸러낸다** (09-03). 1×1짜리 자리표시 이미지가 섞여 있으면
            4:3으로 늘어나 **단색 면**이 되는데, 그게 오류처럼 보인다.
            64px은 «썸네일로 쓸 수 있는 최소»로 잡았다 — 사람이 올린 사진이나 스톡은
            이보다 한참 크고, 이보다 작은 것은 늘려봐야 볼 것이 없다.
          */
          const img = e.currentTarget;
          if (img.naturalWidth < 64 || img.naturalHeight < 64) setFailedSrc(src);
        }}
      />
    );
  }

  /*
    **빈 자리를 «만들 자리»로 그린다** (09-03).

    회색 면 + 「이미지 없음」 아이콘 조합이 그대로 «불러오기 실패»로 읽혔다.
    사진이 없는 게 정상인 상태(아직 제작 전)인데 오류처럼 보이면 안 된다.

    그래서 ① 아이콘을 «그림 없음(ImageOff)»에서 «만들 것(Sparkles)»으로 바꾸고
    ② 회색 대신 브랜드 연한 면에 점 무늬를 깔아 «비어 있는 게 아니라 준비된 자리»로 만든다.
    점 색은 제작 대기 상태색(--st-planned)이라, 상태 배지와 같은 것을 말한다.

    대비는 지킨다 — berry-dark on berry-tint = 5.17:1 (실측).
  */
  return (
    <div
      className={`${className} relative flex flex-col items-center justify-center gap-2 overflow-hidden bg-berry-tint text-berry-dark`}
    >
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(var(--st-planned) 1.5px, transparent 1.5px)",
          backgroundSize: "12px 12px",
        }}
      />
      <Sparkles size={20} aria-hidden className="relative" />
      {/*
        제작 전인 카드만 «대기중»이라 적는다. 이미 만든 카드는 사진이 없을 뿐
        대기중이 아니라, 그렇게 적으면 상태 배지와 어긋난다.
      */}
      {card.status === "planned" && (
        <span className="relative text-label font-semibold">아직 제작 대기중이에요</span>
      )}
    </div>
  );
}
