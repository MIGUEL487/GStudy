import { useCallback, useEffect, useRef, useState } from "react";

export function isScrolledNearBottom(element: HTMLElement | null, threshold = 80): boolean {
  return !element || element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}
export function autoScrollPreservingUser(
  element: HTMLElement | null,
  forceBottom = false,
  threshold = 80,
) {
  if (!element || (!forceBottom && !isScrolledNearBottom(element, threshold))) return;
  if (typeof element.scrollTo === "function")
    element.scrollTo({
      top: element.scrollHeight,
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  else element.scrollTop = element.scrollHeight;
}
export type StreamingState = {
  text: string;
  isStreaming: boolean;
  isStopped: boolean;
  error: string | null;
  partialTokens: number;
};
export const STREAMING_THROTTLE_MS = 50;
type Source = AsyncIterable<string> | string;
async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort = () => {};
  const cancellation = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([promise, cancellation]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
type Run = {
  controller: AbortController;
  text: string;
  timer?: ReturnType<typeof setTimeout> | undefined;
};

export function useStreamingText(options?: {
  onChunk?: (partial: string) => void;
  onFinish?: (fullText: string) => void;
  scrollRef?: React.RefObject<HTMLElement | null>;
}) {
  const [state, setState] = useState<StreamingState>({
    text: "",
    isStreaming: false,
    isStopped: false,
    error: null,
    partialTokens: 0,
  });
  const active = useRef<Run | null>(null);
  const mounted = useRef(true);
  const callbacks = useRef(options);
  callbacks.current = options;
  const flush = useCallback((run: Run) => {
    clearTimeout(run.timer);
    run.timer = undefined;
    if (!mounted.current || active.current !== run) return;
    const element = callbacks.current?.scrollRef?.current ?? null;
    const follow = isScrolledNearBottom(element);
    setState((previous) => ({
      ...previous,
      text: run.text,
      partialTokens: Math.ceil(run.text.length / 4),
    }));
    if (element && follow && typeof requestAnimationFrame === "function")
      requestAnimationFrame(() => {
        if (mounted.current && active.current === run) autoScrollPreservingUser(element, true);
      });
  }, []);
  const stop = useCallback(() => {
    const run = active.current;
    if (!run) return;
    run.controller.abort();
    flush(run);
    if (mounted.current)
      setState((previous) => ({ ...previous, isStreaming: false, isStopped: true }));
  }, [flush]);
  const start = useCallback(
    async (source: Source | ((signal: AbortSignal) => Promise<Source>), initialText = "") => {
      const previous = active.current;
      if (previous) {
        previous.controller.abort();
        clearTimeout(previous.timer);
      }
      const run: Run = { controller: new AbortController(), text: initialText };
      active.current = run;
      const signal = run.controller.signal;
      setState({
        text: initialText,
        isStreaming: true,
        isStopped: false,
        error: null,
        partialTokens: 0,
      });
      autoScrollPreservingUser(callbacks.current?.scrollRef?.current ?? null, true);
      let error: string | null = null;
      const append = (chunk: string) => {
        if (signal.aborted || active.current !== run) return;
        run.text += chunk;
        callbacks.current?.onChunk?.(run.text);
        if (!run.timer) run.timer = setTimeout(() => flush(run), STREAMING_THROTTLE_MS);
      };
      try {
        const resolved =
          typeof source === "function" ? await abortable(source(signal), signal) : source;
        if (typeof resolved === "string")
          append(resolved); // Cached/full responses appear immediately.
        else {
          const iterator = resolved[Symbol.asyncIterator]();
          try {
            while (!signal.aborted) {
              let abort: () => void = () => {};
              const interrupted = new Promise<IteratorResult<string>>((resolve) => {
                abort = () => resolve({ done: true, value: undefined });
                signal.addEventListener("abort", abort, { once: true });
              });
              const next = await Promise.race([iterator.next(), interrupted]).finally(() =>
                signal.removeEventListener("abort", abort),
              );
              if (next.done) break;
              append(next.value);
            }
          } finally {
            if (signal.aborted) void iterator.return?.().catch(() => {});
          }
        }
      } catch (cause) {
        if (!signal.aborted)
          error =
            cause instanceof Error
              ? cause.message
              : "A conexão foi interrompida. O texto recebido foi preservado.";
      } finally {
        flush(run);
        if (mounted.current && active.current === run) {
          setState((previous) => ({
            ...previous,
            text: run.text,
            isStreaming: false,
            isStopped: signal.aborted,
            error,
          }));
          callbacks.current?.onFinish?.(run.text);
        }
      }
      return { text: run.text, stopped: signal.aborted, error };
    },
    [flush],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.controller.abort();
      clearTimeout(active.current?.timer);
    };
  }, []);
  return {
    ...state,
    start,
    stop,
    setText: (text: string) => {
      if (active.current) active.current.text = text;
      setState((previous) => ({ ...previous, text }));
    },
  };
}
