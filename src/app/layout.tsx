import type { Metadata } from "next";
import "./globals.css";

/*
  나눔스퀘어 네오 — 가변 폰트로 굵기 100~900을 낸다. 우리 도메인에서 직접 내보내므로
  CDN이 죽어도 글자가 바뀌지 않는다.

  **09-08 — `next/font/local`을 걷어냈다.** 이 폰트는 한자가 없어 1.46MB가 그대로
  한글 음절 11,172자다. 한 벌로 실으면 모든 화면이 1.46MB를 받는다. `unicode-range`로
  자주 쓰는 2,350자(424KB)와 나머지(1,128KB)를 갈라 필요한 것만 받게 했는데,
  `next/font/local`은 **한 family에 unicode-range를 여러 개 물릴 수 없다** —
  `src` 배열은 굵기·기울기만 나눈다. 그래서 `@font-face`를 `src/app/fonts.css`가
  직접 선언한다(`scripts/subset-font.py`가 생성). 폴백 스택은 `--font-sans`(globals.css)에 있다.
*/

export const metadata: Metadata = {
  title: "차곡",
  description:
    "말하면 정리되고, 정리되면 일정이 되고, 일정이 하나씩 콘텐츠로 완성된다. 인스타그램 콘텐츠 기획 어시스턴트.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      {/*
        자주 쓰는 쪽만 미리 받는다 — 첫 화면 글자가 거의 전부 여기 들어 있다.
        나머지(rare)는 드문 글자가 실제로 나올 때 브라우저가 알아서 받는다.
        폰트 preload는 같은 출처라도 crossOrigin이 필요하다(빠뜨리면 두 번 받는다).
      */}
      <link
        rel="preload"
        href="/fonts/nanum-kr-common.woff2"
        as="font"
        type="font/woff2"
        crossOrigin="anonymous"
      />
      <body className="min-h-full flex flex-col">
        {/*
          본문으로 건너뛰기 (09-08, DESIGN.md §15).

          평소엔 보이지 않고 **Tab을 처음 누를 때만** 나타난다. 홈에 카드가 12장이면
          키보드 사용자는 다음 구역까지 Tab을 열두 번 눌러야 했다 — 상단 바가 아니라
          본문 목록이 문제라, 건너뛸 곳은 `<main>`이다(모든 화면의 `<main>`에 같은 id).

          `focus:` 접두사를 하나하나 붙인 이유 — `sr-only`는 1px 상자로 잘라내는 방식이라
          위치·크기를 되돌리지 않으면 focus해도 글자가 보이지 않는다.
        */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
                     focus:flex focus:h-11 focus:items-center focus:rounded-md focus:border
                     focus:border-line focus:bg-surface focus:px-4 focus:text-body
                     focus:font-semibold focus:text-berry-dark focus:shadow-e2"
        >
          본문으로 건너뛰기
        </a>
        {children}
      </body>
    </html>
  );
}
