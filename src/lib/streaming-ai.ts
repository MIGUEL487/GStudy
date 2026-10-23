import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Checks whether an element is scrolled near its bottom (within threshold px).
 * If user has scrolled up, returns false so their scroll position is respected.
 */
export function isScrolledNearBottom(element: HTMLElement | null, threshold = 80): boolean {
  if (!element) return true;
  const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distance <= threshold;
}

/**
 * Smoothly scrolls element to bottom only if user was already near the bottom,
 * or if forceBottom is true (e.g. user submitted a new query).
 */
export function autoScrollPreservingUser(
  element: HTMLElement | null,
  forceBottom = false,
  threshold = 80,
) {
  if (!element) return;
  if (forceBottom || isScrolledNearBottom(element, threshold)) {
    if (typeof element.scrollTo === "function") {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    } else {
      element.scrollTop = element.scrollHeight;
    }
  }
}

export type StreamingState = {
  text: string;
  isStreaming: boolean;
  isStopped: boolean;
  error: string | null;
  partialTokens: number;
};

/**
 * Throttle interval in milliseconds (~50ms) to prevent excessive React re-renders
 */
export const STREAMING_THROTTLE_MS = 50;

/**
 * Hook to stream text progressively with ~50ms throttle, stop button support,
 * partial text preservation on error or cancellation, and scroll position preservation.
 */
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

  const abortControllerRef = useRef<AbortController | null>(null);
  const bufferRef = useRef("");
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStreamingRef = useRef(false);

  const flushBuffer = useCallback(() => {
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    setState((prev) => {
      if (prev.text === bufferRef.current) return prev;
      return { ...prev, text: bufferRef.current };
    });
    if (options?.scrollRef?.current) {
      autoScrollPreservingUser(options.scrollRef.current);
    }
  }, [options?.scrollRef]);

  const scheduleFlush = useCallback(() => {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
      flushBuffer();
      return;
    }
    if (throttleTimerRef.current) return;
    throttleTimerRef.current = setTimeout(() => {
      flushBuffer();
    }, STREAMING_THROTTLE_MS);
  }, [flushBuffer]);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isStreamingRef.current = false;
    flushBuffer();
    setState((prev) => ({
      ...prev,
      isStreaming: false,
      isStopped: true,
    }));
  }, [flushBuffer]);

  const start = useCallback(
    async (
      source: AsyncIterable<string> | string,
      initialText = "",
    ): Promise<{ text: string; stopped: boolean; error: string | null }> => {
      stop();

      const controller = new AbortController();
      abortControllerRef.current = controller;
      isStreamingRef.current = true;
      bufferRef.current = initialText;

      setState({
        text: initialText,
        isStreaming: true,
        isStopped: false,
        error: null,
        partialTokens: Math.ceil(initialText.length / 4),
      });

      // Force scroll to bottom on start of new answer
      if (options?.scrollRef?.current) {
        autoScrollPreservingUser(options.scrollRef.current, true);
      }

      try {
        if (typeof source === "string") {
          // If string, simulate chunked streaming with ~50ms intervals
          const words = source.split(/(\s+)/);
          let currentIdx = 0;

          while (currentIdx < words.length && !controller.signal.aborted) {
            const batchSize = Math.max(1, Math.min(3, words.length - currentIdx));
            const chunk = words.slice(currentIdx, currentIdx + batchSize).join("");
            currentIdx += batchSize;

            bufferRef.current += chunk;
            scheduleFlush();
            options?.onChunk?.(bufferRef.current);

            const throttleMs =
              typeof process !== "undefined" && process.env.NODE_ENV === "test"
                ? 0
                : STREAMING_THROTTLE_MS;
            if (throttleMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, throttleMs));
            }
          }
        } else {
          // AsyncIterable stream from server
          for await (const chunk of source) {
            if (controller.signal.aborted) break;
            bufferRef.current += chunk;
            scheduleFlush();
            options?.onChunk?.(bufferRef.current);
          }
        }

        flushBuffer();

        const finalText = bufferRef.current;
        const stopped = controller.signal.aborted;

        setState((prev) => ({
          ...prev,
          text: finalText,
          isStreaming: false,
          isStopped: stopped,
        }));

        isStreamingRef.current = false;
        options?.onFinish?.(finalText);

        return { text: finalText, stopped, error: null };
      } catch (err: unknown) {
        flushBuffer();
        const errorMsg =
          err instanceof Error
            ? err.message
            : "A conexão com a IA foi interrompida durante a resposta.";

        setState((prev) => ({
          ...prev,
          isStreaming: false,
          error: errorMsg,
        }));
        isStreamingRef.current = false;

        return { text: bufferRef.current, stopped: false, error: errorMsg };
      }
    },
    [flushBuffer, options, scheduleFlush, stop],
  );

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
    };
  }, []);

  return {
    text: state.text,
    isStreaming: state.isStreaming,
    isStopped: state.isStopped,
    error: state.error,
    start,
    stop,
    setText: (t: string) => {
      bufferRef.current = t;
      setState((prev) => ({ ...prev, text: t }));
    },
  };
}
