import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useRef, useState } from 'react';
import { ArrowRight, Lightbulb, PencilRuler, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { LessonShell, Thinking } from '@/components/lesson';
import { LearningEvaluationResult, type LearningEvaluation } from '@/components/learning-evaluation';
import { useLessonContext } from '@/components/learning-provider';
import { Whiteboard, type Board } from '@/components/whiteboard';
import { useDailyAttempt } from '@/hooks/use-daily-attempt';
import { learningSearch } from '@/lib/learning-model';
import { generateReviewChallenge, gradeReview } from '@/lib/learning.functions';
import { awardXp, idsFrom } from '@/lib/learn-client';
import '@/styles/recall-review.css';

type Search = ReturnType<typeof learningSearch>;
type Challenge = { prompt: string; hint: string };
type Phase = 'intro' | 'loading' | 'challenge' | 'grading' | 'result';

export const Route = createFileRoute('/aprender/revisao')({
  validateSearch: learningSearch,
  head: () => ({ meta: [{ title: 'GStudy · Desafio de síntese' }, { name: 'description', content: 'Conecte as ideias da sua trilha em uma explicação ou um desenho.' }] }),
  component: ReviewPage,
});

function ReviewPage() { const search = Route.useSearch(); return <ReviewLesson key={`${search.p ?? ''}:${search.t ?? ''}:${search.m ?? ''}`} search={search} />; }

export function ReviewLesson({ search }: { search: Search }) {
  const lesson = useLessonContext(search);
  const quota = useDailyAttempt('review');
  const generate = useServerFn(generateReviewChallenge);
  const evaluate = useServerFn(gradeReview);
  const [phase, setPhase] = useState<Phase>('intro');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [answer, setAnswer] = useState('');
  const [hintOpen, setHintOpen] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<LearningEvaluation | null>(null);
  const [progressSaved, setProgressSaved] = useState(false);
  const busy = useRef(false);
  const awarded = useRef(false);
  const board = useRef<Board>(null);

  const saveResult = (evaluation: LearningEvaluation) => {
    if (search.p && !lesson.complete('review')) { setError('Sua avaliação está pronta, mas o progresso não foi salvo. Tente salvar novamente.'); return; }
    setProgressSaved(true); setError('');
    if (!awarded.current) { awarded.current = true; void awardXp(25 + Math.round(evaluation.score * 3)); }
  };

  const start = async () => {
    const context = lesson.context;
    if (!lesson.ready || !lesson.allowed || !context || busy.current) return;
    busy.current = true; setError('');
    let reservation: string | undefined;
    try {
      reservation = quota.begin(); setPhase('loading');
      const generated = await generate({ data: { context, ids: idsFrom(search.m) } });
      if (!generated.prompt.trim()) throw new Error('O desafio veio vazio. Tente preparar a revisão novamente.');
      quota.succeed(reservation); setChallenge(generated); setAnswer(''); setHintOpen(false); setResult(null); awarded.current = false; setProgressSaved(false); setPhase('challenge');
    } catch (failure) {
      if (reservation) quota.fail(reservation);
      setError(failure instanceof Error ? failure.message : 'Não foi possível preparar seu desafio. Tente novamente.'); setPhase('intro');
    } finally { busy.current = false; }
  };

  const submit = async () => {
    const context = lesson.context;
    if (!lesson.ready || !lesson.allowed || !context || !challenge || busy.current || phase !== 'challenge') return;
    const snapshot = board.current?.snapshot();
    if (!answer.trim() && !snapshot) { setError('Escreva uma explicação ou faça um desenho na lousa para enviar.'); return; }
    busy.current = true; setError(''); setPhase('grading');
    try {
      const evaluation = await evaluate({ data: { context, ids: idsFrom(search.m), answer: answer.trim(), challenge: challenge.prompt, ...(snapshot ? { board: snapshot } : {}) } });
      setResult(evaluation); setPhase('result'); saveResult(evaluation);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível avaliar sua revisão. Seu texto e desenho foram preservados.'); setPhase('challenge');
    } finally { busy.current = false; }
  };

  if (!lesson.ready) return <LessonShell title="Desafio de síntese" progress={0} backSearch={lesson.backSearch}><Thinking text="Abrindo sua trilha…" /></LessonShell>;
  return <LessonShell title="Desafio de síntese" progress={phase === 'result' ? 1 : phase === 'challenge' || phase === 'grading' ? .6 : 0} backSearch={lesson.backSearch}>
    {!lesson.context ? <section className="recall-intro"><PencilRuler size={42} strokeWidth={1.25} /><h1 className="lesson-q">{lesson.allowed ? 'Qual ideia vamos conectar?' : 'Uma ideia de cada vez.'}</h1><p>{lesson.allowed ? 'Escolha um assunto da sua trilha para abrir o desafio de síntese.' : 'Conclua a atividade anterior para abrir o desafio final deste assunto.'}</p><Link to="/aprender" search={lesson.backSearch} className="duo-btn">Voltar à trilha <ArrowRight size={17} /></Link></section> : <>
      {phase === 'intro' && <section className="recall-intro">
        <span className="activity-outline-icon"><PencilRuler size={35} strokeWidth={1.25} /></span><small className="lesson-kicker">O ÚLTIMO PASSO É FAZER CONEXÕES</small><h1 className="lesson-q">Mostre por que funciona.</h1>
        <p>Transforme o que aprendeu sobre <strong>{lesson.context.topic}</strong> em uma explicação, um desenho ou os dois juntos. O desafio será criado para esse assunto.</p>
        <div className="review-intro-note"><Lightbulb size={22} strokeWidth={1.4} /><p>Mais do que lembrar uma fórmula: explique de onde vem a ideia, conecte os conceitos e mostre um exemplo.</p></div>
        <p className="activity-quota">Até 2 sessões por dia neste navegador. Disponíveis hoje: {quota.remaining}.</p>
        {error && <p role="alert" className="activity-error">{error}</p>}
        <button className="duo-btn" onClick={() => void start()} disabled={quota.remaining <= 0}>Abrir meu desafio <ArrowRight size={17} /></button>
      </section>}
      {phase === 'loading' && <Thinking text="Conectando as ideias para o seu desafio final…" />}
      {(phase === 'challenge' || phase === 'grading') && challenge && <section className="review-workspace">
        <small className="lesson-kicker">DESAFIO DE SÍNTESE · {lesson.context.topic}</small>
        <div className="review-prompt prose prose-sm"><ReactMarkdown>{challenge.prompt}</ReactMarkdown></div>
        <button className="review-hint-toggle" onClick={() => setHintOpen(value => !value)} aria-expanded={hintOpen}><Lightbulb size={17} />{hintOpen ? 'Fechar pista' : 'Preciso de uma pista'}</button>
        {hintOpen && <div className="review-hint prose prose-sm"><ReactMarkdown>{challenge.hint}</ReactMarkdown></div>}
        <form className="review-answer-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
          <label htmlFor="review-answer">Sua explicação</label><textarea id="review-answer" className="form-input" rows={3} maxLength={8000} value={answer} onChange={event => setAnswer(event.target.value)} placeholder="A ideia funciona porque… Você também pode responder desenhando abaixo." disabled={phase === 'grading'} />
          <div className="activity-input-meta"><span>Texto, desenho ou os dois: escolha como explicar.</span><span>{answer.length}/8000</span></div>
          {error && <p role="alert" className="activity-error">{error}</p>}
          <button type="submit" className="duo-btn" disabled={phase === 'grading'}><Send size={16} />{phase === 'grading' ? 'Avaliando suas conexões…' : 'Enviar minha revisão'}</button>
        </form>
        {phase === 'grading' && <div className="activity-grading" role="status">Olhando sua explicação e seu desenho<div className="dots" aria-hidden="true"><i /><i /><i /></div></div>}
        <div className="review-board"><Whiteboard ref={board} variant="paper" disabled={phase === 'grading'} /></div>
      </section>}
      {phase === 'result' && result && <>{!progressSaved && <div role="alert" className="activity-save-warning"><p>{error}</p><button className="duo-btn ghost" onClick={() => saveResult(result)}>Salvar progresso</button></div>}<LearningEvaluationResult result={result} xp={progressSaved ? 25 + Math.round(result.score * 3) : 0} next={progressSaved ? lesson.next : undefined} backSearch={lesson.backSearch} onAgain={() => { setPhase('intro'); setError(''); }} remaining={quota.remaining} visualTopic={`${lesson.plan?.topic ?? ''} ${lesson.context.topic} ${lesson.context.challenge ?? ''}`} /></>}
    </>}
  </LessonShell>;
}
