import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateActivity } from "@/lib/learn.functions";
import { idsFrom } from "@/lib/learn-client";
import { useDailyAttempt } from "@/hooks/use-daily-attempt";
import type { LearningContext } from "@/lib/learning-model";

type Activity = Awaited<ReturnType<typeof generateActivity>>;
type Mode = "quiz" | "flashcards" | "explain";

export function useGeneratedActivity(
  mode: Mode,
  materials?: string,
  context?: LearningContext,
  enabled = true,
) {
  const generate = useServerFn(generateActivity);
  const daily = useDailyAttempt(mode);
  const generateRef = useRef(generate);
  const dailyRef = useRef(daily);
  const pending = useRef<{ key: string; promise: Promise<Activity> } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [result, setResult] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    generateRef.current = generate;
  }, [generate]);
  useEffect(() => {
    dailyRef.current = daily;
  }, [daily]);
  const reload = useCallback((force = true) => {
    setForceRegenerate(Boolean(force));
    setAttempt((n) => n + 1);
  }, []);
  const contextKey = JSON.stringify(context ?? null);
  useEffect(() => {
    let active = true;
    setResult(null);
    setError("");
    if (!enabled)
      return () => {
        active = false;
      };
    const key = JSON.stringify([mode, materials ?? "", contextKey, attempt, forceRegenerate]);
    // Reuse the pending call during effect replay; ordinary renders never restart it.
    if (pending.current?.key !== key) {
      pending.current = {
        key,
        promise: Promise.resolve().then(async () => {
          const quota = dailyRef.current;
          const token = quota.begin();
          try {
            const activity = await generateRef.current({
              data: {
                mode,
                ids: idsFrom(materials),
                ...(context ? { context } : {}),
                ...(forceRegenerate ? { regenerate: true } : {}),
              },
            });
            if (activity.mode !== mode)
              throw new Error("A IA retornou outra atividade. Tente gerar novamente.");
            const count =
              activity.mode === "quiz"
                ? activity.quiz.questions.length
                : activity.mode === "flashcards"
                  ? activity.cards.cards.length
                  : activity.explain.topics.length;
            if (!count)
              throw new Error(
                "Não foi possível criar conteúdo com esse material. Tente gerar novamente.",
              );
            quota.succeed(token);
            return activity;
          } catch (e) {
            quota.fail(token);
            throw e;
          }
        }),
      };
    }
    void pending.current.promise
      .then((activity) => {
        if (!active) return;
        setResult(activity);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Não foi possível gerar a atividade. Tente novamente.",
          );
      });
    return () => {
      active = false;
    };
  }, [mode, materials, contextKey, attempt, forceRegenerate, enabled]);
  return { result, error, reload, remaining: daily.remaining };
}
