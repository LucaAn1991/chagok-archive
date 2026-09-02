/**
 * 약관류 문서 페이지 틀 — 이용약관 · 개인정보처리방침이 같이 쓴다.
 * 제목 + 문서 카드(테두리 중심, 그림자 없음 — DESIGN.md §4).
 *
 * 조항 본문은 대부분 아직 없다 — 약관 문구는 사람이 정하는 영역이라 지어내지
 * 않는다 (CLAUDE.md 코딩 규칙 3). 본문을 주지 않은 조항에는 "To be added"만 표기한다.
 * @TODO: 조항 본문 작성 후 교체 (추후 진행 예정 — 08-28 확인)
 *
 * **예외는 법이 문구를 요구하는 조항이다.** AI 생성물 표시(AI 기본법 제31조)처럼
 * 「고지했는가」가 곧 준수 여부인 조항은 본문이 비어 있으면 고지가 없는 것과 같아서,
 * `{ heading, body }` 형태로 본문을 함께 넘겨 실제 문구를 띄운다.
 */

/** 제목만 주면 "To be added", 본문까지 주면 그 문구를 띄운다 */
export type PolicySection = string | { heading: string; body: string };

type PolicyDocumentProps = {
  title: string;
  sections: PolicySection[];
};

export default function PolicyDocument({ title, sections }: PolicyDocumentProps) {
  return (
    <main className="flex flex-1 justify-center px-4 py-12">
      <div className="w-full max-w-[720px]">
        <p className="text-center text-title font-bold text-ink">차곡</p>
        <h1 className="mt-2 text-center text-h2 font-bold text-ink">{title}</h1>

        <section className="mt-8 flex flex-col gap-8 rounded-lg border border-line bg-surface p-8">
          {sections.map((section) => {
            const heading = typeof section === "string" ? section : section.heading;
            const body = typeof section === "string" ? null : section.body;
            return (
              <div key={heading}>
                <h2 className="text-body-l font-semibold text-ink">{heading}</h2>
                {/* 본문의 줄바꿈은 항(①②③)을 나누는 것이라 그대로 살린다 */}
                <p className="mt-2 whitespace-pre-line text-body text-sub">
                  {body ?? "To be added"}
                </p>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
