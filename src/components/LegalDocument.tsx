import { readFileSync } from "node:fs";
import path from "node:path";
import PageHeader from "@/components/PageHeader";
import { renderLegalMarkdown } from "@/lib/legal/markdown";
import {
  LEGAL_VERSIONS,
  hasEffectiveDate,
  legalFileName,
  type LegalDocId,
} from "@/lib/legal/versions";

/**
 * 약관 전문 페이지 틀 (09-01) — 이용약관·개인정보처리방침이 같이 쓴다.
 * 본문은 content/legal/*.md **원문 그대로**를 읽어 그린다 — 문자열을 컴포넌트에
 * 복사하지 않고, 조문을 요약·분할·병합하지 않는다 (법적 문서).
 *
 * 서버 컴포넌트 — 로그인 없이 열린다 (가입 전에 읽는 문서).
 * 렌더링은 lib/legal/markdown.tsx의 자체 변환기 — 외부 렌더러는 설치하지 않기로 확정(09-02).
 */
export default function LegalDocument({ docId, title }: { docId: LegalDocId; title: string }) {
  const meta = LEGAL_VERSIONS[docId];
  const md = readFileSync(
    path.join(process.cwd(), "content", "legal", legalFileName(docId)),
    "utf8",
  );

  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-16 pt-3 md:px-6 md:pt-4">
      {/* 공통 헤더 재사용 — [←] + 제목. 새 탭으로 열려 기록이 없으면 화살표는 안 그려진다 */}
      <PageHeader title={title} />

      {/* 버전·시행일 — 시행일 미정('ooo')이면 그 줄은 그리지 않는다 */}
      <p className="mt-2 text-caption text-sub">
        버전 {meta.version}
        {hasEffectiveDate(docId) && ` · 시행일 ${meta.effectiveDate}`}
      </p>

      <article className="mt-6 flex flex-col gap-5">{renderLegalMarkdown(md)}</article>
    </main>
  );
}
