/**
 * ⛔️ 클라이언트 코드에서 import 금지.
 *
 * 이 모듈은 서비스 계정 자격증명을 다루며 Firestore 보안 규칙을 **전부 우회**한다.
 * 브라우저 번들에 섞여 들어가면 그 순간 서비스 전체가 열린다.
 * 최상단의 `server-only`가 클라이언트 컴포넌트에서 import될 경우 빌드를 실패시킨다.
 *
 * 사용처: API route, Server Action, 서버 스크립트.
 *
 * 초기화는 첫 사용 시점까지 미룬다 — .env.local이 비어 있어도 빌드는 통과해야 한다.
 */

import "server-only";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getFirebaseServerEnv } from "./env";

const ADMIN_APP_NAME = "admin";

/**
 * 자격증명 선택
 *
 * - 서비스 계정 환경변수가 **있으면** `cert()` — 로컬 개발에서 쓴다.
 * - **없으면** `applicationDefault()` — 배포 환경(App Hosting·Cloud Run 등)에서는
 *   플랫폼이 자격증명을 주입하므로 키 파일을 둘 필요가 없다. 키를 다루지
 *   않는 쪽이 언제나 더 안전하다.
 */
export function getAdminApp(): App {
  const existing = getApps().find((a) => a.name === ADMIN_APP_NAME);
  if (existing) return existing;

  const serviceAccount = getFirebaseServerEnv();

  if (serviceAccount) {
    return initializeApp(
      {
        credential: cert({
          projectId: serviceAccount.projectId,
          clientEmail: serviceAccount.clientEmail,
          privateKey: serviceAccount.privateKey, // 줄바꿈은 env.ts에서 복원한다
        }),
        projectId: serviceAccount.projectId,
      },
      ADMIN_APP_NAME,
    );
  }

  /*
    `applicationDefault()`는 초기화 시점에 자격증명을 확인하지 않는다.
    아무것도 없어도 initializeApp은 성공하고, 첫 Firestore 호출에서야
    원인을 알기 어려운 에러가 난다. 그래서 ADC를 쓸 수 있는 환경인지
    먼저 확인하고, 아니면 지금 이 자리에서 무엇을 채워야 하는지 알린다.
  */
  if (!canUseApplicationDefault()) {
    throw new Error(
      [
        "Firebase Admin 자격증명을 찾지 못했습니다.",
        ".env.local 에 아래 세 값을 채우세요.",
        "  FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY",
        "값은 Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성으로 받은 JSON 안에 있습니다.",
        "(배포 환경에서는 플랫폼이 주입하는 기본 자격증명을 쓰므로 이 값들이 필요 없습니다.)",
      ].join("\n"),
    );
  }

  return initializeApp({ credential: applicationDefault() }, ADMIN_APP_NAME);
}

/**
 * 애플리케이션 기본 자격증명(ADC)을 쓸 수 있는 환경인지 본다.
 * 키 파일 경로가 지정됐거나, GCP 런타임 위에서 돌고 있으면 참.
 */
function canUseApplicationDefault(): boolean {
  return Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.K_SERVICE || // Cloud Run / App Hosting
      process.env.FUNCTION_TARGET || // Cloud Functions
      process.env.GAE_ENV || // App Engine
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT,
  );
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

/** 자격증명이 준비됐는지 확인만 한다. 던지지 않는다 */
export function hasAdminCredentials(): boolean {
  return getFirebaseServerEnv() !== null;
}

/* 지연 평가 — import만으로는 초기화되지 않는다 (client.ts와 같은 방식) */
function lazy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get: (_target, prop, receiver) => Reflect.get(resolve(), prop, receiver),
    set: (_target, prop, value) => Reflect.set(resolve(), prop, value),
    has: (_target, prop) => Reflect.has(resolve(), prop),
    getPrototypeOf: () => Reflect.getPrototypeOf(resolve()),
    ownKeys: () => Reflect.ownKeys(resolve()),
    getOwnPropertyDescriptor: (_target, prop) => {
      const d = Reflect.getOwnPropertyDescriptor(resolve(), prop);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}

export const adminAuth: Auth = lazy(getAdminAuth);
export const adminDb: Firestore = lazy(getAdminDb);
