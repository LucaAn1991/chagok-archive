import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
    카드뉴스 렌더러 의존성은 번들에 넣지 않고 node_modules에서 직접 불러온다.
    - satori: 내부의 harfbuzz wasm 파일 경로가 번들링되면 깨진다
    - sharp: 네이티브 바이너리라 번들링 대상이 아니다
  */
  serverExternalPackages: ["satori", "sharp"],

  /*
    개발 도구 버튼(「N」)을 오른쪽 아래로 옮긴다.
    기본값 bottom-left가 사이드바 하단 «프로필»과 정확히 겹쳐(둘 다 좌하단),
    앱 UI인 줄 알고 여러 번 헷갈렸다. 배포본에는 나오지 않는 개발 전용 표시다.
  */
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
