import type { Metadata } from "next";
import "./globals.css";

/*
  Pretendard는 Google Fonts에 없어서 next/font/google을 쓸 수 없다.
  globals.css에서 dynamic-subset CDN을 불러온다 — 화면에 실제로 쓰인 글자만
  내려받으므로 한글 전체(1MB+)를 받는 것보다 훨씬 가볍다.

  CDN이 죽어도 DESIGN.md §3의 폰트 스택이 -apple-system → Apple SD Gothic Neo →
  Noto Sans KR 순으로 받아내므로 글자가 안 보이는 일은 없다.
*/

export const metadata: Metadata = {
  title: "차곡",
  description:
    "말하면 정리되고, 정리되면 일정이 되고, 일정이 하나씩 콘텐츠로 완성된다. 인스타그램 콘텐츠 기획 어시스턴트.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
