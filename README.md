# 차곡 (Chagok)

> 인스타그램 콘텐츠 기획 어시스턴트 · 1인 콘텐츠 운영자용
>
> **말하면 정리되고, 정리되면 일정이 되고, 일정이 하나씩 콘텐츠로 완성된다.**

---

## 처음 시작하는 팀원용 — 6단계

**`npm install`만으로는 동작하지 않습니다.** 아래를 순서대로 해주세요.

### 1. 클론

```bash
git clone https://github.com/gysong123/aipmmarketing.git
cd aipmmarketing
```

### 2. git 작성자 정보

이 저장소는 **전역 git 설정을 쓰지 않습니다.** 프로젝트마다 따로 지정하는 방식이라,
설정하지 않으면 커밋할 때 에러가 납니다.

```bash
git config user.name "이름"
git config user.email "이메일"
```

> `--global`을 붙이지 마세요. 이 저장소에만 적용됩니다.

### 3. 의존성 설치

```bash
npm install
```

### 4. 환경변수 ⚠️ 가장 막히기 쉬운 단계

`.env.local`은 `.gitignore`로 차단돼 있어 **클론해도 딸려오지 않습니다.**
값을 채우지 않으면 화면은 뜨지만 Firebase 연결이 안 됩니다.

```bash
cp .env.example .env.local
```

값 위치 — **Firebase 콘솔 > 프로젝트 설정 > 내 앱 > SDK 설정 및 구성**

> ⚠️ **Firebase 프로젝트 ID는 `chagok-aa563`입니다.**
> 표시 이름(`Chagok`)과 다릅니다. `chagok`으로 쓰면 "project not found"가 납니다.

가장 빠른 방법은 팀 리드에게 `.env.local` 내용을 받는 것입니다.
`NEXT_PUBLIC_` 값 6개는 브라우저에 노출되는 값이라 치명적이진 않지만,
**카카오톡·이메일 대신 1Password 같은 안전한 경로로 주고받는 습관**을 권합니다.

`FIREBASE_ADMIN_*` 세 개는 **진짜 비밀입니다.** 서버 작업을 맡은 사람만 받으세요.

### 5. 브라우저 자동화 CLI

디자인 스킬은 저장소에 포함돼 있지만, **CLI와 Chrome은 각자 설치**해야 합니다.

```bash
npm install -g agent-browser
agent-browser install          # Chrome 179MB 다운로드
```

### 6. 실행

```bash
npm run dev                    # http://localhost:3000
```

> 3000번 포트가 이미 사용 중이면 Next.js가 자동으로 3001로 넘어갑니다.
> 터미널에 찍힌 주소를 확인하세요.

---

## 명령어

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run typecheck` | 타입 검사만 |
| `npm run lint` | ESLint |
| **`npm run verify`** | **typecheck + lint + build — 커밋 전에 반드시 실행** |
| `firebase emulators:start` | Auth 9099 · Firestore 8080 · UI 4000 |

---

## 문서 — 코드보다 먼저 읽을 것

| 파일 | 내용 |
|---|---|
| [`PRD.md`](PRD.md) | 기획 — 문제 정의 · 타깃 · MVP 범위 · 유저 여정 · 지표 |
| [`DESIGN.md`](DESIGN.md) | 디자인 시스템 — **색·타이포·컴포넌트의 정본** |
| [`CLAUDE.md`](CLAUDE.md) · [`AGENTS.md`](AGENTS.md) | AI 코딩 도구용 규칙 |

**두 문서에는 근거 등급이 붙어 있습니다.**

```
[확정]    문서로 결정됨 — 그대로 따른다
[가설]    근거 없음, 검증 대상
[미검증]  데이터 대기 중
[v2]      v1 범위 밖 — 만들지 않는다
```

> **`[확정]`이 아닌 값을 코드에서 확정처럼 쓰지 마세요.**
> 특히 `DESIGN.md` §18과 `PRD.md` §10에 「아직 정하지 않은 것」 목록이 있습니다.
> 거기 있는 값이 필요해지면 **임의로 정하지 말고 물어보세요.**

---

## 기술 스택

| | |
|---|---|
| 프레임워크 | Next.js 16.3 (App Router · TypeScript · Tailwind CSS 4) |
| 백엔드 | Firebase — Auth · Firestore |
| 배포 | Firebase App Hosting *(미구성 — Blaze 요금제 필요)* |
| 카드뉴스 렌더링 | Python / Pillow *(실행 위치 미정 — `PRD.md` §10-11)* |

### 폴더 구조

```
src/
  app/                  App Router — 화면 19개 라우트 (PLAN.md §4)
  types/                핵심 객체 타입 — User · Plan · Card (PLAN.md §2의 코드판)
  lib/firebase/
    env.ts              환경변수 접근 · 검증
    client.ts           브라우저용 SDK (지연 초기화)
    admin.ts            서버 전용 SDK — 클라이언트에서 import 금지
firebase.json           Firestore 규칙 + 에뮬레이터 포트
firestore.rules         컬렉션 3개(users·plans·cards)의 접근 규칙 — PLAN.md §7 구현
```

> **`src/lib/firebase/admin.ts`를 클라이언트 컴포넌트에서 import하지 마세요.**
> 보안 규칙을 전부 우회하는 모듈이라, 브라우저 번들에 섞이면 DB 전체가 열립니다.
> 최상단의 `server-only`가 빌드를 실패시키도록 막아뒀습니다.

---

## Firestore를 만질 때 — 규칙 3개

Firestore 같은 NoSQL은 **틀린 필드 이름으로 저장해도 에러가 나지 않습니다.**
SQL이라면 없는 컬럼에 쓰는 순간 막아주지만, Firestore는 세 사람이 각자
`publishedAt` / `published_at` / `publishDate`로 저장해도 조용히 다 받아줍니다 —
그리고 몇 주 뒤 조회 화면이 반쯤 비어서야 발견됩니다.

그래서 스키마를 지키는 책임이 DB가 아니라 **우리 습관**에 있습니다. 규칙은 3개뿐입니다.

```
① Firestore를 읽고 쓰는 코드는 반드시 src/types의 타입을 import해서 쓴다.
   AI에게 시킬 때도 "src/types의 Card 타입을 따라"라고 지시한다.
② 필드를 새로 만들거나 바꾸고 싶으면 코드가 아니라 PLAN.md §7부터 고친다.
   (승인 → PLAN.md 수정 + 변경 이력 → src/types 수정 → 코드 순서)
③ 개발 중에는 실제 DB가 아니라 에뮬레이터(firebase emulators:start)에 붙는다.
```

`firestore.rules`가 마지막 안전망입니다 — 남의 데이터 접근, AI 생성 필드
(slides·caption 등) 클라이언트 쓰기, 카드 삭제는 DB가 거부합니다.
다만 규칙은 «틀린 접근»을 막지 «틀린 철자»는 못 막으므로, ①이 가장 중요합니다.

---

## 커밋 전 체크

```bash
npm run verify          # 반드시 통과시킬 것
git status              # .env.local 이 목록에 없는지 확인
```

`.gitignore`가 환경변수·Firebase 서비스 계정 키·인증서를 차단하고 있지만,
**커밋 직전에 `git status`로 한 번 더 확인하는 습관**을 권합니다.

---

## 팀

3인 · 화면 묶음별 분담
