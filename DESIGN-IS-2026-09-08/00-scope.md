# 00 — Scope Lock

**감사일** 2026-09-08
**감사 대상** chagok 홈 화면 (`/`, 로그인 상태)

## 무엇을 감사하는가

| | |
|---|---|
| 라우트 | `/` — 로그인 시 `Home`, 비로그인 시 `Landing` |
| 주 파일 | `src/app/page.tsx` (1,001줄) |
| 종속 컴포넌트 | `AppTopNav`, `MobileBottomNav`, `PageHeader`, `FeaturedContentCard`, `TodayCardRail` |
| 종속 lib | `src/lib/format.ts`, `src/lib/greetings.ts`, `src/lib/legal/consent-client.ts` |
| 실행 인스턴스 | `http://localhost:3000` (dev 서버 PID 55803, 이미 구동 중) |

**감사 범위 밖** — `/calendar`, `/plan/new`, `/card/*`, `/onboarding`, `/settings/*`, `/consent`. 홈에서 링크로 나가는 지점까지만 본다.

## 주 사용자와 주 과업

**주 사용자** (PRD.md:125)
> 인스타그램으로 자신의 전문성·활동·상품을 알려야 하지만 마케팅이 본업은 아닌 1인 콘텐츠 운영자

**주 과업** — 홈에 들어온 순간 **「지금 무엇을 해야 하는지」 하나를 알고 그것을 시작한다.**
`src/app/page.tsx:33` 주석이 이 목적을 명시한다: *「사용자가 지금 무엇을 해야 하는지 하나를 정해서 보여준다」(DESIGN.md §9). 대시보드처럼 지표를 나열하지 않는다.*

홈은 상황을 A→B→C→E→D 순서로 판정해 **하나만** 보여준다 (`page.tsx:359-370`):

| 분기 | 조건 | 주 행동 |
|---|---|---|
| A | 오늘 배정 카드 있음 | 제작하기 |
| B | 오늘 카드 없음 + 발행 요일 | 한 줄 입력창 |
| C | 앞으로 배정된 카드 있음 | {상대일} + 미리 제작하기 |
| E | 날짜 없는 카드만 있음 | 날짜 정해주기 |
| D | 배정 카드 없음(빈 상태) | 큰 입력창 → AI 기획 |

## 제약

- **디자인 정본은 `DESIGN.md`** (54,665 bytes). 색·타이포·컴포넌트 규칙이 여기 있고, 코드가 아니라 이 문서가 기준이다.
- **근거 등급 체계** — `[확정]` / `[가설]` / `[미검증]` / `[v2]`. `[확정]`이 아닌 값을 확정처럼 쓰면 안 된다.
- 스택 — Next.js 16.3 App Router · React 19 · Tailwind CSS 4 · Firebase Auth/Firestore
- UI 문구는 전부 한국어 (`CLAUDE.md` 코딩규칙 6)
- 접근성 하한 — `DESIGN.md`에 실측 대비비가 기록돼 있음 (예: `page.tsx:604` 주석 「berry-dark on berry-light = 4.85:1 (실측)」)

## 참조 디자인

`PRD.md:265`가 비교 대상을 명시한다:
> ① 우리 사용자가 실제로 쓰는 것 — Canva · 인스타 앱 · 메모장 · 카톡 나에게 보내기

경쟁 매트릭스는 `PRD-DECK-DIFF.md`에 있다.

## 증거 수집 방식

사용자 선택: **dev 서버 실측**.

**알려진 제약** — 홈(`Home` 컴포넌트)은 Firebase 로그인 뒤에만 렌더된다. 비로그인 시 `/`는 `Landing`을 반환한다. 따라서:
- 로그인 없이 실측 가능: 초기 번들, 요청 수, `/` 응답 시간 (단 Landing 기준)
- 로그인 필요: 홈의 실제 대비비·상태별 스크린샷·A~E 분기 렌더

이 제약은 `01-evidence.md`에서 항목별로 `MEASURED` / `INFERRED`로 구분해 표기한다.
