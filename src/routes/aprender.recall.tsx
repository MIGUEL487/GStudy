import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Brain, Clock3, EyeOff, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { LessonShell, Thinking } from '@/components/lesson';
import { LearningEvaluationResult, type LearningEvaluation } from '@/components/learning-evaluation';
import { useLessonContext } from '@/components/learning-provider';
import { useDailyAttempt } from '@/hooks/use-daily-attempt';
import { useRecallSession } from '@/components/recall-session-provider';
import { learningSearch } from '@/lib/learning-model';
import { generateRecallMaterial, gradeRecall } from '@/lib/learning.functions';
import { awardXp, idsFrom } from '@/lib/learn-client';
import '@/styles/recall-review.css';

export const RECALL_STUDY_DURATION = 5 * 60 * 1000;
type Search = ReturnType<typeof learningSearch>;

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
  const saved = useRecallSession(search);
  const { phase: savedPhase, material, deadline, answer, result, progressSaved } = saved.session;
  const phase = savedPhase === 'study' && deadline !== null && deadline <= Date.now() ? 'recall' : savedPhase;
  const [remainingMs, setRemainingMs] = useState(RECALL_STUDY_DURATION);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (savedPhase !== 'study' || deadline === null) return;
    const tick = () => {
      const left = Math.max(0, deadline - Date.now());
      setRemainingMs(left);
      if (left === 0) saved.update(session => ({ ...session, phase: 'recall' }));
    };
    tick();
    const timer = window.setInterval(tick, 500);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick); };
  }, [deadline, savedPhase]);
  useEffect(() => { if (phase === 'recall') answerRef.current?.focus(); }, [phase]);

  const saveResult = (evaluation: LearningEvaluation) => {
    if (search.p && !lesson.complete('recall')) { setError('Sua avaliação está pronta, mas o progresso não foi salvo. Tente salvar novamente.'); return; }
    let award = false;
    const persisted = saved.update(session => { award = !session.xpAwarded; return { ...session, progressSaved: true, xpAwarded: true }; }, true);
    if (!persisted) { setError('Sua avaliação está pronta, mas não foi possível salvar a sessão. Libere espaço e tente salvar novamente.'); return; }
    setError('');
    if (award) void awardXp(20 + Math.round(evaluation.score * 2));
  };

  const start = async () => {
    const context = lesson.context;
    if (!lesson.ready || !saved.ready || !lesson.allowed || !context || busy.current || phase !== 'intro') return;
    busy.current = true; setError('');
    let reservation: string | undefined;
    try {
      if (!saved.update(session => ({ ...session, phase: 'loading', topic: context.topic, material: null, deadline: null, answer: '', result: null, progressSaved: false, xpAwarded: false }), true)) return;
      reservation = quota.begin();
      const content = await generate({ data: { context, ids: idsFrom(search.m) } });
      if (!content.content.trim()) throw new Error('O material veio vazio. Tente preparar a sessão novamente.');
      quota.succeed(reservation);
      saved.update(session => ({ ...session, phase: 'study', material: content, deadline: Date.now() + RECALL_STUDY_DURATION }));
      setRemainingMs(RECALL_STUDY_DURATION);
    } catch (failure) {
      if (reservation) quota.fail(reservation);
      setError(failure instanceof Error ? failure.message : 'Não foi possível preparar seu estudo. Tente novamente.'); saved.update(session => ({ ...session, phase: 'intro' }));
    } finally { busy.current = false; }
  };

  const submit = async () => {
    const context = lesson.context;
    if (!lesson.ready || !lesson.allowed || !context || !material || !answer.trim() || busy.current || phase !== 'recall') return;
    // Enforce the deadline again at submission; a delayed browser timer cannot skip study time.
    if (deadline === null || Date.now() < deadline) return;
    busy.current = true; setError(''); saved.update(session => ({ ...session, phase: 'grading' }));
    try {
      const evaluation = await evaluate({ data: { context, source: material.content, answer: answer.trim(), ids: idsFrom(search.m) } });
      saved.update(session => ({ ...session, result: evaluation, phase: 'result' })); saveResult(evaluation);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível avaliar seu resumo. Sua resposta foi preservada.'); saved.update(session => ({ ...session, phase: 'recall' }));
    } finally { busy.current = false; }
  };

  const progress = phase === 'result' ? 1 : phase === 'recall' || phase === 'grading' ? .7 : phase === 'study' ? .1 + .5 * (1 - remainingMs / RECALL_STUDY_DURATION) : 0;
  const seconds = Math.ceil((phase === 'study' && deadline !== null ? Math.max(0, Math.min(remainingMs, deadline - Date.now())) : remainingMs) / 1000);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  if (!lesson.ready || !saved.ready) return <LessonShell title="Active Recall" progress={0} backSearch={lesson.backSearch}><Thinking text="Abrindo sua trilha…" /></LessonShell>;
  return <LessonShell title="Active Recall" progress={progress} backSearch={lesson.backSearch}>
    {saved.storageError && <div role="alert" className="activity-save-warning"><p>{saved.storageError}</p>{material && <button className="duo-btn ghost" onClick={() => saved.update(session => session, true)}>Salvar sessão novamente</button>}</div>}
    {!lesson.context ? <section className="recall-intro"><Brain size={42} strokeWidth={1.25} /><h1 className="lesson-q">{lesson.allowed ? 'Escolha o que vai estudar.' : 'Uma ideia de cada vez.'}</h1><p>{lesson.allowed ? 'Abra sua trilha e selecione um assunto para fazer o Active Recall.' : 'Conclua a atividade anterior para abrir esta etapa da sua trilha.'}</p><Link to="/aprender" search={lesson.backSearch} className="duo-btn">Voltar à trilha <ArrowRight size={17} /></Link></section> : <>
      {phase === 'intro' && <section className="recall-intro">
        <span className="activity-outline-icon"><Brain size={35} strokeWidth={1.25} /></span>
        <small className="lesson-kicker">RECUPERAR É APRENDER</small><h1 className="lesson-q">O que ficou na sua memória?</h1>
        <p>Estude <strong>{lesson.context.topic}</strong> por cinco minutos. Depois, o material sai de cena e você escreve o que entendeu, com suas próprias palavras.</p>
        <ol className="recall-steps"><li><BookOpen size={20} /><span>Leia e conecte as ideias.</span></li><li><Clock3 size={20} /><span>Espere os cinco minutos de estudo.</span></li><li><EyeOff size={20} /><span>Escreva sem consultar e receba uma avaliação.</span></li></ol>
        <p className="activity-quota">Até 2 sessões por dia na sua conta. Disponíveis hoje: {quota.remaining}.</p>
        {error && <p role="alert" className="activity-error">{error}</p>}
        <button className="duo-btn" onClick={() => void start()} disabled={quota.remaining <= 0}>Começar os 5 minutos <ArrowRight size={17} /></button>
      </section>}
      {phase === 'loading' && <Thinking text="Preparando uma leitura para o seu assunto…" />}
      {phase === 'study' && material && <section className="recall-study">
        <div className="recall-timer" role="timer" aria-label="Tempo restante de estudo"><Clock3 size={19} /><strong>{clock}</strong><span>para explorar as ideias</span></div>
        <small className="lesson-kicker">LEIA COM ATENÇÃO · DEPOIS SERÁ SEM CONSULTA</small><h1 className="lesson-q">{material.title}</h1>
        <div className="recall-reading prose prose-sm"><ReactMarkdown>{material.content}</ReactMarkdown></div>
        <aside className="recall-key-points"><h2>Conecte estes pontos</h2><ul>{material.keyPoints.map((point, index) => <li key={index}>{point}</li>)}</ul></aside>
        <p className="activity-quota">Pode consultar seus cadernos e voltar: a sessão fica guardada e o relógio continua contando. Ao terminar, o espaço para escrever abre automaticamente.</p>
      </section>}
      {(phase === 'recall' || phase === 'grading') && <section className="recall-answer">
        <small className="lesson-kicker">AGORA, SEM CONSULTAR</small><h1 className="lesson-q">Conte o que você entendeu.</h1><p>Recupere as ideias principais, explique as conexões e crie um exemplo. Não precisa repetir o texto original.</p>
        <form onSubmit={event => { event.preventDefault(); void submit(); }}>
          <label htmlFor="recall-summary">Seu resumo de memória</label><textarea ref={answerRef} id="recall-summary" className="form-input" value={answer} onChange={event => { const value = event.target.value; saved.update(session => ({ ...session, answer: value })); }} maxLength={8000} rows={9} placeholder="Eu entendi que…" disabled={phase === 'grading'} />
          <div className="activity-input-meta"><span>A IA considera as ideias, e não a quantidade de palavras.</span><span>{answer.length}/8000</span></div>
          {!!saved.session.alternateAnswers?.length && <details className="recall-alternate-drafts"><summary>Rascunhos preservados de outro aparelho</summary><p>Houve uma edição simultânea. Compare com seu resumo antes de substituir.</p>{saved.session.alternateAnswers.map((draft, index) => <div key={index}><p>{draft}</p><button type="button" className="text-action" disabled={phase === 'grading'} onClick={() => saved.update(session => ({ ...session, answer: draft, alternateAnswers: [...new Set([...(session.alternateAnswers ?? []).filter(value => value !== draft), ...(session.answer ? [session.answer] : [])])].slice(-5) }))}>Usar este rascunho</button></div>)}</details>}
          {error && <p role="alert" className="activity-error">{error}</p>}
          <button type="submit" className="duo-btn" disabled={!answer.trim() || phase === 'grading'}><Send size={16} /> {phase === 'grading' ? 'Avaliando seu resumo…' : 'Avaliar meu resumo'}</button>
        </form>
        {phase === 'grading' && <div className="activity-grading" role="status">Buscando conexões no seu resumo<div className="dots" aria-hidden="true"><i /><i /><i /></div></div>}
      </section>}
      {phase === 'result' && result && <>{!progressSaved && <div role="alert" className="activity-save-warning"><p>{error || 'Sua avaliação está pronta. Salve o progresso para continuar.'}</p><button className="duo-btn ghost" onClick={() => saveResult(result)}>Salvar progresso</button></div>}<LearningEvaluationResult result={result} xp={progressSaved ? 20 + Math.round(result.score * 2) : 0} next={progressSaved ? lesson.next : undefined} backSearch={lesson.backSearch} onAgain={() => { saved.update(session => ({ ...session, phase: 'intro' })); setError(''); }} remaining={quota.remaining} /></>}
    </>}
  </LessonShell>;
}
