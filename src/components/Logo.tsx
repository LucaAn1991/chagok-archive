import Image from "next/image";

/**
 * 로고 — 심볼(쌓인 블록)과 전체 마크(심볼 + 「차곡」).
 *
 * 08-31 실제 아트워크 반영. 그 전까지는 자리마다 그라데이션 사각형을 두고
 * `@TODO: 로고 최종 아트워크 미확정`으로 남겨뒀었다 (DESIGN.md §18).
 *
 * **원본은 흰 배경이 박힌 1080×1080 PNG였다.** 그대로 쓰면 앱 배경(`--bg` #FCF8F7)
 * 위에 흰 사각형이 보이므로, 바깥 배경만 흘려 채우기로 지우고 여백을 잘라냈다.
 * 블록 사이의 흰 틈은 디자인이라 살렸다 — 안쪽까지 지우면 로고가 무너진다.
 *
 * 두 벌로 나눈 이유: 사이드바가 태블릿에서 아이콘만 남는 72px 레일이 되고
 * (DESIGN.md §4) 말풍선 아바타도 심볼만 필요하다. 글자를 같이 넣으면 뭉개진다.
 */

/**
 * 심볼만 — 아이콘 자리(사이드바·아바타·모바일 헤더)
 *
 * `priority`를 붙이지 않는다. 대화 화면에서는 말풍선마다 이 심볼이 붙는데,
 * 하나하나가 preload 대상이 되면 정작 먼저 받아야 할 것들이 뒤로 밀린다.
 *
 * `alt`는 비워둔다 — 이 심볼 옆에는 「차곡」 글자가 늘 함께 있어서
 * 스크린리더가 같은 이름을 두 번 읽게 된다. 글자가 숨는 자리(72px 사이드바)에서는
 * **부모 쪽에 `aria-label`을 준다.**
 */
export function LogoSymbol({ size = 24 }: { size?: number }) {
  return (
    <Image
      src="/logo-symbol.png"
      alt=""
      width={size}
      height={size}
      className="shrink-0"
    />
  );
}

/** 심볼 + 「차곡」 — 로그인·회원가입처럼 브랜드를 보여주는 자리 */
export function LogoFull({ width = 96 }: { width?: number }) {
  // 원본 비율 470×604 — 높이를 직접 계산해 넘긴다(레이아웃 흔들림 방지)
  const height = Math.round((width * 604) / 470);
  return (
    <Image
      src="/logo.png"
      alt="차곡"
      width={width}
      height={height}
      className="shrink-0"
      priority
    />
  );
}
