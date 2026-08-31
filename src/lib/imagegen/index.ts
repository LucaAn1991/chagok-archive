import "server-only";

/**
 * AI 이미지 생성 — 이미지 폴백 사슬의 3순위 (DESIGN.md §12 · PRD F15).
 *
 *   ① 사용자 사진 → ② 스톡(Pexels) → ③ **AI 생성** → ④ text-only
 *
 * **앞의 둘이 모두 비었을 때만 부른다.** 사용자의 진짜 사진이 언제나 낫고,
 * 호출 한 번이 곧 돈이라 스톡으로 채워지면 여기까지 오지 않는다.
 *
 * 모델은 **Seedream 5.0 Pro**(ByteDance)를 **GPTProto 경유**로 쓴다 —
 * 공식(BytePlus ModelArk) 대신 중계를 고른 이유는 +86 번호 없이 키를 만들 수 있고
 * 단가가 10% 싸기 때문이다. 프롬프트만 나가고 사용자 사진은 보내지 않는다.
 *
 * `GPTPROTO_API_KEY`가 없으면 조용히 빈손으로 돌아간다 — 그때는 ④로 내려앉아
 * 카드가 어쨌든 완성된다. 「어디서 멈춰도 완성된다」(DESIGN §12).
 */

const SUBMIT_URL =
  "https://gptproto.com/api/v3/doubao/dola-seedream-5-0-pro-260628/text-to-image";

/**
 * **크기를 반드시 지정한다.** API 기본값이 `2048x2048`인데 최대 2.6배 비싸다.
 * 카드뉴스 캔버스가 1080×1080(약 1.17MP)이라 1K로 충분하고, 1:1이라 잘림도 없다.
 */
const SIZE = "1024x1024";

/** 폴링 간격·상한. 문서 예시가 12초대라 넉넉히 잡되 무한정 기다리지 않는다 */
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 60_000;

export function isImageGenConfigured(): boolean {
  return Boolean(process.env.GPTPROTO_API_KEY);
}

type Envelope = {
  data?: {
    id?: string;
    status?: "created" | "running" | "completed" | "failed";
    outputs?: string[];
    urls?: { get?: string };
    error?: string | null;
    hasNsfwContents?: boolean[];
  };
  message?: string;
  code?: number;
};

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.GPTPROTO_API_KEY}` };
}

/**
 * 프롬프트 하나로 이미지 1장을 만들어 **바이트로** 돌려준다.
 *
 * 공급자 URL을 그대로 넘기지 않는 이유 — 그 주소의 수명이 문서에 없다.
 * 부르는 쪽이 우리 Storage에 저장하도록 바이트를 준다 (`saveServerImage`).
 *
 * 실패는 전부 `null`이다. 이미지는 «없으면 넘어가는» 재료라(DESIGN §12)
 * 여기서 던지면 카드 전체가 못 만들어진다.
 */
export async function generateImage(prompt: string): Promise<Buffer | null> {
  if (!isImageGenConfigured() || !prompt.trim()) return null;

  try {
    const submit = await fetch(SUBMIT_URL, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        size: SIZE,
        enable_base64_output: false,
        // 동기 모드로 기다리면 요청이 그만큼 붙잡힌다 — 폴링으로 받는다
        enable_sync_mode: false,
      }),
    });
    if (!submit.ok) {
      console.error(`[imagegen] submit ${submit.status}`);
      return null;
    }

    const accepted = (await submit.json()) as Envelope;
    // 문서가 «직접 만들지 말고 이 주소를 쓰라»고 한다 — 경로가 바뀌어도 따라간다
    const pollUrl =
      accepted.data?.urls?.get ??
      (accepted.data?.id
        ? `https://gptproto.com/api/v3/predictions/${accepted.data.id}/result`
        : null);
    if (!pollUrl) return null;

    const imageUrl = await pollForOutput(pollUrl);
    if (!imageUrl) return null;

    const file = await fetch(imageUrl);
    if (!file.ok) return null;
    return Buffer.from(await file.arrayBuffer());
  } catch (e) {
    console.error("[imagegen]", e);
    return null;
  }
}

/** completed가 될 때까지 기다렸다 출력 URL을 돌려준다. 실패·시간 초과는 null */
async function pollForOutput(pollUrl: string): Promise<string | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(pollUrl, { headers: authHeaders() });
    if (!res.ok) return null;

    const body = (await res.json()) as Envelope;
    const status = body.data?.status;

    if (status === "failed") {
      console.error(`[imagegen] failed: ${body.data?.error ?? "(사유 없음)"}`);
      return null;
    }
    if (status === "completed") {
      // 공급자가 부적절하다고 표시한 것은 쓰지 않는다 — 사용자 계정에 올라갈 그림이다
      if (body.data?.hasNsfwContents?.some(Boolean)) return null;
      return body.data?.outputs?.[0] ?? null;
    }
  }

  console.error("[imagegen] 시간 초과");
  return null;
}
