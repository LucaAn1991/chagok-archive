import type { LayoutId } from "../../types/card";

/**
 * 카드 위에 얹는 «장식» — 도형과 그림 (09-02).
 *
 * 시안과 우리 결과물의 거리는 대부분 여기서 온다. 색·글꼴·여백은 테마가 맞춰주지만
 * 파란 도형 블록·코너 프레임·마스코트 같은 **얹는 것들**은 레이아웃 밖의 일이다.
 *
 * **도형과 그림을 한 구조로 다룬다.** 둘 다 «캔버스 어딘가에 절대 위치로 놓는 것»이라
 * 따로 만들면 위치 계산 코드가 두 벌이 된다.
 *
 * 좌표는 전부 **비율(0~1)**이다. 캔버스는 1080²이지만 미리보기·썸네일에서 더 작게
 * 그릴 수 있어서, px로 박아두면 그때 어긋난다.
 */

export type OrnamentColor = "accent" | "ink" | "soft" | "sub" | "bg";

export type Ornament = {
  /**
   * `image`는 `assets/` 안의 파일, `shape`는 색 면.
   * 파일이 아직 없으면 그 장식만 조용히 빠진다 — 카드 전체를 죽이지 않는다.
   */
  kind: "image" | "shape";
  /** kind=image — `src/lib/render/assets/` 안의 파일 이름 */
  file?: string;
  /** kind=shape — 채울 색. 테마 역할 이름이라 분위기를 바꿔도 따라온다 */
  fill?: OrnamentColor;
  /** 테두리만 그릴 때. `fill`과 같이 쓰면 채우고 테두리도 그린다 */
  border?: { width: number; color: OrnamentColor };
  /** 모서리 둥글기 — 짧은 변 대비 0~0.5 (0.5면 원). 도형에만 */
  radius?: number;

  /** 왼쪽 위 좌표 (0~1) */
  x: number;
  y: number;
  /** 폭 (0~1) */
  w: number;
  /** 높이 (0~1). 그림은 비우면 원본 비율대로 */
  h?: number;
  /** 시계방향 회전(도) */
  rotate?: number;

  /** 이 레이아웃들에만. 비우면 전부 */
  layouts?: LayoutId[];
  /**
   * 글자 **뒤에** 깔지. 기본은 앞이다.
   * 배경 도형(파란 블록 같은 것)은 뒤로 보내야 글자를 가리지 않는다.
   */
  behind?: boolean;
  /** 사진이 있는 슬라이드에서는 빼고 싶을 때 */
  skipWhenImage?: boolean;
};

/** 이 슬라이드에 실제로 그릴 장식만 고른다 */
export function ornamentsFor(
  all: Ornament[] | undefined,
  layoutId: LayoutId,
  hasImage: boolean,
): Ornament[] {
  if (!all) return [];
  return all.filter((o) => {
    if (o.layouts && !o.layouts.includes(layoutId)) return false;
    if (o.skipWhenImage && hasImage) return false;
    return true;
  });
}
