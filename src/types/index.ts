/**
 * 핵심 객체 타입 모음 — 정의의 근거는 PLAN.md §2.
 *
 * PLAN.md의 스키마와 이 폴더가 어긋나면 코드가 아니라 문서 쪽 확인이 먼저다
 * (CLAUDE.md 「우선순위 및 충돌 처리」).
 */
export type { User, ToneKey, StyleAttributes } from "./user";
export type { Plan, PlanType, PlanStatus, PlanMessage } from "./plan";
export type {
  Card,
  CardStatus,
  PublishIntent,
  VisualType,
  Caption,
  Slide,
  LayoutId,
  ThemeId,
  TemplateId,
  ImageOrigin,
} from "./card";
