# 01 — Evidence

**수집일** 2026-09-08 15:03~15:09 KST
**대상** `/` 로그인 상태 (`test123@chagok.kr`), dev 서버 `localhost:3000` (Next 16.3.0, PID 55803)
**표기** `MEASURED` = 실제 화면에서 잰 값 · `INFERRED` = 코드만 읽고 적은 값

**계정 상태** 카드 19장 — 이번 주(9/8~9/14) 13장 · 9월 나머지 6장 · 날짜 없는 카드 0장 · 오늘(9/8) 배정 카드 0장.
그래서 **기본 진입은 상황 C**였다.

> ⚠️ 서브에이전트 4대를 띄웠으나 전부 API 400으로 죽어(2026-09-08 15:00) 오케스트레이터가 직접 수집했다.

---

## 0. 캡처

| 파일 | 상태 | 방법 |
|---|---|---|
| `shots/home-C-desktop.png` | C (내일 올릴 콘텐츠) 1280×900 | MEASURED |
| `shots/home-C-mobile.png` | C 390×844 | MEASURED |
| `shots/home-A-multi-desktop.png` | A (오늘 7장) 1280×900 | MEASURED — 클라이언트 `Date`를 9/9 14:00 KST로 덮어쓰고 클라이언트 라우팅으로 재진입. 9/9 이전 미발행 카드가 0장이라 자동 이월(D) 쓰기는 발생하지 않았고, 복귀 후 카드 13장·탭 수치 모두 동일함을 확인했다 |

**못 본 상태** B(발행 요일·오늘 카드 없음) · D(카드 0장) · E(날짜 없는 카드만) — 이 계정 데이터로는 재현할 수 없고,
재현하려면 Firestore 쓰기가 필요해 하지 않았다. 아래 해당 항목은 전부 `INFERRED`.

---

## 1. Structural Evidence

### 1-1. 분기 목록 (5갈래)

판정 사다리 `page.tsx:377-386` — A → B → C → E → D 순서, 하나만 그린다.

| 분기 | 조건 | file:line | 화면 |
|---|---|---|---|
| A | `todayCard` 있음 | `page.tsx:378` | 1장 → `FeaturedContentCard` (`page.tsx:434`) · 2장+ → `TodayCardRail` (`page.tsx:432`) |
| B | `publishToday` | `page.tsx:380` | 「오늘 발행일이에요!」 + `OneLineIdeaInput` (`page.tsx:444-452`) |
| C | `nextCard` 있음 | `page.tsx:382` | 「{상대일} 올릴 콘텐츠에요!」 + `FeaturedContentCard` "미리 제작하기" (`page.tsx:455-475`) |
| E | `somedayCards.length > 0` | `page.tsx:384` | 「언젠가 올릴 콘텐츠 N개…」 + `AssignDatesControl primary` (`page.tsx:477-491`) |
| D | 그 외 | `page.tsx:386` | 「요즘 올리고 싶은 거 있으세요?」 + `IdeaInput` (`page.tsx:493-499`), 첫 방문이면 3단계 안내 (`page.tsx:501-517`) |

공통 하단: `UpcomingSection` (`page.tsx:526-536`) + `CollapsedSomeday` (`page.tsx:537-544`, E일 땐 숨김).

### 1-2. 인터랙티브 요소 수 — MEASURED

**상황 C · 1280px** — 총 21개 (상단바 5 + 본문 16)

| # | 요소 | file:line |
|---|---|---|
| 0 | 로고 → `/` | `AppTopNav.tsx:42-49` |
| 1 | 홈 → `/` | `AppTopNav.tsx:55` |
| 2 | AI 기획 → `/plan/new` | `AppTopNav.tsx:55` |
| 3 | 캘린더 → `/calendar` | `AppTopNav.tsx:55` |
| 4 | 프로필 메뉴 | `ProfileMenu.tsx:82` |
| 5 | 미리 제작하기 | `FeaturedContentCard.tsx:51` |
| 6-7 | 탭 「이번 주 콘텐츠 12」 「9월에 올릴 콘텐츠 6」 | `page.tsx:745-765` |
| 8 | 전체보기 → `/calendar` | `page.tsx:759-764` |
| 9-20 | 카드 행 12개 | `page.tsx:604` (`CardRow`) |

**상황 A(7장) · 1280px** — 본문 16개: 카드 CTA 7 + 탭 2 + 전체보기 1 + 카드 행 6.
`main a,button` = 16 MEASURED. 오늘 카드 7장이 **같은 무게의 CTA 7개**로 나란히 선다.

**모바일 390px** — 하단 탭 3개가 더해진다 (`MobileBottomNav.tsx:31-47`).

### 1-3. 중첩 깊이 — MEASURED

`<main>` 서브트리 최대 깊이 **9**. DOM 노드 총 **212개** (상황 C).

### 1-4. 반복 패턴 (같은 목적·여러 자리)

| 목적 | 자리 수 | file:line |
|---|---|---|
| `/calendar`로 간다 | **3** | `AppTopNav.tsx:25` · `MobileBottomNav.tsx:14` · `page.tsx:761` (전체보기) |
| `/`(홈, 지금 이 화면)로 간다 | **3** | `AppTopNav.tsx:23`(홈 탭) · `AppTopNav.tsx:42`(로고) · `MobileBottomNav.tsx:12` |
| `/plan/new`으로 간다 | **2~3** | `AppTopNav.tsx:24` · `MobileBottomNav.tsx:13` · (B·D 분기의 입력 제출 `page.tsx:551`,`page.tsx:935`) |
| 카드 제작 CTA | **2 구현** | `FeaturedContentCard.tsx:51-56` (라벨 고정) · `TodayCardRail.tsx:53-58` (상태별 라벨) |

데스크톱에서 홈 진입점 2개(로고·홈 탭)가 **동시에 보이고 둘 다 현재 화면을 가리킨다**. MEASURED (focus order 0번·1번).

### 1-5. 죽은 코드 / 안 쓰이는 것

| 항목 | file:line | 사실 |
|---|---|---|
| `PageHeader isRoot` | `page.tsx:405` + `PageHeader.tsx:85` | `isRoot`면 `canGoBack=false`, `title`·`action` 없음 → **`return null`**. 컴포넌트가 마운트되지만 홈에 아무것도 그리지 않는다 |
| `audienceDateLine` | `format.ts:30` | 정의 파일 밖 참조 **0건** |
| `GREETING_SLOTS` export | `greetings.ts:17` | 정의 파일 밖 참조 **0건** (`greetingFor` 내부에서만 씀) |
| 로딩 표현 2종 | `page.tsx:988`(`FullPageLoading` 텍스트) · `page.tsx:993`(`HomeSkeleton` 골격) | 같은 「로딩」에 서로 다른 두 표현. Auth 대기 → 텍스트, 데이터 대기 → 골격 |

### 1-6. 지워도 주 과업이 안 깨지는 후보

- `PageHeader` (`page.tsx:405`) — 출력 0.
- 인사 헤더 (`page.tsx:404-408`) + `greetings.ts` 60줄 9구간 표 — 「지금 뭘 해야 하나」에 기여하지 않는다. 주석(`page.tsx:399-402`)도 09-03에 이미 한 번 격하시킨 이력을 적고 있다.
- 로고 링크 (`AppTopNav.tsx:42`) — 홈 탭과 같은 곳.

---

## 2. Visual Evidence — 전부 MEASURED (상황 C · 1280px)

### 2-1. 스페이싱 스케일
`[2, 4, 6, 8, 10, 12, 16, 20, 24, 32]` px — 4의 배수 + 2·6·10 반단계. **고아 값 없음.**

### 2-2. 타입 스케일 (실제 렌더된 것)
| px/weight | 사용 횟수 |
|---|---|
| 15/400 | 14 |
| 13/400 | 5 |
| 13/600 | 3 |
| 15/600 | 2 |
| 26/700 · 21/700 · 13/500 · 12/600 · 15/700 | 각 1 |

9종. 전부 `globals.css:131-153` 토큰 값과 일치 — 토큰 밖 크기 0건.

### 2-3. 색
렌더된 **고유 색 10개** — `#2D292B`(ink) · `#6F6A6D`(sub) · `#A85578`(berry) · `#914868`(berry-dark) · `#F2DCE5`(berry-light) · `#F0E6EA`(berry-tint) · `#F6F2F4`(surface-muted) · `#E8E1E4`(line) · `#FFFFFF` · `#C9B2E0`(st-planned). 전부 `globals.css:28-49` 토큰.

**브랜드색 면적**
- 상황 C — 문서 면적의 **4.0%** → DESIGN.md §2 「5%」 지킴
- 상황 A(오늘 7장) — **28.3%** → §2 위반. 원인: `CardThumb` 미완성 자리표시(berry-tint 도트, 268×201) × 7 + berry CTA(244×40) × 7 (`CardThumb.tsx` 폴백 · `TodayCardRail.tsx:37,53`)

### 2-4. Radius · 깊이
Radius 4종 `8 / 12 / 16 / 999px` — 토큰 그대로. 그림자 **1종**(`--e-1`)만 실제로 등장. 테두리+그림자 겹침 0건.

### 2-5. 대비 (가장 낮은 순)
| 문구 | 크기/굵기 | 전경/배경 | 비율 | AA(4.5) |
|---|---|---|---|---|
| 전체보기 | 13/600 | berry / bg | **4.70** | 통과 |
| 이번 주 콘텐츠 · 12 | 15/700 · 13/600 | berry-dark / berry-light | **4.85** | 통과 |
| 미리 제작하기 | 15/600 | white / berry | **4.96** | 통과 |
| 인사·날짜·날짜열·비활성 탭 | 13~15/400 | sub / bg | **5.03** | 통과 |
| 카드 제목 등 | 15/400 | ink / surface | 13.6+ | 통과 |

**최저 4.70 — AA 전부 통과.** (AAA 7.0 기준은 브랜드색 텍스트 4종이 미달)

### 2-6. 상태 체크리스트
| 상태 | 유무 | 근거 |
|---|---|---|
| empty | 있음 (별도 화면 아님 — D 분기가 곧 빈 상태) | `page.tsx:386,493-517` INFERRED |
| loading | 있음 · **2종** | `page.tsx:988`(텍스트) `page.tsx:993`(스켈레톤) INFERRED |
| error | 있음 (인라인 + 다시 시도) | `page.tsx:1003-1017` INFERRED |
| success | 있음 (자동 이월 한 줄 `role=status`) | `page.tsx:412-416` INFERRED |
| focus | 있음 (전역 2px berry + offset 2) | `globals.css:181-198` |
| **disabled** | **없음** | MEASURED — `[disabled],[aria-disabled]` **0개**. `AssignDatesControl` 저장 중에도 버튼을 비활성화하는 대신 버튼 자체를 문구로 교체 (`page.tsx:897-899`) |

---

## 3. Copy & Honesty Evidence

### 3-1. 홈에 나오는 문구 전체

| 문구 | file:line | 분기 |
|---|---|---|
| 시간대 인사 9종 (「늦은 시간까지 고생 많으세요」…「편안한 밤 보내세요」) | `greetings.ts:18-26` | 전 분기 |
| `M월 D일 (요일)` | `format.ts:10-15` | 전 분기 |
| 카드 {n}장을 다음 발행일로 옮겨뒀어요 | `page.tsx:414` | 이월 발생 시 |
| 오늘 올릴 콘텐츠에요! 바로 제작해볼까요? | `page.tsx:427` | A(1장) |
| 오늘 올릴 콘텐츠가 {n}개 있어요! | `page.tsx:426` | A(2장+) |
| 오늘 발행일이에요! 오늘은 어떤 콘텐츠를 올리고 싶으세요? | `page.tsx:446` | B |
| 떠오른 생각을 그대로 적어주세요 (placeholder) | `page.tsx:568` | B |
| 내일 / 모레 / {M월 D일에} 올릴 콘텐츠에요! | `page.tsx:326-336`, `page.tsx:459` | C |
| 언젠가 올릴 콘텐츠가 {n}개 있어요. 날짜를 정해볼까요? | `page.tsx:481` | E |
| 요즘 올리고 싶은 거 있으세요? 여러 개여도 좋아요 | `page.tsx:496` | D |
| 예: 요즘 아침 루틴에 대해 이야기해보고 싶어요 (placeholder) | `page.tsx:960` | D |
| 말하면 정리되고 / 정리되면 일정이 되고 / 하나씩 콘텐츠로 완성돼요 | `page.tsx:504` | D 첫 방문 |
| 제작하기 · 미리 제작하기 · 이어서 보기 | `page.tsx:435,470` · `TodayCardRail.tsx:57` | A·C |
| 이번 주 콘텐츠 / {M}월에 올릴 콘텐츠 / N개 남아있어요 / 전체보기 | `page.tsx:750,754,772,763` | 공통 |
| 언젠가 올릴 콘텐츠 {n}개 | `page.tsx:795` | 공통(C 카드 있을 때) |
| 날짜 정해주기 / {n}개를 주 {p}회로 올리면 {w}주 걸려요. 이대로 정할까요? / 이대로 정하기 / 취소 | `page.tsx:880,890,908,916` | E·공통 |
| 날짜를 정하고 있어요... / 날짜를 정하지 못했어요 — 한 번 더 눌러주세요. | `page.tsx:898,894` | 저장 중·실패 |
| 불러오는 중... | `page.tsx:990` | Auth 대기 |
| 화면을 불러오지 못했어요. / 잠시 후 다시 시도해주세요. / 다시 시도 | `page.tsx:1006,1007,1013` | error |
| 제작 대기 · 업로드 대기 · 발행 완료 · 버림 | `StatusBadge.tsx:9-14` | 카드마다 |
| `{label}에게 · {콘텐츠 유형}` | `format.ts:25`, `FeaturedContentCard.tsx:37` | A·C |
| 홈 · AI 기획 · 캘린더 · 차곡 홈 · 프로필 메뉴 · 설정 · 계정 | `AppTopNav.tsx:23-25,44` · `ProfileMenu.tsx:22-23,93` | 공통 |
| sr-only: 올리고 싶은 콘텐츠 / 아이디어 말하기 / 담기 / 전송 | `page.tsx:561,946,573,968` | B·D |

### 3-2. 과장 표현
**없음.** 「AI가 알아서」·「완벽한」·「자동으로」 류 0건. 가장 강한 표현이 「차곡이 기획하고 날짜까지」인데 이건 랜딩(감사 범위 밖)이고, 홈 문구는 전부 상태 서술이다.
반대 방향의 예: 자동 이월을 「옮겨뒀어요」(`page.tsx:414`)라고 **사실대로** 적고 경고색·뱃지를 쓰지 않는다 (`page.tsx:413`).

### 3-3. 다크 패턴
**없음.** 확인한 것 — 강제 연속(구독·유료 게이트 홈에 0건), 숨은 비용(0건), 가짜 희소성(0건), 확인 강요형 문구(취소 버튼이 중립 문구 「취소」 `page.tsx:916`), 사전 체크된 동의(홈에는 동의 UI 자체가 없다 — `page.tsx:187`은 리다이렉트 게이트일 뿐, 선택 동의는 `consent-client.ts:47`의 설정 화면 소관).

### 3-4. 라벨 ↔ 동작 불일치 — **1건**

`FeaturedContentCard`는 CTA 라벨을 **상태와 무관하게 고정**으로 받는다 (`FeaturedContentCard.tsx:25,55` ← `page.tsx:435` "제작하기" / `page.tsx:470` "미리 제작하기").
같은 목적의 `TodayCardRail`은 상태를 본다 — `card.status === "planned" ? "제작하기" : "이어서 보기"` (`TodayCardRail.tsx:57`).
→ 이미 만들어 둔 카드(`pending`, 배지 「업로드 대기」 `StatusBadge.tsx:11`)가 A(1장)·C에 오면 **배지는 "업로드 대기"인데 버튼은 "제작하기"**라고 말한다. 여러 장일 때만 "이어서 보기"로 맞게 나온다.

### 3-5. 불명확한 라벨

| 라벨 | file:line | 문제 | 대안 |
|---|---|---|---|
| 전체보기 | `page.tsx:763` | 무엇의 전체인지 없음. 실제 목적지는 `/calendar` | 「캘린더에서 보기」 |
| 제작 대기 / 업로드 대기 | `StatusBadge.tsx:10-11` | 둘 다 「대기」로 끝나 형태가 비슷하다. 구분은 점 모양(빈 링/찬 점)과 색뿐 | 「아직 안 만듦」 / 「올리기만 하면 됨」 |
| N개 남아있어요 | `page.tsx:772` | 「남아있다」가 밀린 일감처럼 읽힌다 — §3의 「재촉하지 않는다」와 결이 다르다 | 「N개 예정」 |

### 3-6. 톤
DESIGN.md §3 「경고색·느낌표·뱃지 없음」 규칙은 지켜진다 — 에러조차 `--ink`로 쓴다 (`page.tsx:894`, `page.tsx:1003` 주석). 예외 없음.
다만 홈에 느낌표가 분기마다 들어간다 (`page.tsx:426,427,446,459`) — 「!」 4곳. 차분함(§1 Calm)과 부딪히는지는 판단 사항으로 남긴다.

---

## 4. Weight & Friction — MEASURED (dev 서버, 미압축)

| 항목 | 값 | 방법 |
|---|---|---|
| 요청 수 | **31** | `performance.getEntriesByType('resource')`, 첫 로드 후 4초 |
| 총 전송(decoded) | **7,895 KB** | 같음 |
| JS | 23개 / **6,400 KB** | dev 미압축 — 프로덕션 값 아님 |
| 폰트 | 1개 / **1,493 KB** | `src/app/fonts/NanumSquareNeo-Variable.woff2` = 1,529,292 B (디스크 실측) |
| CSS | 1개 / ~0 KB | dev 인라인 |
| Firestore/googleapis 호출 | **7** | URL 필터 |
| FCP | **92 ms** | `first-contentful-paint` |
| DOMContentLoaded / load | **75 ms / 122 ms** | Navigation Timing |
| HTML 응답 | **34 ms** | `curl -w` |
| DOM 노드 | **212** | MEASURED |
| **유휴 화면 애니메이션** | **0** | `document.getAnimations().length === 0` |
| 초기 로드 시 팝업·토스트·모달·뱃지 | **0** | MEASURED (알림 요소 0개) |

**프로덕션 JS는 측정 못 함** — `.next`에 프로덕션 빌드가 없고, `npm run build`는 구동 중인 dev 서버를 건드리므로 돌리지 않았다.
**확정적으로 프로덕션에도 남는 무게는 폰트 1.49 MB** — `layout.tsx:18-21` `localFont({ src: "./fonts/NanumSquareNeo-Variable.woff2", display: "swap" })`, 서브셋·unicode-range 분할 없음. 모든 페이지가 이 한 파일을 받는다.

### 4-1. 모션
DESIGN.md §14 허용 3종 + 로더 2종이 `globals.css:264`·`globals.css:335-345`에서 `prefers-reduced-motion: reduce` 시 꺼진다 — `.loader-run` `.loader-track` `.card-raise` `.stagger` `.modal-in` `.overlay-in`.

**빠진 것: Tailwind `animate-pulse`.** `page.tsx:995`(`HomeSkeleton`)·`calendar/page.tsx:629` 등 6곳이 쓰는데 위 목록에 없다.
MEASURED — 페이지에 `animate-pulse` 요소를 넣고 계산된 `animation-name`을 읽으니 **`pulse`**가 그대로 걸린다. reduced-motion 사용자에게 홈 로딩 골격이 계속 깜빡인다.

### 4-2. 다크 모드
정의하지 않음 — `globals.css:78-83`이 `color-scheme: light`를 명시해 브라우저 임의 반전을 막는다. DESIGN.md §18의 「정의하지 않았다」와 일치. 의도된 미지원이며 화면이 깨지지는 않는다.

### 4-3. 무거운 의존성
홈이 끌어오는 것 — `firebase/auth`·`firebase/firestore` (`page.tsx:6-18`), `lucide-react` 아이콘 4종(`ArrowUp` `ChevronRight` `House` `Sparkles` `CalendarDays` `CircleUserRound` `ChevronLeft`, 개별 import라 트리셰이킹됨), `next/font/local`. 서드파티 분석·태그·위젯 **0건**.

---

## 5. Accessibility Evidence — MEASURED

### 5-1. 대비
§2-5 표 참조. **AA 전부 통과**, 최저 4.70:1.

### 5-2. 포커스 순서 (상황 C · 1280px)
`로고 → 홈 → AI 기획 → 캘린더 → 프로필 → 미리 제작하기 → 탭1 → 탭2 → 전체보기 → 카드행 1…12`
**시각 순서와 어긋나지 않는다.** `tabindex` 전부 0, 양수 tabindex 0건. 키보드로 닿지 않는 주 동작 **없음**.

### 5-3. 랜드마크
`header`(AppTopNav) · `nav[주 메뉴]`(상단) · `main` · `header`(인사 줄) · `div[role=tablist]` · `nav[주 메뉴]`(하단, 모바일 전용).
- `nav` 2개가 **같은 `aria-label`「주 메뉴」**를 쓴다 (`AppTopNav.tsx:51`, `MobileBottomNav.tsx:28`). 한 폭에서 둘이 동시에 보이지는 않지만 DOM에는 항상 둘 다 있다.
- `footer` / `role=contentinfo` **없음**.
- **skip link 없음** — MEASURED (`a[href^="#"]` 0개). 카드가 12장일 때 키보드 사용자는 본문 CTA에 닿기까지 링크 5개를 지나야 하고, 아래 목록을 건너뛸 방법이 없다.

### 5-4. 제목 구조
- 상황 C — `H1: "오후도 잘 보내고 계시죠?"`(인사, `page.tsx:406`) → `H2: 카드 제목`(`FeaturedContentCard.tsx:35`)
- 상황 A(7장) — `H1: 인사` → `H3 × 7`(`TodayCardRail.tsx:42`). **H2가 없어 단계를 건너뛴다.**
- 두 경우 모두 **화면의 주 메시지**(「내일 올릴 콘텐츠에요!」 `page.tsx:459` / 「오늘 올릴 콘텐츠가 7개 있어요!」 `page.tsx:426`)가 `<p>`다. 문서에서 가장 중요한 문장이 제목이 아니고, 대신 인사가 `H1`이다.
- `UpcomingSection`은 탭이 1개일 때만 `H2`가 된다 (`page.tsx:750`) — 탭이 2개면 제목 요소가 사라진다.

### 5-5. 탭 패턴
`role="tablist"` + `role="tab"` + `aria-selected` (`page.tsx:745-765`).
MEASURED — `role="tabpanel"` **0개**, `aria-controls` 가진 탭 **0개**, 좌우 화살표 키 처리 없음. WAI-ARIA 탭 패턴이 절반만 구현돼 있다.

### 5-6. 터치 타깃 (DESIGN.md §15 = 최소 44px)
MEASURED · 390×844에서 보이는 인터랙티브 16개 중 **15개가 44px 미만**:

| 요소 | 크기 | file:line |
|---|---|---|
| 카드 행 × 12 | 298×**36** | `page.tsx:604-613` (`py-1.5`) |
| 탭 × 2 | 134×**36** · 153×**36** | `page.tsx:757` (`h-9`) |
| 전체보기 | 49×**20** | `page.tsx:759-764` (패딩 없음) |
| 로고 링크 | 76×**26** | `AppTopNav.tsx:42-49` |

44px를 지키는 것 — 하단 탭 3개(`min-h-14`, `MobileBottomNav.tsx:40`) · CTA(`h-11`) · 프로필(`h-11`) · 입력·전송 버튼(`h-11`).

### 5-7. 라이브 리전
`role="status"` 자동 이월 한 줄 (`page.tsx:413`)이 유일. 이번 캡처에서는 이월이 없어 **0개** MEASURED.
탭을 바꿔 목록이 통째로 갈릴 때(`page.tsx:756`) 알려주는 장치는 없다.

---

## 6. 못 본 것 (Known gaps)

1. **B · D · E 분기** — 계정 데이터로 재현 불가. Firestore 쓰기 없이는 못 본다. 코드만 읽음(`INFERRED`).
2. **프로덕션 번들 크기** — 프로덕션 빌드가 없어 dev 미압축 값만 있다. 폰트 1.49 MB만 확정.
3. **에러 상태 실물** — 네트워크를 끊어 `HomeError`를 띄우지 않았다(로그인 세션 위험). 코드만 읽음.
4. **자동 이월(D) 실물** — 발생 조건을 만들려면 카드 날짜를 과거로 써야 해서 하지 않았다.
5. **스크린리더 실측** — VoiceOver 실행 없이 DOM 구조로만 판단했다.
6. **AAA 대비** — AA만 판정했다.
