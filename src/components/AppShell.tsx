import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";

/**
 * 로그인 후 화면의 공통 껍데기 — 사이드바 + 본문 + 모바일 하단 탭.
 *
 * 화면마다 이 세 줄을 다시 쓰면 한 곳만 빠져도 그 화면에서 내비게이션이 사라진다.
 * 실제로 카드 상세·재료 추가·제작 결과 세 화면이 그렇게 빠져 있었다 (08-31 통일).
 *
 * **로그인 전 화면에는 쓰지 않는다** — 랜딩·로그인·회원가입·온보딩·약관은
 * 아직 앱 안이 아니라서 GNB를 보여줄 자리가 아니다.
 *
 * 폭은 두 가지뿐이다. Tailwind는 `max-w-[${값}]`처럼 조립한 클래스를 못 알아보므로
 * (빌드 때 훑어서 쓰이는 클래스만 남긴다) 미리 적어둔 둘 중에서 고른다.
 */
export default function AppShell({
  children,
  /** 캘린더처럼 넓은 화면이면 true (1100px), 기본은 읽기 폭 720px */
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex flex-1">
      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <main
          className={[
            "mx-auto w-full flex-1 p-4 pb-24 md:p-6 md:pb-8 min-[1200px]:p-8",
            wide ? "max-w-[1100px]" : "max-w-[720px]",
          ].join(" ")}
        >
          {children}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
