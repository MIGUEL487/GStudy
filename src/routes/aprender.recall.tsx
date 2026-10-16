import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Brain, Clock3, EyeOff, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { LessonShell, Thinking } from '@/components/lesson';
import { LearningEvaluationResult, type LearningEvaluation } from '@/components/learning-evaluation';
import { useLessonContext } from '@/components/learning-provider';
import { useDailyAttempt } from '@/hooks/use-daily-attempt';
import { learningSearch } from '@/lib/learning-model';
import { generateRecallMaterial, gradeRecall } from '@/lib/learning.functions';
import { awardXp, idsFrom } from '@/lib/learn-client';
import '@/styles/recall-review.css';

export const RECALL_STUDY_DURATION = 5 * 60 * 1000;
type RecallMaterial = { title: string; content: string; keyPoints: string[] };
type Search = ReturnType<typeof learningSearch>;
type Phase = 'intro' | 'loading' | 'study' | 'recall' | 'grading' | 'result';

export const Route = createFileRoute('/aprender/recall')({
  validateSearch: learningSearch,
  head: () => ({ meta: [{ title: 'GStudy · Active Recall' }, { name: 'description', content: 'Estude por cinco minutos e descubra o que consegue recuperar de memória.' }] }),
  component: RecallPage,
});

function RecallPage() { const search = Route.useSearch(); return <RecallLesson key={`${search.p ?? ''}:${search.t ?? ''}:${search.m ?? ''}`} search={search} />; }

export function RecallLesson({ search }: { search: Search }) {
  const lesson = useLessonContext(search);
  const quota = useDailyAttempt('recall');
  const generate = useServerFn(generateRecallMaterial);
  const evaluate = useServerFn(gradeRecall);
  const [phase, setPhase] = useState<Phase>('intro');
  const [material, setMaterial] = useState<RecallMaterial | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(RECALL_STUDY_DURATION);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<LearningEvaluation | null>(null);
  const [progressSaved, setProgressSaved] = useState(false);
  const busy = useRef(false);
  const awarded = useRef(false);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (phase !== 'study' || deadline === null) return;
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      setRemainingMs(left);
      if (left === 0) setPhase('recall');
    };
    tick();
    const timer = window.setInterval(tick, 500);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick); };
  }, [deadline, phase]);
  useEffect(() => { if (phase === 'recall') answerRef.current?.focus(); }, [phase]);

  const saveResult = (evaluation: LearningEvaluation) => {
    if (search.p && !lesson.complete('recall')) { setError('Sua avaliação está pronta, mas o progresso não foi salvo. Tente salvar novamente.'); return; }
    setProgressSaved(true); setError('');
    if (!awarded.current) { awarded.current = true; void awardXp(20 + Math.round(evaluation.score * 2)); }
  };

  const start = async () => {
    const context = lesson.context;
    if (!lesson.ready || !lesson.allowed || !context || busy.current) return;
    busy.current = true; setError('');
    let reservation: string | undefined;
    try {
      reservation = quota.begin();
      setPhase('loading');
      const content = await generate({ data: { context, ids: idsFrom(search.m) } });
      if (!content.content.trim()) throw new Error('O material veio vazio. Tente preparar a sessão novamente.');
      quota.succeed(reservation);
      setMaterial(content); setAnswer(''); setResult(null); awarded.current = false; setProgressSaved(false);
      setRemainingMs(RECALL_STUDY_DURATION); setDeadline(Date.now() + RECALL_STUDY_DURATION); setPhase('study');
    } catch (failure) {
      if (reservation) quota.fail(reservation);
      setError(failure instanceof Error ? failure.message : 'Não foi possível preparar seu estudo. Tente novamente.'); setPhase('intro');
    } finally { busy.current = false; }
  };

  const submit = async () => {
    const context = lesson.context;
    if (!lesson.ready || !lesson.allowed || !context || !material || !answer.trim() || busy.current || phase !== 'recall') return;
    // Enforce the deadline again at submission; a delayed browser timer cannot skip study time.
    if (deadline === null || Date.now() < deadline) return;
    busy.current = true; setError(''); setPhase('grading');
    try {
      const evaluation = await evaluate({ data: { context, source: material.content, answer: answer.trim(), ids: idsFrom(search.m) } });
      setResult(evaluation); setPhase('result'); saveResult(evaluation);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível avaliar seu resumo. Sua resposta foi preservada.'); setPhase('recall');
    } finally { busy.current = false; }
  };

  const progress = phase === 'result' ? 1 : phase === 'recall' || phase === 'grading' ? .7 : phase === 'study' ? .1 + .5 * (1 - remainingMs / RECALL_STUDY_DURATION) : 0;
  const seconds = Math.ceil(remainingMs / 1000);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  if (!lesson.ready) return <LessonShell title="Active Recall" progress={0} backSearch={lesson.backSearch}><Thinking text="Abrindo sua trilha…" /></LessonShell>;
  return <LessonShell title="Active Recall" progress={progress} backSearch={lesson.backSearch}>
    {!lesson.context ? <section className="recall-intro"><Brain size={42} strokeWidth={1.25} /><h1 className="lesson-q">{lesson.allowed ? 'Escolha o que vai estudar.' : 'Uma ideia de cada vez.'}</h1><p>{lesson.allowed ? 'Abra sua trilha e selecione um assunto para fazer o Active Recall.' : 'Conclua a atividade anterior para abrir esta etapa da sua trilha.'}</p><Link to="/aprender" search={lesson.backSearch} className="duo-btn">Voltar à trilha <ArrowRight size={17} /></Link></section> : <>
      {phase === 'intro' && <section className="recall-intro">
        <span className="activity-outline-icon"><Brain size={35} strokeWidth={1.25} /></span>
        <small className="lesson-kicker">RECUPERAR É APRENDER</small><h1 className="lesson-q">O que ficou na sua memória?</h1>
        <p>Estude <strong>{lesson.context.topic}</strong> por cinco minutos. Depois, o material sai de cena e você escreve o que entendeu, com suas próprias palavras.</p>
        <ol className="recall-steps"><li><BookOpen size={20} /><span>Leia e conecte as ideias.</span></li><li><Clock3 size={20} /><span>Espere os cinco minutos de estudo.</span></li><li><EyeOff size={20} /><span>Escreva sem consultar e receba uma avaliação.</span></li></ol>
        <p className="activity-quota">Até 2 sessões por dia neste navegador. Disponíveis hoje: {quota.remaining}.</p>
        {error && <p role="alert" className="activity-error">{error}</p>}
        <button className="duo-btn" onClick={() => void start()} disabled={quota.remaining <= 0}>Começar os 5 minutos <ArrowRight size={17} /></button>
      </section>}
      {phase === 'loading' && <Thinking text="Preparando uma leitura para o seu assunto…" />}
      {phase === 'study' && material && <section className="recall-study">
        <div className="recall-timer" role="timer" aria-label="Tempo restante de estudo"><Clock3 size={19} /><strong>{clock}</strong><span>para explorar as ideias</span></div>
        <small className="lesson-kicker">LEIA COM ATENÇÃO · DEPOIS SERÁ SEM CONSULTA</small><h1 className="lesson-q">{material.title}</h1>
        <div className="recall-reading prose prose-sm"><ReactMarkdown>{material.content}</ReactMarkdown></div>
        <aside className="recall-key-points"><h2>Conecte estes pontos</h2><ul>{material.keyPoints.map((point, index) => <li key={index}>{point}</li>)}</ul></aside>
        <p className="activity-quota">O espaço para escrever abre automaticamente quando o tempo terminar.</p>
      </section>}
      {(phase === 'recall' || phase === 'grading') && <section className="recall-answer">
        <small className="lesson-kicker">AGORA, SEM CONSULTAR</small><h1 className="lesson-q">Conte o que você entendeu.</h1><p>Recupere as ideias principais, explique as conexões e crie um exemplo. Não precisa repetir o texto original.</p>
        <form onSubmit={event => { event.preventDefault(); void submit(); }}>
          <label htmlFor="recall-summary">Seu resumo de memória</label><textarea ref={answerRef} id="recall-summary" className="form-input" value={answer} onChange={event => setAnswer(event.target.value)} maxLength={8000} rows={9} placeholder="Eu entendi que…" disabled={phase === 'grading'} />
          <div className="activity-input-meta"><span>A IA considera as ideias, e não a quantidade de palavras.</span><span>{answer.length}/8000</span></div>
          {error && <p role="alert" className="activity-error">{error}</p>}
          <button type="submit" className="duo-btn" disabled={!answer.trim() || phase === 'grading'}><Send size={16} /> {phase === 'grading' ? 'Avaliando seu resumo…' : 'Avaliar meu resumo'}</button>
        </form>
        {phase === 'grading' && <div className="activity-grading" role="status">Buscando conexões no seu resumo<div className="dots" aria-hidden="true"><i /><i /><i /></div></div>}
      </section>}
      {phase === 'result' && result && <>{!progressSaved && <div role="alert" className="activity-save-warning"><p>{error}</p><button className="duo-btn ghost" onClick={() => saveResult(result)}>Salvar progresso</button></div>}<LearningEvaluationResult result={result} xp={progressSaved ? 20 + Math.round(result.score * 2) : 0} next={progressSaved ? lesson.next : undefined} backSearch={lesson.backSearch} onAgain={() => { setPhase('intro'); setError(''); }} remaining={quota.remaining} /></>}
    </>}
  </LessonShell>;
}
