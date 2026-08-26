/**
 * Firebase 환경변수 접근 지점.
 *
 * 값이 비어 있어도 **모듈을 import하는 것만으로는 절대 실패하지 않는다.**
 * Next.js가 빌드 중 페이지를 프리렌더할 때 이 모듈이 함께 로드되므로,
 * import 시점에 던지면 값을 채우기 전에는 빌드 자체가 불가능해진다.
 * 검증은 실제로 값을 쓰는 함수를 호출할 때만 한다.
 */

/** 브라우저에 노출되는 값. 도메인 등록으로 보호되며 비밀이 아니다. */
export type FirebaseClientEnv = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

/** 서버 전용. 절대 클라이언트로 나가면 안 된다. */
export type FirebaseServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

/**
 * `NEXT_PUBLIC_` 변수는 빌드 시점에 문자열로 치환된다.
 * `process.env[key]` 처럼 동적으로 접근하면 치환되지 않으므로
 * 반드시 전체 이름을 그대로 적어야 한다.
 */
const CLIENT_KEYS = {
  apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
  authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  storageBucket: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
} as const;

function readClientEnv(): Record<keyof FirebaseClientEnv, string | undefined> {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

/** 값이 전부 채워졌는지만 확인한다. 던지지 않는다. */
export function hasFirebaseClientEnv(): boolean {
  return Object.values(readClientEnv()).every((v) => typeof v === "string" && v.length > 0);
}

/**
 * 클라이언트 설정을 읽는다. 비어 있으면 **무엇이 비었는지** 알려주며 실패한다.
 * @throws 값이 하나라도 비어 있을 때
 */
export function getFirebaseClientEnv(): FirebaseClientEnv {
  const raw = readClientEnv();
  const missing = (Object.keys(CLIENT_KEYS) as (keyof FirebaseClientEnv)[]).filter(
    (k) => !raw[k],
  );

  if (missing.length > 0) {
    throw new Error(
      [
        "Firebase 클라이언트 설정이 비어 있습니다.",
        `비어 있는 값: ${missing.map((k) => CLIENT_KEYS[k]).join(", ")}`,
        ".env.local 에 값을 채운 뒤 개발 서버를 다시 시작하세요.",
        "값은 Firebase 콘솔 > 프로젝트 설정 > 내 앱 > SDK 설정 및 구성에서 확인할 수 있습니다.",
      ].join("\n"),
    );
  }

  return raw as FirebaseClientEnv;
}

/**
 * 서비스 계정 환경변수를 읽는다. 없으면 null — 이 경우 Admin SDK는
 * 애플리케이션 기본 자격증명(ADC)으로 초기화한다.
 *
 * 던지지 않는다. "없음"은 오류가 아니라 배포 환경의 정상 상태다.
 */
export function getFirebaseServerEnv(): FirebaseServiceAccount | null {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !rawKey) return null;

  return { projectId, clientEmail, privateKey: normalizePrivateKey(rawKey) };
}

/**
 * private key의 줄바꿈 복원.
 *
 * `.env` 파일은 값에 실제 줄바꿈을 담을 수 없어 `\n` 두 글자로 넣게 된다.
 * 그대로 쓰면 PEM 파싱이 실패하므로 진짜 줄바꿈으로 되돌린다.
 * 값을 따옴표로 감싼 경우 앞뒤 따옴표도 걷어낸다.
 */
export function normalizePrivateKey(key: string): string {
  return key.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n");
}
