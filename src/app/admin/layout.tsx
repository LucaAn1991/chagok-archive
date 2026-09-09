import type { Metadata } from "next";
import AdminLayout from "@/components/admin/AdminLayout";

/**
 * 백오피스 공통 레이아웃 — UI 규칙은 admin-design.md(절대 기준)를 따른다.
 * 검색엔진 차단(noindex) — 관리 화면은 검색에 노출될 이유가 없다.
 * 인증·사이드바·전역 배너는 AdminLayout(클라이언트)이 맡는다.
 * 접근 제어의 진실은 각 admin API의 서버 검증(클레임)이다 — 화면이 보여도
 * 권한이 없으면 데이터가 안 나온다.
 */
export const metadata: Metadata = {
  title: "차곡 관리자",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  // 배경을 서버 렌더 단계에서 확정한다 — JS·인증을 기다리는 동안
  // 서비스 배경(핑크)이 비쳐 보이지 않게 (09-09)
  return (
    <div className="min-h-dvh bg-[#F5F5F5] text-[#1F2937]">
      <AdminLayout>{children}</AdminLayout>
    </div>
  );
}
