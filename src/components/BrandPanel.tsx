/**
 * 인증 화면(로그인·회원가입) 왼쪽의 브랜드 패널.
 *
 * Desktop(>=1200)에서만 보인다. 그보다 좁으면 통째로 사라진다 —
 * 축소가 아니라 제거다 (DESIGN.md ✕22 «모바일을 데스크톱의 축소판으로 만들지 않는다»).
 *
 * 문구는 전부 PRD §5-1 «카피 구성 [확정 — 08.27]»에서 그대로 가져왔다.
 * 여기서 새 카피를 쓰지 않는다.
 *
 * 연한 브랜드 면(--berry-tint) 위에서는 --sub가 4.04:1로 AA에 미달한다.
 * 보조 글자는 전부 --berry-dark(5.17:1)를 쓴다 (DESIGN.md §15).
 *
 * 로고 심볼을 넣지 않은 이유 — DESIGN.md §18에서 «로고 최종 아트워크»가
 * 미확정이다. 임의로 만들지 않고 글자 「차곡」만 쓴다.
 */
export default function BrandPanel() {
  return (
    <section
      aria-label="차곡 소개"
      className="hidden w-1/2 shrink-0 items-center justify-center border-r
                 border-line bg-berry-tint p-16 desktop:flex"
    >
      <div className="w-full max-w-[480px]">
        <p className="text-title font-bold text-ink">차곡</p>

        {/* PRD §5-1 헤드라인 */}
        <p className="mt-6 text-h1 font-bold text-ink">
          생각을 정리하면,
          <br />
          콘텐츠가 차곡차곡
        </p>

        {/* PRD §5-1 서브 — 범주 선언 */}
        <p className="mt-4 text-body-l text-berry-dark">
          인스타그램 전용 콘텐츠 기획 어시스턴트
        </p>

        <CardNewsPreview />

        {/* PRD §5-1 섹션 3 — 동작 캡션 */}
        <p className="mt-6 text-body text-berry-dark">
          말 한마디 → 대상이 다른 카드 여러 장, 날짜까지
        </p>
      </div>
    </section>
  );
}

/**
 * 카드뉴스 맛보기 — 결과물이 어떻게 생겼는지 한눈에 보여준다.
 *
 * @TODO: DESIGN.md §18 «카드뉴스 레이아웃 6종의 실제 시안»이 확정되면 교체한다.
 *        지금 값(여백·글자 크기·이미지 비율)은 시안이 아니라 임시 표현이다.
 *
 * 카드 안 문구도 지어내지 않았다 — PRD §5-1 «섹션 1 범주 대비»를
 * 카드뉴스 형식으로 나눠 담은 것이다.
 * 그림자를 쓰지 않는다 (DESIGN.md §4).
 */
function CardNewsPreview() {
  return (
    <div className="mt-10" aria-hidden>
      <div className="flex gap-3">
        {/* 표지 — 그라데이션은 «AI가 만든 기획 카드 강조»로만 허용된다 (DESIGN.md §2) */}
        <article className="relative flex flex-1 flex-col justify-center overflow-hidden rounded-lg bg-berry-light p-4 aspect-[4/5]">
          <span
            className="absolute inset-x-0 top-0 h-[3px]"
            style={{ background: "var(--grad)" }}
          />
          <p className="text-body font-bold leading-[1.45] text-berry-dark">
            생각을 정리하면, 콘텐츠가 차곡차곡
          </p>
        </article>

        <article className="flex flex-1 flex-col justify-center rounded-lg border border-line bg-surface p-4 aspect-[4/5]">
          <p className="text-body leading-[1.45] text-ink">
            예약 발행 도구는 많습니다.
          </p>
        </article>

        <article className="flex flex-1 flex-col justify-center rounded-lg border border-line bg-surface p-4 aspect-[4/5]">
          <p className="text-body font-semibold leading-[1.45] text-ink">
            &lsquo;무엇을 올릴지&rsquo; 정해주는 도구는 없었습니다.
          </p>
        </article>
      </div>

      {/* 캐러셀 표시 — 「여러 장이 이어진다」를 형태로 알린다 */}
      <div className="mt-4 flex items-center gap-1.5">
        <span className="size-1.5 rounded-pill bg-berry" />
        <span className="size-1.5 rounded-pill bg-berry/30" />
        <span className="size-1.5 rounded-pill bg-berry/30" />
      </div>
    </div>
  );
}
