/**
 * GPTProto 경유 `gpt-image-2` 호출 — 시안 템플릿의 글자를 바꿔치기한다 (09-02).
 *
 * **비동기 2단계다.** POST로 접수하고 `data.urls.get`을 결과가 나올 때까지 두드린다.
 * 폴링 주소는 **응답이 준 것을 그대로 쓴다** — 문서가 조립하지 말라고 못박았고,
 * 경로가 바뀌면 조립한 쪽만 조용히 깨진다.
 *
 * 한 장에 **2분 안팎**이 걸린다(실측 2m14s~2m27s). 그래서 부르는 쪽은 반드시
 * 여러 장을 **동시에** 던져야 한다 — 순차로 6장이면 13분이다.
 */

const EDIT_URL = "https://gptproto.com/api/v3/openai/gpt-image-2/image-edit";

/**
 * 그림 품질 (09-02). **속도와 정확도를 맞바꾼다** — 같은 템플릿·같은 문구로 실측:
 *
 * ```
 * low     23초   자리표시 문구가 세 군데 남음
 * medium  49~107초  3/5 통과. 글자가 뭉개져 안 읽히는 실패가 새로 나왔다
 * high   143초   4/5 통과
 * ```
 *
 * **`low`로 간다** (09-02 결정). 통과율은 떨어지지만 이 제품에서는 그게 낫다:
 *
 * - 자동 재시도를 없애고 **실패한 장만 사용자가 다시 만드는** 구조라
 *   (`slides/[order]/regenerate`) 한 판이 싸고 빨라야 여러 번 눌러볼 수 있다.
 * - `high`는 한 장에 2분 20초다. 다시 만들기를 누르면 또 2분 20초를 기다린다 —
 *   고쳐볼 마음이 안 든다. `low`면 23초라 **부담 없이 다시 누른다.**
 * - 실패해도 빈칸이 되지 않는다. 렌더러가 그 자리를 채운다(DESIGN.md §12).
 *
 * ⚠️ **통과율 비교는 표본이 작다.** 각 설정을 한 판(5장)씩만 돌렸고,
 * high에서 두 번 실패했던 표지가 medium에서는 통과했다 — 장마다의 운이 설정 차이만큼
 * 크다. 제대로 가르려면 설정당 3~4판(15~20장)이 필요하다.
 *
 * `IMAGE_QUALITY` 환경변수로 바꿀 수 있다 — 재보지 않고 값을 고치지 않으려고 열어뒀다.
 */
const QUALITY = process.env.IMAGE_QUALITY ?? "low";

/** 1~3초를 권장한다(문서). 더 조이면 429가 난다 */
const POLL_BASE_MS = 2500;
const TIMEOUT_MS = 6 * 60 * 1000;

/**
 * 지금 이 프로세스가 굽고 있는 장 수 (09-04).
 *
 * **폴링도 요청으로 센다.** 7장을 동시에 구우면 2.5초마다 7번 물어보니 분당 168회다 —
 * 제출(장당 1회)보다 이쪽이 분당 한도를 훨씬 크게 밀어올린다. 실측(09-04): 한 판에서
 * 5장이 **같은 밀리초에** 튕겼고 그중 하나가 429였다.
 *
 * 그래서 동시에 굽는 장이 많을수록 간격을 벌린다. 혼자면 2.5초 그대로다.
 */
let inFlight = 0;

function pollInterval(): number {
  return POLL_BASE_MS * Math.max(1, Math.ceil(inFlight / 2));
}

/** 429는 «잠시 뒤면 되는» 실패다 — 바로 포기하지 않는다 (09-04) */
const MAX_SUBMIT_TRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Envelope = {
  data?: {
    id?: string;
    status?: "created" | "running" | "completed" | "failed";
    outputs?: string[];
    urls?: { get?: string };
    error?: string | null;
  };
};

export function isImageGenConfigured(): boolean {
  return Boolean(process.env.GPTPROTO_API_KEY);
}

export type EditResult =
  | { ok: true; png: Buffer }
  | { ok: false; reason: string };

/**
 * 템플릿 한 장의 글자를 바꿔 새 PNG를 받는다.
 *
 * **던지지 않는다.** 실패는 `ok: false`로 돌려준다 — 카드뉴스는 여러 장을 동시에
 * 만드는데 한 장이 던지면 `Promise.all`이 통째로 무너진다. 부르는 쪽이 장별로
 * 다시 시도하거나 렌더러로 물러설 수 있어야 한다.
 */
export async function editImage(input: {
  /** 원본 템플릿 주소 — 공개적으로 내려받을 수 있어야 한다 (data URI 불가) */
  sourceUrl: string;
  /**
   * 함께 넘길 참조 그림 — 사용자가 올린 사진 (09-02). 템플릿 **다음** 순서로 들어간다.
   * 프롬프트에서 「두 번째 그림을 틀 안에 넣어라」처럼 순서로 가리킨다.
   * 문서상 최대 16장이라 템플릿 1장 + 사진 15장까지다.
   */
  photoUrls?: string[];
  prompt: string;
  signal?: AbortSignal;
}): Promise<EditResult> {
  const key = process.env.GPTPROTO_API_KEY;
  if (!key) return { ok: false, reason: "GPTPROTO_API_KEY가 없습니다." };

  inFlight++;
  try {
    return await run();
  } finally {
    inFlight--;
  }

  async function run(): Promise<EditResult> {
  let submit: Response;
  /*
    429(분당 한도)는 기다리면 풀리는 실패다 — 한 번에 포기하면 그 장이 통째로
    밋밋한 렌더러로 떨어진다. 물러났다가 다시 낸다 (09-04).
    지터를 섞는 이유 — 같이 튕긴 장들이 **동시에** 다시 몰려오면 또 429다.
  */
  for (let attempt = 1; ; attempt++) {
    try {
      submit = await fetch(EDIT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          images: [input.sourceUrl, ...(input.photoUrls ?? [])].slice(0, 16),
          prompt: input.prompt,
          n: 1,
          quality: QUALITY,
          size: "1024x1024",
          response_format: "url",
        }),
        signal: input.signal,
      });
    } catch (e) {
      return { ok: false, reason: `접수 실패: ${e instanceof Error ? e.message : e}` };
    }

    if (submit.status !== 429 || attempt >= MAX_SUBMIT_TRIES) break;
    await submit.text().catch(() => ""); // 연결을 비워준다
    const wait = 5000 * attempt + Math.random() * 3000;
    console.warn(`[imagegen] 429 — ${Math.round(wait / 1000)}초 뒤 다시 냅니다 (${attempt}/${MAX_SUBMIT_TRIES - 1})`);
    await sleep(wait);
  }

  if (!submit.ok) {
    // 상태 코드만으론 원인을 못 찾는다 — 본문을 잘라서 남긴다 (08-31에 같은 교훈)
    const detail = await submit.text().catch(() => "");
    return { ok: false, reason: `HTTP ${submit.status} ${detail.slice(0, 200)}` };
  }

  const accepted = (await submit.json().catch(() => null)) as Envelope | null;
  const pollUrl = accepted?.data?.urls?.get;
  if (!pollUrl) return { ok: false, reason: "결과 주소가 오지 않았습니다." };

  const started = Date.now();
  for (;;) {
    if (Date.now() - started > TIMEOUT_MS) return { ok: false, reason: "시간 초과" };
    await sleep(pollInterval());

    let body: Envelope | null;
    try {
      const res = await fetch(pollUrl, {
        headers: { Authorization: `Bearer ${key}` },
        signal: input.signal,
      });
      /*
        조회가 429면 **포기하지 않는다** (09-04) — 그림은 서버에서 잘 만들어지고 있는데
        우리가 너무 자주 물어본 것뿐이다. 여기서 반환하면 멀쩡한 장을 버리게 된다.
      */
      if (res.status === 429) continue;
      if (!res.ok) return { ok: false, reason: `조회 실패 HTTP ${res.status}` };
      body = (await res.json()) as Envelope;
    } catch (e) {
      return { ok: false, reason: `조회 실패: ${e instanceof Error ? e.message : e}` };
    }

    const status = body?.data?.status;
    if (status === "failed") return { ok: false, reason: body?.data?.error ?? "생성 실패" };
    if (status !== "completed") continue;

    const out = body?.data?.outputs?.[0];
    if (!out) return { ok: false, reason: "완료됐지만 결과가 비어 있습니다." };

    // `response_format: "url"`이라 주소가 온다. base64로 오는 설정도 받아둔다
    if (!out.startsWith("http")) return { ok: true, png: Buffer.from(out, "base64") };
    try {
      const img = await fetch(out, { signal: input.signal });
      if (!img.ok) return { ok: false, reason: `그림 내려받기 실패 HTTP ${img.status}` };
      return { ok: true, png: Buffer.from(await img.arrayBuffer()) };
    } catch (e) {
      return { ok: false, reason: `내려받기 실패: ${e instanceof Error ? e.message : e}` };
    }
  }
  }
}
