import type { AiEvent } from "./ai-event-stream";

export function aiEventResponse<T>(
  run: (emit: (event: AiEvent<T>) => void, signal: AbortSignal) => Promise<void>,
  requestSignal?: AbortSignal,
) {
  const cancellation = new AbortController();
  const signal = requestSignal
    ? AbortSignal.any([requestSignal, cancellation.signal])
    : cancellation.signal;
  let closed = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AiEvent<T>) => {
        if (!closed && !signal.aborted)
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        await run(emit, signal);
      } catch {
        emit({
          type: "error",
          message:
            "A resposta foi interrompida. Você pode tentar novamente mantendo o texto recebido.",
        });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
      cancellation.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
