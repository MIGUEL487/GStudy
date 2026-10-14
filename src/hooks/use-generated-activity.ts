import { useCallback, useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { generateActivity } from '@/lib/learn.functions';
import { idsFrom } from '@/lib/learn-client';

type Activity = Awaited<ReturnType<typeof generateActivity>>;
type Mode = 'quiz' | 'flashcards' | 'explain';

export function useGeneratedActivity(mode: Mode, materials?: string) {
  const generate = useServerFn(generateActivity);
  const generateRef = useRef(generate);
  const pending = useRef<{ key: string; promise: Promise<Activity> } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Activity | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { generateRef.current = generate; }, [generate]);
  const reload = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    let active = true;
    setResult(null); setError('');
    const key = JSON.stringify([mode, materials ?? '', attempt]);
    // Reuse the pending call during effect replay; ordinary renders never restart it.
    if (pending.current?.key !== key) {
      pending.current = { key, promise: Promise.resolve().then(() => generateRef.current({ data: { mode, ids: idsFrom(materials) } })) };
    }
    void pending.current.promise.then(activity => {
      if (!active) return;
      const count = activity.mode === 'quiz' ? activity.quiz.questions.length : activity.mode === 'flashcards' ? activity.cards.cards.length : activity.explain.topics.length;
      if (!count) throw new Error('Não foi possível criar conteúdo com esse material. Tente gerar novamente.');
      setResult(activity);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Não foi possível gerar a atividade. Tente novamente.'); });
    return () => { active = false; };
  }, [mode, materials, attempt]);
  return { result, error, reload };
}
