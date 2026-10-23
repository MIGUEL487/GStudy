import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateActivity } from "@/lib/learn.functions";
import type { Quiz, Cards, Explain } from "@/lib/learn.functions";
import { idsFrom } from "@/lib/learn-client";
import { readAiText } from "@/lib/ai-event-stream";
import { useDailyAttempt } from "@/hooks/use-daily-attempt";
import type { LearningContext } from "@/lib/learning-model";

type Activity =
  | { mode: "quiz"; quiz: Quiz }
  | { mode: "flashcards"; cards: Cards }
  | { mode: "explain"; explain: Explain };
type Mode = Activity["mode"];
export type ActivityPreviewItem = {
  question?: string;
  front?: string;
  title?: string;
  explanation?: string;
  example?: string;
};
type Request = {
  key: string;
  promise: Promise<Activity>;
  controller: AbortController;
  items: ActivityPreviewItem[];
  notify: (() => void) | null;
};

export function useGeneratedActivity(
  mode: Mode,
  materials?: string,
  context?: LearningContext,
  enabled = true,
) {
  const generate = useServerFn(generateActivity),
    daily = useDailyAttempt(mode);
  const generateRef = useRef(generate),
    dailyRef = useRef(daily);
  generateRef.current = generate;
  dailyRef.current = daily;
  const pending = useRef<Request | null>(null);
  const [attempt, setAttempt] = useState(0),
    [forceRegenerate, setForceRegenerate] = useState(false);
  const [result, setResult] = useState<Activity | null>(null),
    [error, setError] = useState("");
  const [partialItems, setPartialItems] = useState<ActivityPreviewItem[]>([]),
    [loading, setLoading] = useState(false);
  const reload = useCallback((force = true) => {
    setForceRegenerate(Boolean(force));
    setAttempt((n) => n + 1);
  }, []);
  const stop = useCallback(() => {
    pending.current?.controller.abort();
  }, []);
  const contextKey = JSON.stringify(context ?? null);
  useEffect(() => {
    setResult(null);
    setError("");
    setPartialItems([]);
    setLoading(enabled);
    if (!enabled) return;
    const key = JSON.stringify([mode, materials ?? "", contextKey, attempt, forceRegenerate]);
    if (pending.current?.key !== key) {
      pending.current?.controller.abort();
      const controller = new AbortController();
      const request: Request = { key, controller, items: [], notify: null, promise: null! };
      pending.current = request;
      request.promise = Promise.resolve().then(async () => {
        const quota = dailyRef.current,
          token = quota.begin();
        try {
          const response = await generateRef.current({
            signal: controller.signal,
            data: {
              mode,
              ids: idsFrom(materials),
              stream: true,
              ...(context ? { context } : {}),
              ...(forceRegenerate ? { regenerate: true } : {}),
            },
          });
          let activity: Activity | undefined;
          if (response instanceof Response) {
            for await (const _ of readAiText<Activity>(
              response,
              (value) => {
                activity = value;
              },
              (value, index) => {
                request.items[index] = value as ActivityPreviewItem;
                request.notify?.();
              },
            )) {
              /* Structured items arrive through their own events. */
            }
          } else activity = response as Activity;
          if (!activity || activity.mode !== mode)
            throw new Error("A IA não concluiu esta atividade. Tente novamente.");
          const count =
            activity.mode === "quiz"
              ? activity.quiz.questions.length
              : activity.mode === "flashcards"
                ? activity.cards.cards.length
                : activity.explain.topics.length;
          if (!count)
            throw new Error("Não foi possível criar conteúdo com esse material. Tente novamente.");
          quota.succeed(token);
          return activity;
        } catch (cause) {
          quota.fail(token);
          throw cause;
        }
      });
    }
    const request = pending.current;
    let active = true;
    request.notify = () => {
      if (active) setPartialItems([...request.items]);
    };
    request.notify();
    void request.promise
      .then((activity) => {
        if (active) setResult(activity);
      })
      .catch((cause) => {
        if (active)
          setError(
            request.controller.signal.aborted
              ? "Geração interrompida. Os itens recebidos foram preservados."
              : cause instanceof Error
                ? cause.message
                : "Não foi possível gerar a atividade. Tente novamente.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      request.notify = null;
      // StrictMode reattaches synchronously; a real departure cancels the network request.
      queueMicrotask(() => {
        if (!request.notify) {
          request.controller.abort();
          if (pending.current === request) pending.current = null;
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, materials, contextKey, attempt, forceRegenerate, enabled]);
  return { result, error, reload, stop, loading, partialItems, remaining: daily.remaining };
}
