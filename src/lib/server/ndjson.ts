import "server-only";

/**
 * NDJSON(한 줄에 JSON 하나) 스트림 응답.
 *
 *   {"type":"delta","text":"안녕"}      ← 만들어지는 대로 여러 줄
 *   {"type":"done", ...평소의 payload}   ← 마지막 한 줄
 *   {"type":"error","error":"..."}      ← 실패했을 때
 *
 * SSE 대신 NDJSON을 쓴다 — 재연결·이벤트 이름이 필요 없는 단발 응답이고,
 * 클라이언트가 `줄 단위로 JSON.parse` 하면 끝이라 다룰 것이 적다.
 *
 * **스트림이 시작된 뒤에는 HTTP 상태코드를 바꿀 수 없다.** 그래서 실패도 200 안에서
 * `type:"error"` 줄로 알린다. 클라이언트는 이 줄을 에러로 다룬다.
 *
 * 09-02 — `plans/[planId]/messages`에만 있던 것을 꺼냈다. 기획안 다듬기(⑤)도
 * 같은 방식으로 흘려보내야 해서, 한 벌을 두고 양쪽이 쓴다.
 */
export function ndjson(
  run: (emit: (delta: string) => void) => Promise<Record<string, unknown>>,
  /** 실패를 서버 로그에 남길 때 붙일 이름 */
  tag = "ndjson",
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const line = (o: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(o)}\n`));
      try {
        const done = await run((text) => line({ type: "delta", text }));
        line({ type: "done", ...done });
      } catch (e) {
        /*
          **원인을 반드시 남긴다** (09-02). 스트림은 상태코드를 못 바꿔서 화면에는
          «응답을 만들지 못했어요» 한 줄만 간다. 서버에도 안 적으면 왜 실패했는지
          아무 데도 남지 않는다 — 실제로 잔액 부족을 한참 못 찾았다.
        */
        console.error(`[${tag}]`, e);
        line({ type: "error", error: "응답을 만들지 못했어요. 잠시 후 다시 시도해주세요." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // 중간 프록시가 모아서 보내면 스트리밍이 의미를 잃는다
      "X-Accel-Buffering": "no",
    },
  });
}
