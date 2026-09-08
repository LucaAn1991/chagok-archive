# 03 — Verdict

## 판정: **REDESIGN**

> chagok 홈은 목적과 뼈대는 옳지만 총점 18/30으로 기준선 20에 못 미친다 — 실패는 「무엇을 보여줄지」가 아니라 **「얼마나 많이 보여줄지」**에 몰려 있어, 화면을 다시 그리되 **덜어내는 방향**의 재설계가 필요하다.

### 이 판정이 나온 경로

Phase 3 규칙은 기계적이다 — **총점 20 미만이면 REDESIGN**. 18점이므로 REDESIGN이다.
다만 이 판정이 무엇을 뜻하는지는 정확히 적어둔다:

- **0점 원칙 없음.** 하중을 받는 축(#2 useful 2 · #4 understandable 2 · #6 honest 3)은 전부 통과했다. 목적·정보구조·정직성은 무너지지 않았다.
- **낮은 점수 3개(#8 thorough 1 · #9 environmentally friendly 1 · #10 as little design 1)는 전부 절제·디테일·무게 축**이다. 즉 「방향이 틀렸다」가 아니라 **「같은 방향으로 너무 많이 실었다」**가 실패 원인이다.
- 그래서 이 재설계는 **덜어내는 재설계(subtractive)**다. 새 컨셉을 찾는 작업이 아니다.
- REFINE(≥20)이 되려면 #8·#10 중 둘을 2로 올리면 된다 — 아래 1·2·3번 움직임이 정확히 그 두 항목을 겨냥한다. 다만 채점은 채점이고, 지금 상태의 판정은 REDESIGN이다.

### 재설계로 다시 세울 것

홈의 존재 이유는 DESIGN.md §9에 이미 한 줄로 적혀 있다 — 「사용자가 지금 무엇을 해야 하는지 **하나를 정해서** 보여준다」.
코드의 상황 사다리(`page.tsx:377-386`)는 이 문장을 정확히 구현했지만, 그 아래에서 다시 무너진다:
오늘 카드 7장이면 **동등한 CTA 7개**(MEASURED)가 서고, 그 아래 12행 목록이 붙고, 캘린더 입구가 3개가 된다.
「하나를 정해준다」고 해놓고 화면은 **21개의 선택지**를 준다(상황 C, 데스크톱 MEASURED).

---

## 가장 지렛대가 큰 움직임 5개

**1. #10 as little design — A 분기에서 「오늘의 하나」를 실제로 하나로 좁힌다.**
지금은 오늘 카드가 여러 장이면 `TodayCardRail`이 동등한 「제작하기」 7개를 가로로 편다. 하나를 앞세우고 나머지는 아래 목록에 합류시킨다.
Evidence: `page.tsx:426-437` · `TodayCardRail.tsx:22-61` · 01-evidence §1-2 (MEASURED: 본문 인터랙티브 16개 중 CTA 7개), §2-3 (브랜드 면적 28.3%).

**2. #8 thorough — 자기 문서의 44px 터치 타깃 규칙을 홈에서 지킨다.**
모바일에서 보이는 인터랙티브 16개 중 15개가 44px 미만이다. 카드 행 36→44, 탭 36→44, 「전체보기」 20→44.
Evidence: 01-evidence §5-6 (MEASURED) · `page.tsx:604`(`py-1.5`) · `page.tsx:757`(`h-9`) · `page.tsx:759-764` · DESIGN.md §15.

**3. #10/#3 — 카드 자리표시가 바로 아래 배지와 같은 말을 반복하는 것을 끝낸다.**
「아직 제작 대기중이에요」(`CardThumb` 폴백)와 「제작 대기」(`StatusBadge`)가 40px 간격으로 같은 사실을 두 번 말하고, 그 자리표시가 화면에서 가장 큰 면적을 브랜드색으로 덮어 5% 규칙을 5.6배 넘긴다.
Evidence: `TodayCardRail.tsx:37,40` · `StatusBadge.tsx:10` · 01-evidence §2-3 (MEASURED 28.3%) · `globals.css:17-27`.

**4. #9 environmentally friendly — 폰트 1.49 MB를 서브셋한다.**
`NanumSquareNeo-Variable.woff2` 1,529,292 B가 서브셋·unicode-range 분할 없이 모든 페이지에 실린다. 홈에서 확정적으로 가장 무거운 자산이다.
Evidence: `layout.tsx:18-21` · 01-evidence §4 (디스크 실측 + 네트워크 실측 1,493 KB).

**5. #8 thorough — reduced-motion 구멍과 제목 구조를 막는다.**
`prefers-reduced-motion` 가드가 `.card-raise`·`.stagger`·`.modal-in`·`.overlay-in`·`.loader-*`만 끄고 Tailwind `animate-pulse`를 빠뜨려, 흔들림에 예민한 사용자에게 홈 로딩 골격이 계속 깜빡인다(MEASURED `animation-name: pulse`). 같은 축에서 `H1`이 인사말이라 화면의 주 메시지가 제목이 아니고, A 분기에서는 H1→H3로 단계를 건너뛴다.
Evidence: `globals.css:335-345` vs `page.tsx:995` · 01-evidence §4-1, §5-4 (MEASURED).

---

## 재설계에서 **건드리지 말 것**

- 상황 사다리 A→B→C→E→D와 「하나만 그린다」 원칙 (`page.tsx:377-386`) — 이 감사에서 가장 강한 자산이다.
- 정직성 규약 (#6, 유일한 3점): 경고색 없는 에러(`page.tsx:894`), 가짜 진행률 금지(`page.tsx:993`), 자동 변경 사실대로 고지(`page.tsx:414`), 과장·다크 패턴 0건.
- 토큰 체계 (`globals.css:16-158`) — 렌더된 색 10개·타이포 9종·radius 4종·그림자 1종이 전부 토큰이고 고아 스타일이 0건이다.
- 대비 (최저 4.70:1, AA 전부 통과).
