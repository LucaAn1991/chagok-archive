/**
 * 약관류 문서 페이지 틀 — 이용약관 · 개인정보처리방침이 같이 쓴다.
 * 제목 + 문서 카드(테두리 중심, 그림자 없음 — DESIGN.md §4).
 *
 * 조항 본문은 아직 없다 — 약관 문구는 사람이 정하는 영역이라 지어내지
 * 않는다 (CLAUDE.md 코딩 규칙 3). 각 조항에 "To be added"만 표기한다.
 * @TODO: 조항 본문 작성 후 교체 (추후 진행 예정 — 08-28 확인)
 */
type PolicyDocumentProps = {
  title: string;
  sections: string[];
};

export default function PolicyDocument({ title, sections }: PolicyDocumentProps) {
  return (
    <main className="flex flex-1 justify-center px-4 py-12">
      <div className="w-full max-w-[720px]">
        <p className="text-center text-title font-bold text-ink">차곡</p>
        <h1 className="mt-2 text-center text-h2 font-bold text-ink">{title}</h1>

        <section className="mt-8 flex flex-col gap-8 rounded-lg border border-line bg-surface p-8">
          {sections.map((heading) => (
            <div key={heading}>
              <h2 className="text-body-l font-semibold text-ink">{heading}</h2>
              <p className="mt-2 text-body text-sub">To be added</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
