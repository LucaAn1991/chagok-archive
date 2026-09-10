# 04 — /make-plan 핸드오프

아래 블록을 그대로 복사해 새 세션에 붙여넣는다. 이 감사 폴더를 못 보는 세션에서도 단독으로 실행되도록 필요한 근거를 전부 인용해 두었다.

````
/make-plan chagok 홈 화면(`/`, 로그인 상태 · `src/app/page.tsx`)을 재설계한다. Dieter Rams 10원칙 감사에서 18/30을 받았고, #8 thorough(1) · #9 environmentally friendly(1) · #10 as little design as possible(1)이 임계 미달이다.

판정 문장 (03-verdict.md 원문):
> chagok 홈은 목적과 뼈대는 옳지만 총점 18/30으로 기준선 20에 못 미친다 — 실패는 「무엇을 보여줄지」가 아니라 「얼마나 많이 보여줄지」에 몰려 있어, 화면을 다시 그리되 덜어내는 방향의 재설계가 필요하다.

REFINE이 아니라 REDESIGN인 이유: 총점이 기준선 20 미만(18)이다. 다만 0점 원칙이 없고 하중 축(#2 useful 2 · #4 understandable 2 · #6 honest 3)이 모두 통과했으므로, 이것은 **덜어내는 재설계**다 — 새 컨셉을 찾는 작업이 아니라 같은 방향으로 과적된 것을 걷어내는 작업이다.

## 반드시 보존할 것

- **상황 사다리 A→B→C→E→D** (`src/app/page.tsx:377-386`) — 오늘 카드 있음(A) → 발행 요일(B) → 앞으로 배정된 카드(C) → 날짜 없는 카드만(E) → 빈 상태(D) 순으로 판정하고 **하나만 그린다**. 이 감사에서 가장 강한 자산이며 DESIGN.md §9 「지금 무엇을 해야 하는지 하나를 정해서 보여준다」의 구현이다.
- **정직성 규약** (#6, 유일한 3점) — 경고색·빨간색 없는 인라인 에러(`page.tsx:894`, `page.tsx:1006`), 가짜 진행률·스피너 금지(`page.tsx:993`), 자동 이월을 사실대로 고지하는 조용한 한 줄(`page.tsx:414` 「카드 N장을 다음 발행일로 옮겨뒀어요」, `role=status`). 과장 표현 0건 · 다크 패턴 0건으로 실측됐다. 하나도 훼손하지 말 것.
- **토큰 체계** (`src/app/globals.css:16-158`) — 실제 렌더된 색 10개 · 타이포 9종 · radius 4종 · 그림자 1종이 전부 토큰이고 토큰 밖 값이 0건이다.
- **대비** — 최저 4.70:1(「전체보기」 berry on bg), 나머지 전부 4.85 이상으로 WCAG AA 통과. 재설계 후 이 값이 내려가면 안 된다.

## 버릴 것 (구조적 실패 원인)

- **오늘 카드를 동등한 CTA 여러 개로 펴는 구조.** Evidence: `src/components/TodayCardRail.tsx:22-61` + `src/app/page.tsx:426-437`. 오늘 카드 7장 상태를 실측하니 본문 인터랙티브 16개 중 7개가 같은 무게의 「제작하기」였다. 원칙 #10과 #2에서 실패를 만든 원인 — 「하나를 정해준다」고 해놓고 7개를 고르게 한다.
- **정보 없는 브랜드색 자리표시 타일.** Evidence: `src/components/TodayCardRail.tsx:37,40` + `CardThumb` 폴백 + `src/components/StatusBadge.tsx:10`. 타일 안 「아직 제작 대기중이에요」와 40px 아래 배지 「제작 대기」가 같은 사실을 두 번 말하고, 이 타일이 화면 최대 면적을 차지해 브랜드색 비율을 **28.3%**(실측)까지 밀어올린다 — `globals.css:17-27`이 못박은 5% 상한의 5.6배. 원칙 #3·#5·#10에서 실패를 만든 원인.
- **캘린더로 가는 세 번째 입구와 홈으로 가는 두 번째 입구.** Evidence: `src/components/AppTopNav.tsx:25` · `src/components/MobileBottomNav.tsx:14` · `src/app/page.tsx:761`(「전체보기」) / `AppTopNav.tsx:23`(홈 탭)와 `AppTopNav.tsx:42`(로고)가 데스크톱에서 동시에 보이며 둘 다 현재 화면을 가리킨다. 원칙 #10 실패 원인.
- **출력이 0인 컴포넌트 마운트.** Evidence: `src/app/page.tsx:405`가 `<PageHeader isRoot />`를 그리는데 `src/components/PageHeader.tsx:85`에서 `canGoBack=false` · `title` 없음 · `action` 없음 → `return null`. 홈에 아무것도 그리지 않는다.

## 감사가 뽑은 지렛대 5개 (원문 그대로)

1. **#10 as little design — A 분기에서 「오늘의 하나」를 실제로 하나로 좁힌다.** 지금은 오늘 카드가 여러 장이면 `TodayCardRail`이 동등한 「제작하기」 7개를 가로로 편다. 하나를 앞세우고 나머지는 아래 목록에 합류시킨다. Evidence: `src/app/page.tsx:426-437` · `src/components/TodayCardRail.tsx:22-61` · 실측 본문 CTA 7개 / 브랜드 면적 28.3%.
2. **#8 thorough — 자기 문서의 44px 터치 타깃 규칙을 홈에서 지킨다.** 모바일 390px에서 보이는 인터랙티브 16개 중 **15개가 44px 미만**이다(실측). 카드 행 36→44(`src/app/page.tsx:604`, `py-1.5`), 탭 36→44(`src/app/page.tsx:757`, `h-9`), 「전체보기」 20→44(`src/app/page.tsx:759-764`). 근거 규칙: DESIGN.md §15.
3. **#10/#3 — 카드 자리표시가 바로 아래 배지와 같은 말을 반복하는 것을 끝낸다.** Evidence: `src/components/TodayCardRail.tsx:37,40` · `src/components/StatusBadge.tsx:10` · 실측 브랜드 면적 28.3% · `src/app/globals.css:17-27`의 5% 규칙.
4. **#9 environmentally friendly — 폰트 1.49 MB를 서브셋한다.** `src/app/fonts/NanumSquareNeo-Variable.woff2`가 1,529,292 B(디스크 실측)이고 서브셋·unicode-range 분할 없이 모든 페이지에 실린다(`src/app/layout.tsx:18-21`). 홈에서 확정적으로 가장 무거운 자산이다.
5. **#8 thorough — reduced-motion 구멍과 제목 구조를 막는다.** `src/app/globals.css:335-345`의 `prefers-reduced-motion` 가드가 `.card-raise` · `.stagger` · `.modal-in` · `.overlay-in` · `.loader-*`만 끄고 Tailwind `animate-pulse`를 빠뜨려, `src/app/page.tsx:995`의 홈 로딩 골격이 계속 깜빡인다(실측: 계산된 `animation-name`이 `pulse`로 나옴). 같은 축에서 `H1`이 인사말(`src/app/page.tsx:406`)이라 화면의 주 메시지(`page.tsx:426`, `page.tsx:459`)가 `<p>`이고, 오늘 카드가 여러 장인 분기에서는 H1→H3로 단계를 건너뛴다(`src/components/TodayCardRail.tsx:42`).

## 재설계 우선순위

1. **#10 as little design as possible** — 성공 기준: 홈 본문에서 지울 수 있는 요소가 2개 이하. 오늘 할 일이 몇 장이든 **주 CTA는 1개**. 캘린더 입구는 폭당 1개.
2. **#8 thorough** — 성공 기준: 상태 6종(empty/loading/error/success/focus/disabled) 전부 존재하고 loading 표현이 1종으로 통일. 모바일 터치 타깃 44px 위반 0건. `prefers-reduced-motion`에서 홈에 움직이는 것 0건. 탭은 `tabpanel`·`aria-controls`까지 갖추거나, ARIA 탭 역할을 떼고 평범한 버튼으로 내린다.
3. **#9 environmentally friendly** — 성공 기준: 폰트 서브셋 후 실측 크기를 기록. 유휴 애니메이션 0(현재도 0, 유지). 초기 팝업·토스트 0(현재도 0, 유지).

## 계획에 담을 것

- 새 정보구조 — 기존 화면에서 유도하지 말고 「오늘 하나」에서 다시 그린다. 상황 5분기별로 화면에 남는 요소 목록.
- 주 흐름 저해상도 와이어 — 분기 A(오늘 여러 장) · C(앞으로) · D(빈 상태) 세 가지를 현재 화면과 나란히 놓고 비교.
- 상태 체크리스트 — empty · loading · error · success · focus · **disabled**(현재 실측 0개).
- 현재 사용자 이행 경로 — 홈만 바뀌므로 데이터 마이그레이션은 없다. 바뀌는 것은 「오늘 카드가 여러 장일 때 보이는 형태」다. 기존 사용자가 오늘 카드 목록을 잃지 않도록 어디서 나머지를 보는지 명시.
- 전환 기준 — 옛 `TodayCardRail`을 언제 지우는지.
- 회귀 검사: (a) 대비 최저값이 4.70 이상 유지 (b) 렌더된 색/타이포/radius가 전부 토큰 (c) 경고색·가짜 진행률·과장 표현 0건 (d) 상황 사다리가 여전히 한 분기만 그림.

## 이 재설계에서 경계할 것

- 옛 구조를 그대로 두고 스타일만 새로 입히기 — 실패 원인은 스타일이 아니라 개수다.
- 플래그로 옛 홈과 새 홈을 무기한 병존시키기.
- 원칙이 아니라 유행을 좇는 재설계 — 이 화면은 #7에서 유행 표식이 1개뿐이었다. 늘리지 말 것.
- 보존 목록을 선택 사항으로 취급하기 — 특히 #6 정직성 규약과 토큰 체계는 이 감사에서 통과한 항목이다.
- 44px·reduced-motion·disabled 같은 항목을 「나중에」로 미루기 — 바로 이 항목들이 점수를 끌어내렸다.
````
