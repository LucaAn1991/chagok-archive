import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
    카드뉴스 렌더러 의존성은 번들에 넣지 않고 node_modules에서 직접 불러온다.
    - satori: 내부의 harfbuzz wasm 파일 경로가 번들링되면 깨진다
    - sharp: 네이티브 바이너리라 번들링 대상이 아니다
  */
  serverExternalPackages: ["satori", "sharp"],
};

export default nextConfig;
