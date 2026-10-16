import { Link } from '@tanstack/react-router';
import { ArrowRight, Check, CircleHelp, Medal, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { LearningConceptVisual } from './learning-concept-visual';

export type LearningEvaluation = {
  score: number;
  feedback: string;
  strengths: string[];
  gaps: string[];
  modelAnswer: string;
};

/** The answer remains behind an explicit reveal, so feedback comes before imitation. */
export function LearningEvaluationResult({ result, xp, next, backSearch, onAgain, remaining, visualTopic }: {
  result: LearningEvaluation;
  xp: number;
  next?: { to: string; search: { m?: string | undefined; p?: string | undefined; t?: string | undefined } } | undefined;
  backSearch: { m?: string | undefined; p?: string | undefined; t?: string | undefined };
  onAgain: () => void;
  remaining: number;
  visualTopic?: string | undefined;
}) {
  const [revealed, setRevealed] = useState(false);
  return <section className="learning-evaluation" aria-labelledby="evaluation-heading">
    <div className="evaluation-medal" aria-hidden="true"><Medal size={32} strokeWidth={1.4} /></div>
    <small className="lesson-kicker">PRÁTICA CONCLUÍDA · +{xp} XP</small>
    <h1 className="lesson-q" id="evaluation-heading">Seu conhecimento ganhou forma.</h1>
    <div className="evaluation-score" aria-label={`Nota ${result.score} de 10`}><strong>{result.score}</strong><span>/10</span></div>
    <p className="evaluation-disclaimer">Avaliação formativa por IA: use as sugestões para revisar o conteúdo.</p>
    <div className="evaluation-feedback prose prose-sm"><ReactMarkdown>{result.feedback}</ReactMarkdown></div>
    <div className="evaluation-columns">
      <div><h2><Check size={18} /> O que você já sabe</h2><ul>{result.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul>{!result.strengths.length && <p>Este é o começo. Tente explicar uma ideia central com suas palavras.</p>}</div>
      <div><h2><CircleHelp size={18} /> Próximo passo</h2><ul>{result.gaps.map((item, index) => <li key={index}>{item}</li>)}</ul>{!result.gaps.length && <p>Experimente aplicar a ideia a um exemplo novo.</p>}</div>
    </div>
    <button className="evaluation-reveal" aria-expanded={revealed} onClick={() => setRevealed(value => !value)}>{revealed ? 'Ocultar resposta de referência' : 'Comparar com uma resposta de referência'}</button>
    {revealed && <><div className="evaluation-model prose prose-sm"><ReactMarkdown>{result.modelAnswer}</ReactMarkdown></div>{visualTopic && <LearningConceptVisual topic={visualTopic} />}</>}
    <div className="evaluation-actions">
      <button className="duo-btn ghost" onClick={onAgain} disabled={remaining <= 0}><RotateCcw size={16} /> Praticar de novo</button>
      {next ? <Link className="duo-btn" to={next.to} search={next.search}>Próxima atividade <ArrowRight size={17} /></Link> : <Link className="duo-btn" to="/aprender" search={backSearch}>Voltar à trilha <ArrowRight size={17} /></Link>}
    </div>
    {remaining <= 0 && <p className="activity-quota">Você completou as duas sessões de hoje deste teste neste navegador. Volte amanhã para praticar de novo.</p>}
  </section>;
}
