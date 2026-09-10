import "server-only";

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

/**
 * 운영 설정 (백오피스 기획 §2-⑤) — Firestore `ops/flags` · `ops/config`.
 *
 * 코드가 아니라 DB에 두는 이유: 목적 자체가 «배포 없이 변경»이다.
 * 긴급 스위치는 사고 대응용이라 60초 캐시(1분 내 전파), 나머지 설정은 5분 캐시.
 * 문서가 없거나 읽기에 실패하면 **기본값으로 동작한다** — 운영 설정이 서비스를
 * 멈추는 새 장애 지점이 되면 안 된다.
 */

export type OpsFlags = {
  /** 기획 대화·카드 생성(Claude 호출 계열) 허용 여부 */
  planningEnabled: boolean;
  /** 이미지 생성(GPTProto 지출 계열) 허용 여부 */
  imageGenEnabled: boolean;
  /** 꺼졌을 때 사용자에게 보여줄 안내 문구. 비우면 기본 문구 */
  disabledMessage: string;
};

export type OpsConfig = {
  /** 하루 기획 생성 상한 (PRD §4 무료 범위 — 레이트리밋이 읽는다) */
  maxPlansPerDay: number;
  /** 기획 대화 세션당 턴 상한 */
  maxTurnsPerSession: number;
  /** 슬라이드당 재생성 상한 */
  maxRegenPerSlide: number;
  /** 기획당 카드 상한 (lib/audiences.ts MAX_CARDS_PER_RUN의 운영값) */
  maxCardsPerRun: number;
  /** 무료 배치 범위(주) */
  scheduleWeeks: number;
  /** 대표 문의 연락처. 미정이면 빈 문자열 */
  contactEmail: string;
};

export const DEFAULT_FLAGS: OpsFlags = {
  planningEnabled: true,
  imageGenEnabled: true,
  disabledMessage: "",
};

export const DEFAULT_CONFIG: OpsConfig = {
  maxPlansPerDay: 5,
  maxTurnsPerSession: 12,
  maxRegenPerSlide: 2,
  maxCardsPerRun: 8,
  scheduleWeeks: 4,
  contactEmail: "",
};

const FALLBACK_DISABLED_MESSAGE =
  "지금은 잠시 정비 중이에요. 조금 뒤에 다시 시도해주세요.";

/**
 * 템플릿 진열 속성 (백오피스 기획 §2-① · `ops/styles`).
 *
 * **`order`는 담지 않는다.** 기획 화면이 고를 수 있는 템플릿의 순서를 매번 섞기
 * 때문이다(plan/new 09-02 — 앞자리 편향 방지). 백오피스의 드래그 정렬은 관리
 * 목록을 보기 좋게 하는 용도로만 남는다. 서비스 진열 순서 도입은 팀 결정 대기.
 */
export type StyleOverlay = {
  /** 진열에서 뺀 id. **신규 선택만** 막는다 — 이미 그 템플릿으로 만든 카드는 그대로 그려진다 */
  hidden: Set<string>;
  /** 백오피스에서 바꾼 표시 이름 (없으면 코드의 label) */
  names: Record<string, string>;
};

const FLAGS_TTL_MS = 60 * 1000;
const CONFIG_TTL_MS = 5 * 60 * 1000;
const STYLES_TTL_MS = 60 * 1000;

let flagsCache: { value: OpsFlags; at: number } | null = null;
let configCache: { value: OpsConfig; at: number } | null = null;
let stylesCache: { value: StyleOverlay; at: number } | null = null;

/** admin API가 값을 바꾼 직후 호출 — 이 서버 인스턴스의 캐시를 비운다 */
export function invalidateOpsCache(): void {
  flagsCache = null;
  configCache = null;
  stylesCache = null;
}

function pickBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function pickNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}
function pickStr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

export async function getOpsFlags(): Promise<OpsFlags> {
  if (flagsCache && Date.now() - flagsCache.at < FLAGS_TTL_MS) return flagsCache.value;
  let value = DEFAULT_FLAGS;
  try {
    const raw = (await adminDb.doc("ops/flags").get()).data() ?? {};
    value = {
      planningEnabled: pickBool(raw.planningEnabled, DEFAULT_FLAGS.planningEnabled),
      imageGenEnabled: pickBool(raw.imageGenEnabled, DEFAULT_FLAGS.imageGenEnabled),
      disabledMessage: pickStr(raw.disabledMessage, DEFAULT_FLAGS.disabledMessage),
    };
  } catch (e) {
    console.error("ops/flags 읽기 실패 — 기본값으로 동작", e);
  }
  flagsCache = { value, at: Date.now() };
  return value;
}

export async function getOpsConfig(): Promise<OpsConfig> {
  if (configCache && Date.now() - configCache.at < CONFIG_TTL_MS) return configCache.value;
  let value = DEFAULT_CONFIG;
  try {
    const raw = (await adminDb.doc("ops/config").get()).data() ?? {};
    value = {
      maxPlansPerDay: pickNum(raw.maxPlansPerDay, DEFAULT_CONFIG.maxPlansPerDay),
      maxTurnsPerSession: pickNum(raw.maxTurnsPerSession, DEFAULT_CONFIG.maxTurnsPerSession),
      maxRegenPerSlide: pickNum(raw.maxRegenPerSlide, DEFAULT_CONFIG.maxRegenPerSlide),
      maxCardsPerRun: pickNum(raw.maxCardsPerRun, DEFAULT_CONFIG.maxCardsPerRun),
      scheduleWeeks: pickNum(raw.scheduleWeeks, DEFAULT_CONFIG.scheduleWeeks),
      contactEmail: pickStr(raw.contactEmail, DEFAULT_CONFIG.contactEmail),
    };
  } catch (e) {
    console.error("ops/config 읽기 실패 — 기본값으로 동작", e);
  }
  configCache = { value, at: Date.now() };
  return value;
}

function disabledResponse(flags: OpsFlags): Response {
  return NextResponse.json(
    { error: flags.disabledMessage.trim() || FALLBACK_DISABLED_MESSAGE, opsDisabled: true },
    { status: 503 },
  );
}

/**
 * 라우트 게이트 — POST 핸들러 첫머리에서 쓴다.
 * 켜져 있으면 null, 꺼져 있으면 503 응답을 돌려준다:
 *   `const gate = await planningGate(); if (gate) return gate;`
 */
export async function planningGate(): Promise<Response | null> {
  const flags = await getOpsFlags();
  return flags.planningEnabled ? null : disabledResponse(flags);
}

export async function imageGenGate(): Promise<Response | null> {
  const flags = await getOpsFlags();
  return flags.imageGenEnabled ? null : disabledResponse(flags);
}

export async function getStyleOverlay(): Promise<StyleOverlay> {
  if (stylesCache && Date.now() - stylesCache.at < STYLES_TTL_MS) return stylesCache.value;
  let value: StyleOverlay = { hidden: new Set(), names: {} };
  try {
    const raw = (await adminDb.doc("ops/styles").get()).data() ?? {};
    value = {
      hidden: new Set(Array.isArray(raw.hidden) ? (raw.hidden as string[]) : []),
      names:
        raw.names && typeof raw.names === "object"
          ? (raw.names as Record<string, string>)
          : {},
    };
  } catch (e) {
    // 진열 속성을 못 읽으면 코드 정의 그대로 — 전부 보이는 쪽으로 연다
    console.error("ops/styles 읽기 실패 — 코드 정의 그대로 동작", e);
  }
  stylesCache = { value, at: Date.now() };
  return value;
}
