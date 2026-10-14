import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { awardXp } from '@/lib/learn-client';
import { useGeneratedActivity } from '@/hooks/use-generated-activity';
import { LessonShell, Thinking, Finish, ErrorBox } from '@/components/lesson';

export const Route = createFileRoute('/aprender/flashcards')({
  validateSearch: (s: Record<string, unknown>) => ({ m: typeof s['m'] === 'string' ? s['m'] : undefined }),
  head: () => ({ meta: [{ title: 'GStudy · Flashcards' }, { name: 'description', content: 'Cartas de memorização criadas do seu material.' }, { property: 'og:title', content: 'GStudy · Flashcards' }, { property: 'og:description', content: 'Memorize virando cartas.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: CardsPage,
});

type Card = { front: string; back: string };
function CardsPage() {
  const { m } = Route.useSearch();
  const { result, error, reload: load } = useGeneratedActivity('flashcards', m);
  const [queue, setQueue] = useState<Card[] | null>(null); const [total, setTotal] = useState(0); const [known, setKnown] = useState(0);
  const [flip, setFlip] = useState(false); const [round, setRound] = useState(0);
  useEffect(() => {
    setKnown(0); setFlip(false); setRound(0);
    if (result?.mode === 'flashcards') { setQueue(result.cards.cards); setTotal(result.cards.cards.length); }
    else { setQueue(null); setTotal(0); }
  }, [result]);
  if (error) return <LessonShell progress={0} title="Flashcards"><ErrorBox message={error} retry={load} /></LessonShell>;
  if (!queue) return <LessonShell progress={0} title="Flashcards"><Thinking text="Embaralhando suas cartas…" /></LessonShell>;
  const card = queue[0];
  if (!card) return <LessonShell progress={1} title="Flashcards"><Finish xp={total * 2} title="Baralho dominado!" line={`Você memorizou ${total} cartas.`} again={load} /></LessonShell>;
  const answer = (got: boolean) => { setFlip(false); setRound(r => r + 1);
    setTimeout(() => setQueue(q => { if (!q) return q; const [c, ...rest] = q; const next = got ? rest : [...rest, c!]; if (got) setKnown(k => k + 1); if (!next.length) void awardXp(total * 2); return next; }), 180); };
  return <LessonShell progress={known / Math.max(1, total)} title="Flashcards">
    <div className="lesson-body">
      <small className="lesson-kicker">{queue.length} CARTA(S) RESTANTE(S) · TOQUE PARA VIRAR</small>
      <button key={round} className={`flashcard ${flip ? 'flipped' : ''}`} onClick={() => setFlip(!flip)} aria-label="Virar carta">
        <span className="fc-face fc-front">{card.front}</span><span className="fc-face fc-back">{card.back}</span>
      </button>
    </div>
    <div className="lesson-foot">
      {flip ? <><button className="duo-btn ghost" onClick={() => answer(false)}>Ainda não 🔁</button><button className="duo-btn" onClick={() => answer(true)}>Eu sabia! ✅</button></> : <button className="duo-btn" onClick={() => setFlip(true)}>Ver resposta</button>}
    </div>
  </LessonShell>;
}
