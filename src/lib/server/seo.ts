import "server-only";

import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";

/**
 * 서비스 기본 정보 (백오피스 기획 §2-⑤) — 검색 노출 문구를 배포 없이 바꾼다.
 * `ops/config`의 seoDescription을 읽는다. **서비스명은 «차곡» 고정** —
 * 브랜드명이라 화면에서 못 바꾸게 잠갔다 (지시 09-09).
 *
 * unstable_cache로 감싼 이유: 루트 레이아웃의 generateMetadata가 매 요청 DB를
 * 읽으면 정적 페이지가 전부 동적으로 바뀐다. 캐시 태그를 걸어두고 **admin이
 * 저장할 때 revalidateTag로 즉시 갱신**한다 — «평소엔 캐시, 저장 순간만 갱신».
 * 읽기 실패(빌드 환경에 키가 없는 경우 포함)는 기본값으로 — SEO 설정이
 * 빌드를 멈추면 안 된다.
 */

export const SEO_CACHE_TAG = "ops-seo";

const DEFAULT_SEO = {
  serviceName: "차곡",
  seoDescription:
    "말하면 정리되고, 정리되면 일정이 되고, 일정이 하나씩 콘텐츠로 완성된다. 인스타그램 콘텐츠 기획 어시스턴트.",
};

export const getSeoInfo = unstable_cache(
  async (): Promise<{ serviceName: string; seoDescription: string }> => {
    try {
      const raw = (await adminDb.doc("ops/config").get()).data() ?? {};
      return {
        serviceName: DEFAULT_SEO.serviceName,
        seoDescription:
          typeof raw.seoDescription === "string" && raw.seoDescription.trim()
            ? raw.seoDescription.trim()
            : DEFAULT_SEO.seoDescription,
      };
    } catch {
      return DEFAULT_SEO;
    }
  },
  [SEO_CACHE_TAG],
  { tags: [SEO_CACHE_TAG], revalidate: 3600 },
);
