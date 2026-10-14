import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { awardXp } from '@/lib/learn-client';
import { useGeneratedActivity } from '@/hooks/use-generated-activity';
import { LessonShell, Thinking, Finish, ErrorBox } from '@/components/lesson';

export const Route = createFileRoute('/aprender/quiz')({
  validateSearch: (s: Record<string, unknown>) => ({ m: typeof s['m'] === 'string' ? s['m'] : undefined }),
  head: () => ({ meta: [{ title: 'GStudy · Quiz' }, { name: 'description', content: 'Perguntas geradas a partir do seu material de estudo.' }, { property: 'og:title', content: 'GStudy · Quiz' }, { property: 'og:description', content: 'Teste o que aprendeu.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: QuizPage,
});

function QuizPage() {
  const { m } = Route.useSearch();
  const { result, error, reload: load } = useGeneratedActivity('quiz', m);
  const quiz = result?.mode === 'quiz' ? result.quiz : null;
  const [i, setI] = useState(0); const [pick, setPick] = useState<number | null>(null); const [checked, setChecked] = useState(false);
  const [hearts, setHearts] = useState(3); const [right, setRight] = useState(0); const [done, setDone] = useState(false);
  useEffect(() => { if (!quiz) { setI(0); setPick(null); setChecked(false); setHearts(3); setRight(0); setDone(false); } }, [quiz]);
  if (error) return <LessonShell progress={0} hearts={hearts} title="Quiz"><ErrorBox message={error} retry={load} /></LessonShell>;
  if (!quiz) return <LessonShell progress={0} hearts={hearts} title="Quiz"><Thinking text="Montando perguntas com o seu material…" /></LessonShell>;
  const q = quiz.questions[i];
  if (done || !q) return <LessonShell progress={1} hearts={hearts} title="Quiz"><Finish xp={right * 10} title={hearts > 0 ? 'Lição completa!' : 'Acabaram as vidas'} line={`Você acertou ${right} de ${quiz.questions.length}.`} again={load} /></LessonShell>;
  const ok = pick === q.answer;
  const next = () => {
    const last = i + 1 >= quiz.questions.length || (!ok && hearts - 1 <= 0);
    if (!ok) setHearts(h => h - 1);
    if (last) { setDone(true); void awardXp((right + (ok ? 0 : 0)) * 10 + 5); }
    else { setI(i + 1); setPick(null); setChecked(false); }
  };
  const check = () => { setChecked(true); if (ok) setRight(r => r + 1); };
  return <LessonShell progress={i / quiz.questions.length} hearts={hearts} title="Quiz">
    <div className="lesson-body" key={i}>
      <small className="lesson-kicker">PERGUNTA {i + 1} DE {quiz.questions.length}</small>
      <h1 className="lesson-q">{q.question}</h1>
      <div className="choices">{q.options.map((o, k) => <button key={k} disabled={checked} onClick={() => setPick(k)}
        className={`choice ${pick === k ? 'picked' : ''} ${checked && k === q.answer ? 'right' : ''} ${checked && pick === k && !ok ? 'wrong' : ''}`}><kbd>{k + 1}</kbd>{o}</button>)}</div>
    </div>
    <div className={`lesson-foot ${checked ? (ok ? 'good' : 'bad') : ''}`}>
      {checked && <div className="foot-msg"><b>{ok ? 'Mandou bem! ✨' : 'Quase! 💪'}</b><span>{q.why}</span></div>}
      <button className="duo-btn" disabled={pick === null} onClick={checked ? next : check}>{checked ? 'Continuar' : 'Verificar'}</button>
    </div>
  </LessonShell>;
}
