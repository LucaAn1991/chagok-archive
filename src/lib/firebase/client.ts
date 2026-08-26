/**
 * Firebase Client SDK — 브라우저에서 쓰는 초기화.
 *
 * `NEXT_PUBLIC_` 변수만 읽는다. 서비스 계정 키 같은 서버 비밀은 절대 여기에 오지 않는다.
 * 클라이언트 apiKey는 브라우저가 직접 불러가므로 숨길 수 없는 **식별자**이고,
 * 보호는 값의 은닉이 아니라 Firebase 콘솔의 승인된 도메인 등록으로 이뤄진다.
 *
 * 초기화는 **첫 사용 시점까지 미룬다.** import만으로 초기화하면
 * .env.local이 비어 있는 동안 빌드가 통과하지 못한다.
 *
 * Storage는 아직 이 프로젝트에서 쓰지 않는다. 필요해지면
 * `firebase/storage`의 `getStorage`를 여기에 같은 형태로 추가한다.
 */

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFirebaseClientEnv } from "./env";

const APP_NAME = "[DEFAULT]";

/** 이미 초기화된 앱이 있으면 재사용한다 (HMR·중복 import 대비) */
export function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp(APP_NAME);
  return initializeApp(getFirebaseClientEnv());
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function getFirebaseDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

/*
  아래 세 값은 지연 평가된다.
  `import { db } from "@/lib/firebase/client"` 한 것만으로는 초기화되지 않고,
  실제로 속성에 접근하는 순간 위 함수가 호출된다.
  덕분에 환경변수가 비어 있어도 빌드가 깨지지 않는다.
*/
function lazy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get: (_target, prop, receiver) => Reflect.get(resolve(), prop, receiver),
    set: (_target, prop, value) => Reflect.set(resolve(), prop, value),
    has: (_target, prop) => Reflect.has(resolve(), prop),
    getPrototypeOf: () => Reflect.getPrototypeOf(resolve()),
    ownKeys: () => Reflect.ownKeys(resolve()),
    getOwnPropertyDescriptor: (_target, prop) => {
      const d = Reflect.getOwnPropertyDescriptor(resolve(), prop);
      // Proxy 불변식: 대상에 없는 속성은 configurable이어야 한다
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}

export const app: FirebaseApp = lazy(getFirebaseApp);
export const auth: Auth = lazy(getFirebaseAuth);
export const db: Firestore = lazy(getFirebaseDb);
