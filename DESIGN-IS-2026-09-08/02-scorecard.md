# 02 — Scorecard

**대상** chagok 홈 (`/`, 로그인) · **감사일** 2026-09-08
**규칙** 0~3 정수 · 가중치 없음 · 애매하면 낮은 쪽 · 여러 사례가 있으면 **평균이 아니라 가장 나쁜 사례**로 채점.
근거는 전부 `01-evidence.md` 앵커.

---

**1. Good design is innovative — 2/3**
   Evidence: 상황 사다리 A→B→C→E→D, 하나만 그린다 (`page.tsx:377-386`, §1-1). 대시보드·큐·캘린더를 홈에 놓는 동종 도구와 다른 선택.
   Justification: 「오늘 하나」는 할 일 앱에서 이미 아는 형태다 — 새 형태를 만든 게 아니라 **기존 형태를 이 문제에 맞게 분명히 개선**한 쪽이라 3이 아니라 2.

**2. Good design makes a product useful — 2/3**
   Evidence: C에서 「내일 올릴 콘텐츠에요!」 + 카드 1장 + CTA 1개로 주 과업이 한 번에 끝난다 (§1-2). 그러나 A(오늘 7장)에서는 **같은 무게의 「제작하기」 7개**가 나란히 서고(MEASURED, `page.tsx:432`), 그 아래 카드 행 6개가 더 붙는다.
   Justification: 어느 분기에서도 주 과업은 한 번의 클릭으로 끝난다 — 우회는 없다. 다만 아래 목록이라는 **인접 표면이 단계를 더한다**. 앵커 2에 정확히 해당.

**3. Good design is aesthetic — 2/3**
   Evidence: 렌더된 색 10개·타이포 9종·radius 4종·그림자 1종이 **전부 토큰 값**, 고아 스타일 0건 (§2-1~2-4). 반대편으로 브랜드 면적이 A에서 **28.3%** — 자기 문서의 5% 상한(`globals.css:17-27`)의 5.6배. 「로딩」 표현도 두 가지(`page.tsx:988`, `page.tsx:993`).
   Justification: 시스템 자체는 흠이 없지만 **눈에 띄는 어긋남이 2건**이다. 어긋남이 불협화음으로 보이지는 않아(분홍 위 분홍, 조용하다) 1은 아니다.

**4. Good design makes a product understandable — 2/3**
   Evidence: 주 메시지가 화면에서 가장 큰 문장이고 그 아래 버튼 하나가 다음 행동이다 (`page.tsx:426,446,459,481,496`). 반면 「전체보기」는 무엇의 전체인지 말하지 않고 실제로는 캘린더로 간다 (`page.tsx:759-764`, §3-5).
   Justification: 주 조작은 전부 이름이 맞다. **설명이 필요한 보조 조작이 1개** — 앵커 2.

**5. Good design is unobtrusive — 2/3**
   Evidence: 홈에서 뒤로가기·화면 제목을 없애고(`page.tsx:405`, `PageHeader.tsx:85`) 인사를 캡션 줄로 격하했다(`page.tsx:404-408`). 상단 바는 흰 바탕·얇은 선. 그러나 모바일에서 상·하단 고정 바가 뷰포트의 13%를 상시 점유하고, A에서는 **정보가 없는 자리표시 타일이 화면에서 가장 큰 면적**을 차지한다 (§2-3).
   Justification: 크롬은 조용하지만 사라지지는 않았고, 가장 큰 시각 요소가 내용이 아닌 자리표시다 — 앵커 2.

**6. Good design is honest — 3/3**
   Evidence: 과장 표현 0건·다크 패턴 0건 (§3-2, §3-3). 자동 이월을 「카드 N장을 다음 발행일로 옮겨뒀어요」라고 사실대로 알리고 경고색·뱃지를 쓰지 않는다 (`page.tsx:412-416`). 에러도 빨간색 없이 `--ink`로 쓴다 (`page.tsx:894`, `page.tsx:1006`). 가짜 진행률 금지 (`page.tsx:993` 주석).
   Justification: 모든 문구·배지·라벨이 실제 동작과 맞는다. `FeaturedContentCard`의 고정 라벨(`FeaturedContentCard.tsx:55`)은 **거짓말이 아니라 `TodayCardRail`(`TodayCardRail.tsx:57`)보다 덜 친절한 것**이라, 정직성이 아니라 일관성(#3) 항목으로 옮겨 셌다.

**7. Good design is long-lasting — 2/3**
   Evidence: Warm Blush 팔레트·8~16px radius·그림자 1단계·본문 sans (§2-1~2-4). 유행 표식인 글래스모피즘·과장 그라데이션·네오브루탈리즘 0건. 다만 「AI = ✦(Sparkles)」 관용이 GNB(`AppTopNav.tsx:24`)와 카드 자리표시(`CardThumb.tsx`)에 쓰인다.
   Justification: 유행 표식 **1개**(AI 반짝임) — 앵커 2.

**8. Good design is thorough down to the last detail — 1/3**
   Evidence: 상태 6종 중 **disabled 부재**(MEASURED `[disabled],[aria-disabled]` 0개, §2-6), loading은 서로 다른 2종(`page.tsx:988`·`993`). 자기 문서의 44px 규칙(DESIGN.md §15)이 모바일 인터랙티브 **16개 중 15개**에서 깨진다 — 카드 행 36px(`page.tsx:604`), 탭 36px(`page.tsx:757`), 전체보기 20px(`page.tsx:759`) (§5-6). `prefers-reduced-motion` 가드가 `animate-pulse`를 빠뜨린다 — MEASURED로 `animation-name: pulse`가 그대로 걸린다 (`globals.css:335-345` vs `page.tsx:995`). 탭은 `role=tab`만 있고 `tabpanel`·`aria-controls` **0개** (§5-5). skip link 없음 (§5-3).
   Justification: 빠진 상태 1개 + 거친 상태 1개에 더해, **디테일 규칙 위반이 자기 문서 기준으로 4종** 쌓였다. 「마지막 하나까지」를 재는 항목이라 2가 아니라 1.

**9. Good design is environmentally friendly — 1/3**
   Evidence: 유휴 애니메이션 **0** (MEASURED), 초기 팝업·토스트·모달 **0**, 서드파티 스크립트 0건, DOM 212 노드, FCP 92 ms. 반대편으로 **서브셋하지 않은 폰트 1.49 MB**가 모든 페이지에 실린다 (`layout.tsx:18-21`, 디스크 실측 1,529,292 B). reduced-motion 가드에 구멍 1개(§4-1). 다크 모드 미지원(`globals.css:78-83`, 의도된 결정).
   Justification: 모션·주의력·요청 수는 모범적인데 **확정 페이로드가 500 KB~2 MB 구간**에 있다. 크기는 1, 모션은 2를 가리켜 애매 → 낮은 쪽.

**10. Good design is as little design as possible — 1/3**
   Evidence: 지워도 주 과업이 안 깨지는 것 **5개** (§1-5, §1-6) — ① 출력이 0인 `PageHeader`(`page.tsx:405`) ② 홈 탭과 같은 곳으로 가는 로고 링크(`AppTopNav.tsx:42`) ③ 인사 헤더 + 9구간 표 60줄(`page.tsx:404-408`, `greetings.ts`) ④ 바로 아래 배지와 같은 말을 반복하는 자리표시 문구(「아직 제작 대기중이에요」 vs `StatusBadge` 「제작 대기」) ⑤ 캘린더로 가는 세 번째 입구 「전체보기」(`page.tsx:761`). 여기에 A에서 동등한 CTA 7개(MEASURED).
   Justification: 제거 가능 요소가 **5개** — 앵커 1(3~5개)의 위쪽 끝.

---

## 합계

| # | 원칙 | 점수 |
|---|---|---|
| 1 | innovative | 2 |
| 2 | useful | 2 |
| 3 | aesthetic | 2 |
| 4 | understandable | 2 |
| 5 | unobtrusive | 2 |
| 6 | honest | **3** |
| 7 | long-lasting | 2 |
| 8 | thorough | **1** |
| 9 | environmentally friendly | **1** |
| 10 | as little design as possible | **1** |

**총점 18 / 30**

0점 원칙 없음. 하중을 받는 축(#2 useful · #4 understandable · #6 honest)은 2 · 2 · 3으로 **모두 통과**.
낮은 점수 3개는 전부 **디테일 · 무게 · 절제** 축(#8 · #9 · #10)에 몰려 있다.
