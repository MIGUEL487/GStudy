import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CircleCheck, Compass, Lightbulb } from 'lucide-react';
import { awardXp } from '@/lib/learn-client';
import { learningSearch, type LearningSearch } from '@/lib/learning-model';
import { useLessonContext } from '@/components/learning-provider';
import { useGeneratedActivity } from '@/hooks/use-generated-activity';
import { LessonShell, Thinking, Finish, ErrorBox, UnavailableLesson } from '@/components/lesson';

export const Route = createFileRoute('/aprender/quiz')({
  validateSearch: learningSearch,
  head: () => ({ meta: [{ title: 'GStudy · Quiz' }, { name: 'description', content: 'Perguntas geradas a partir do seu material de estudo.' }, { property: 'og:title', content: 'GStudy · Quiz' }, { property: 'og:description', content: 'Teste o que aprendeu.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: QuizPage,
});
function QuizPage() { return <QuizLesson search={Route.useSearch()} />; }

export function QuizLesson({ search }: { search: LearningSearch }) {
  const lesson = useLessonContext(search);
  const enabled = lesson.ready && lesson.allowed && (!search.p || Boolean(lesson.context));
  const { result, error, reload: load } = useGeneratedActivity('quiz', search.m, lesson.context, enabled);
  const quiz = result?.mode === 'quiz' ? result.quiz : null;
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [right, setRight] = useState(0);
  const [done, setDone] = useState(false);
  const action = useRef(false);
  useEffect(() => { setI(0); setPick(null); setChecked(false); setRight(0); setDone(false); action.current = false; }, [quiz]);
  useEffect(() => { action.current = false; }, [i, checked]);
  const shell = { title: 'Quiz', backSearch: lesson.backSearch };
  if (lesson.ready && !enabled) return <LessonShell progress={0} {...shell}><UnavailableLesson backSearch={lesson.backSearch} /></LessonShell>;
  if (error) return <LessonShell progress={0} {...shell}><ErrorBox message={error} retry={load} /></LessonShell>;
  if (!quiz) return <LessonShell progress={0} {...shell}><Thinking text="Criando desafios para conectar o que você aprendeu…" /></LessonShell>;
  const q = quiz.questions[i];
  if (done || !q) return <LessonShell progress={1} {...shell}><Finish xp={right * 10 + 5} title="Cada tentativa ensina." line={`Você acertou ${right} de ${quiz.questions.length} perguntas e revisou as explicações. Continue construindo sua compreensão.`} again={load} next={lesson.next} backSearch={lesson.backSearch} /></LessonShell>;
  const ok = pick === q.answer;
  const check = () => {
    if (pick === null || action.current) return;
    action.current = true; setChecked(true); if (ok) setRight(n => n + 1);
  };
  const next = () => {
    if (action.current) return;
    action.current = true;
    if (i + 1 >= quiz.questions.length) {
      if (search.p && !lesson.complete('quiz')) { action.current = false; return; }
      setDone(true); void awardXp(right * 10 + 5);
    }
    else { setI(n => n + 1); setPick(null); setChecked(false); }
  };
  return <LessonShell progress={i / quiz.questions.length} {...shell}>
    <div className="lesson-body" key={i}>
      <div className="activity-intro"><Compass size={18} aria-hidden="true" /><span>Errar também faz parte de aprender.</span></div>
      <small className="lesson-kicker">PERGUNTA {i + 1} DE {quiz.questions.length}{lesson.topic ? ` · ${lesson.topic.title}` : ''}</small>
      <h1 className="lesson-q">{q.question}</h1>
      <div className="choices" role="group" aria-label="Alternativas">{q.options.map((option, k) => <button key={k} disabled={checked} aria-pressed={pick === k} onClick={() => setPick(k)}
        className={`choice ${pick === k ? 'picked' : ''} ${checked && k === q.answer ? 'right' : ''} ${checked && pick === k && !ok ? 'wrong' : ''}`}><kbd aria-hidden="true">{String.fromCharCode(65 + k)}</kbd><span>{option}</span>{checked && k === q.answer && <Check className="choice-status" size={18} aria-label="Resposta correta" />}</button>)}</div>
    </div>
    <div className={`lesson-foot ${checked ? (ok ? 'good' : 'bad') : ''}`}>
      {checked && <div className="foot-msg" role="status"><b>{ok ? <CircleCheck size={20} aria-hidden="true" /> : <Lightbulb size={20} aria-hidden="true" />}{ok ? 'Você fez a conexão!' : 'Vamos entender o porquê.'}</b><span>{q.why}</span></div>}
      <button className="duo-btn" disabled={pick === null} onClick={checked ? next : check}>{checked ? (i + 1 === quiz.questions.length ? 'Concluir quiz' : 'Próxima pergunta') : 'Conferir resposta'}<ArrowRight size={17} aria-hidden="true" /></button>
    </div>
  </LessonShell>;
}
