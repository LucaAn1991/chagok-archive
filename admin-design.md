# CHAGOK Admin Design System

> **이 문서는 백오피스(/admin) UI의 절대 기준이다** (가영 님 확정 09-08).
> 서비스 UI의 DESIGN.md와 별개다 — 백오피스에는 이 문서만 적용한다.
> 공통 컴포넌트는 `src/components/admin/`에 있고, 페이지는 새 시각 패턴을
> 만들지 말고 그 컴포넌트를 재사용한다.

Purpose
- Internal admin tool
- Function over decoration
- Traditional SaaS admin UI
- Dense but readable
- No consumer-app styling

Reference
- Ant Design / Ant Design Pro
- Linear-like restraint, but not dark
- Conventional enterprise admin UI

Layout
- Desktop first
- Min width: 1280px
- Sidebar: 224px
- Header: 56px
- Content padding: 24px
- Max content width: none

Colors
- Background: #F5F5F5
- Surface: #FFFFFF
- Border: #E5E7EB
- Primary text: #1F2937
- Secondary text: #6B7280
- Primary action: #1677FF
- Success: green
- Warning: orange
- Error: red

Style
- Border radius: 6px
- No gradients
- No illustrations
- No excessive shadows
- No oversized cards
- No glassmorphism
- No decorative icons
- Use icons only when functional

Typography
- Page title: 24px / semibold
- Section title: 16px / semibold
- Body: 14px
- Table: 14px
- Caption: 12px

Table
- Default admin UI component
- Sticky header when long
- Row hover
- Checkbox only when bulk action exists
- Action column on right
- Pagination bottom right

Filter
- Search and major filters above table
- Advanced filters collapsed when possible

Status
- Use conventional tags:
Active / Pending / Suspended / Deleted

Interaction
- Detail: Drawer preferred
- Simple confirmation: Modal
- Large edits: separate page
- Success/failure: Toast

Do not invent new visual patterns.
Reuse existing components wherever possible.

---

공통 컴포넌트 (여기 있는 것만 쓴다)

| 컴포넌트 | 용도 |
|---|---|
| AdminLayout | 인증 + Sidebar + Header + 전역 경고 배너 + content 영역 |
| Sidebar | 좌측 224px 내비게이션 |
| Header | 상단 56px — 검색·계정 |
| PageHeader | Breadcrumb + 페이지 제목(24px) + 우측 Action |
| FilterBar | 테이블 위 검색·필터 줄 |
| DataTable | 기본 데이터 표 — sticky header·hover·우측 action·우하단 pagination |
| StatusTag | Active/Pending/Suspended/Deleted 관례 태그 |
| EmptyState | 데이터 없음 표시 |
| ConfirmModal | 단순 확인(위험 행위는 danger + 사유 입력) |
| DetailDrawer | 상세는 우측 Drawer |
