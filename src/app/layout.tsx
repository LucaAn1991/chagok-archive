import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/*
  나눔스퀘어 네오 — 가변 폰트 1개 파일로 굵기 100~900을 모두 낸다.

  next/font/local이 폰트를 우리 도메인에서 직접 내보낸다. CDN을 타지 않으므로
  외부 서비스가 죽어도 글자가 바뀌지 않고, 빌드 때 미리 불러오기가 걸려
  첫 화면에서 글자가 한 번 튀는 현상(FOUT)이 없다.

  기본 굵기가 100(Light)인 폰트라 weight 범위를 명시한다. 빠뜨리면
  본문이 지나치게 얇게 나온다.

  CDN이 아니라 우리 파일이지만, 그래도 폴백 스택은 남겨둔다 —
  파일을 못 받는 상황에서도 글자는 보여야 한다.
*/
const nanumSquareNeo = localFont({
  src: "./fonts/NanumSquareNeo-Variable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-nanum-square-neo",
  fallback: [
    "-apple-system",
    "system-ui",
    "Apple SD Gothic Neo",
    "Noto Sans KR",
    "sans-serif",
  ],
});

export const metadata: Metadata = {
  title: "차곡",
  description:
    "말하면 정리되고, 정리되면 일정이 되고, 일정이 하나씩 콘텐츠로 완성된다. 인스타그램 콘텐츠 기획 어시스턴트.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${nanumSquareNeo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
