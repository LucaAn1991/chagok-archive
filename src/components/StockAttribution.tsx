import type { Slide } from "@/types";

/**
 * 스톡 사진 출처 표기 — **Pexels API 이용약관이 요구하는 것**이다.
 *
 * 약관은 「눈에 띄는 Pexels 링크」와 「가능하면 사진가 크레딧」을 요구한다.
 * 사진 라이선스 자체는 표기가 필요 없지만 **API를 쓰는 조건은 별개**다.
 *
 * **사용자가 인스타에 올리는 카드뉴스 이미지 안에는 넣지 않는다.**
 * 약관이 요구하는 건 «앱 안의 링크»이고, 산출물에 크레딧을 박으면
 * 레이아웃 6종을 전부 손봐야 하는 데다 사용자 게시물을 우리가 더럽히는 셈이 된다.
 *
 * 스톡을 안 쓴 카드(사용자 사진·글자만)에서는 아무것도 그리지 않는다.
 *
 * **AI로 만든 이미지가 섞였으면 그것도 함께 알린다** (08-31 · PRD F15).
 * 약관이 시켜서가 아니라, 사용자가 자기 계정에 올리는 것이라
 * 무엇이 실제 사진이고 무엇이 만들어진 그림인지 본인이 알아야 하기 때문이다.
 */
/**
 * Pexels는 사진가 이름 자리에 **URL을 넣어두는 계정이 있다**
 * (예: `https://kaboompics.com/`). 그대로 쓰면 크레딧 줄에 주소가 박힌다.
 * 주소면 도메인만 남겨 이름처럼 읽히게 한다.
 */
function displayName(raw: string): string {
  const name = raw.trim();
  if (!/^https?:\/\//i.test(name)) return name;
  try {
    return new URL(name).hostname.replace(/^www\./, "");
  } catch {
    return name;
  }
}

export default function StockAttribution({ slides }: { slides: Slide[] }) {
  // 같은 사진가가 여러 장을 찍었을 수 있다 — 이름 기준으로 한 번만
  const credits = new Map<string, string>();
  for (const s of slides) {
    if (s.imageCredit) {
      credits.set(displayName(s.imageCredit.photographer), s.imageCredit.sourceUrl);
    }
  }
  const aiCount = slides.filter((s) => s.imageOrigin === "ai" && s.imageUrl).length;
  if (credits.size === 0 && aiCount === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {aiCount > 0 && (
        <p className="text-caption text-sub">
          이 카드의 이미지 {aiCount}장은 차곡이 만든 그림이에요. 실제 사진이 아니에요.
        </p>
      )}
      {credits.size > 0 && (
    <p className="text-caption text-sub">
      사진 제공{" "}
      <a
        href="https://www.pexels.com"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4 hover:text-ink"
      >
        Pexels
      </a>
      {" · "}
      {[...credits.entries()].map(([name, url], i) => (
        <span key={name}>
          {i > 0 && ", "}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 hover:text-ink"
          >
            {name}
          </a>
        </span>
      ))}
    </p>
      )}
    </div>
  );
}
