import AppTopNav from "@/components/AppTopNav";
import MobileBottomNav from "@/components/MobileBottomNav";

/**
 * 로그인 후 화면의 공통 껍데기 — 상단 바 + 본문 + 모바일 하단 탭 (09-04에 사이드바에서 이동).
 *
 * 화면마다 이 세 줄을 다시 쓰면 한 곳만 빠져도 그 화면에서 내비게이션이 사라진다.
 * 실제로 카드 상세·재료 추가·제작 결과 세 화면이 그렇게 빠져 있었다 (08-31 통일).
 *
 * **로그인 전 화면에는 쓰지 않는다** — 랜딩·로그인·회원가입·온보딩·약관은
 * 아직 앱 안이 아니라서 GNB를 보여줄 자리가 아니다.
 */

/**
 * 최대 폭은 DESIGN.md §4에 적힌 값만 쓴다. 숫자를 그대로 이름으로 삼아
 * 문서와 대조하기 쉽게 뒀다.
 *
 * Tailwind는 `max-w-[${값}]`처럼 조립한 클래스를 못 알아본다 —
 * 빌드 때 소스를 훑어서 «글자 그대로 나온» 클래스만 남기기 때문에,
 * 이렇게 미리 적어둔 것 중에서 골라야 한다.
 */
const MAX_WIDTH = {
  720: "max-w-[720px]", // (옛) — 09-03에 전 페이지를 960으로 통일하며 기본에서 제외
  960: "max-w-[960px]", // 기본 — 모든 콘텐츠 페이지 (홈 폭에 맞춤, 09-03)
  1200: "max-w-[1200px]", // 캘린더 등 넓은 격자
} as const;

export default function AppShell({
  children,
  width = 960, // 09-03 — 전 페이지를 홈 폭(960)으로 통일. 넓은 격자만 명시적으로 1200
}: {
  children: React.ReactNode;
  /** DESIGN.md §4 「최대 폭」 */
  width?: keyof typeof MAX_WIDTH;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <AppTopNav />

      <main id="main" tabIndex={-1}
        className={`mx-auto w-full flex-1 p-4 pb-24 md:p-6 md:pb-8 min-[1200px]:p-8 ${MAX_WIDTH[width]}`}
      >
        {children}
      </main>

      <MobileBottomNav />
    </div>
  );
}
