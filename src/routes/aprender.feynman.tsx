import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, BookOpen, Check, Lightbulb, LoaderCircle, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { feynmanReply } from '@/lib/learn.functions';
import { awardXp, idsFrom } from '@/lib/learn-client';
import { LessonShell } from '@/components/lesson';
import { Whiteboard, type Board } from '@/components/whiteboard';
import { StudentIllustration } from '@/components/student-illustration';

export const Route = createFileRoute('/aprender/feynman')({
  validateSearch: (s: Record<string, unknown>) => ({ m: typeof s['m'] === 'string' ? s['m'] : undefined }),
  head: () => ({ meta: [{ title: 'GStudy · Método Feynman' }, { name: 'description', content: 'Ensine o conteúdo para um aluno virtual que faz perguntas, usando texto e lousa.' }, { property: 'og:title', content: 'GStudy · Método Feynman' }, { property: 'og:description', content: 'Ensine para aprender de verdade.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: FeynmanPage,
});

type Msg = { role: 'user' | 'assistant'; text: string; board?: string };

function FeynmanPage() {
  const { m } = Route.useSearch();
  return <FeynmanLesson materialSearch={m} />;
}

export function FeynmanLesson({ materialSearch }: { materialSearch?: string | undefined }) {
  const reply = useServerFn(feynmanReply);
  const [topic, setTopic] = useState(''); const [started, setStarted] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const board = useRef<Board>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const chat = end.current?.parentElement;
    if (chat) chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy, historyOpen]);
  useEffect(() => { if (started && !busy) input.current?.focus({ preventScroll: true }); }, [started, busy]);

  const start = () => { if (!topic.trim()) return; setStarted(true); setMsgs([{ role: 'assistant', text: `Oi, prof! 👋 Hoje a aula é sobre **${topic.trim()}**, né? Eu não sei nada disso ainda… pode começar do começo? Se quiser, desenha na lousa!` }]); };
  const send = async () => {
    if (busy) return;
    const shot = board.current?.snapshot();
    if (!text.trim() && !shot) return;
    const mine: Msg = { role: 'user', text: text.trim(), ...(shot ? { board: shot } : {}) };
    const next = [...msgs, mine]; setMsgs(next); setText(''); setError(''); setBusy(true);
    try {
      const r = await reply({ data: { topic: topic.trim().slice(0, 200), ids: idsFrom(materialSearch), messages: next.slice(1).slice(-30) } });
      setMsgs(x => [...x, { role: 'assistant', text: r.text }]);
      board.current?.clear();
      const nota = /NOTA:\s*(\d+)\s*\/\s*10/i.exec(r.text);
      if (nota && score === null) { const n = Number(nota[1]); setScore(n); void awardXp(20 + n * 3); }
    } catch (e) { setError(e instanceof Error ? e.message : 'O Gui não conseguiu responder.'); setMsgs(x => x.slice(0, -1)); setText(mine.text); }
    finally { setBusy(false); }
  };

  if (!started) return <LessonShell progress={0} title="Método Feynman"><div className="lesson-body feyn-intro">
    <div className="feyn-intro-portrait"><StudentIllustration /></div>
    <h1 className="lesson-q">Hoje você é a professora.</h1>
    <p className="page-subtitle">Explique um tema para o Gui, um aluno curioso. Ele vai fazer perguntas até entender tudo — e você vai descobrir o que ainda precisa estudar. Use a lousa para desenhar!</p>
    <input className="form-input" autoFocus placeholder="Qual é o tema da aula? Ex.: Fotossíntese" maxLength={200} value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && start()} />
    <button className="duo-btn" disabled={!topic.trim()} onClick={start}>Começar a aula</button>
  </div></LessonShell>;

  const turns = msgs.filter(x => x.role === 'user').length;
  const question = [...msgs].reverse().find(x => x.role === 'assistant')?.text || '';
  const progress = score !== null ? 100 : Math.round(Math.min(0.9, turns / 6) * 100);
  return <section className="feyn-studio" aria-label="Aula com lousa de estudos">
    <header className="feyn-studio-heading">
      <div>
        <Link to="/aprender" className="feyn-back"><ArrowLeft size={14} /> Voltar às atividades</Link>
        <p className="eyebrow">Método Feynman · Aprender ensinando</p>
        <h1>Lousa de estudos<span className="feyn-title-dot">.</span></h1>
        <p className="feyn-topic"><BookOpen size={14} /> Sua aula: <strong>{topic.trim()}</strong></p>
      </div>
      <button type="button" className={`feyn-history-toggle ${historyOpen ? 'is-open' : ''}`} aria-expanded={historyOpen} aria-controls="feyn-history" onClick={() => setHistoryOpen(open => !open)}>
        {historyOpen ? <X size={17} /> : <MessageCircle size={17} />}
        {historyOpen ? 'Fechar conversa' : 'Ver conversa'}
        {turns > 0 && <span aria-hidden="true">{turns}</span>}
      </button>
    </header>

    <div className="feyn-stage">
      <div className="feyn-board-area">
        <Whiteboard ref={board} disabled={busy} variant="paper" />
        <form className="feyn-studio-compose" onSubmit={e => { e.preventDefault(); void send(); }}>
          <div className="feyn-compose-label"><Sparkles size={17} /><label htmlFor="feyn-explanation">Agora é a sua vez</label></div>
          <div className="feyn-compose-fields">
            <textarea id="feyn-explanation" ref={input} rows={2} maxLength={8000} placeholder="Explique aqui, do seu jeito…" value={text} disabled={busy} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
            <button type="submit" disabled={busy} className="feyn-send" aria-label="Enviar explicação">{busy ? <LoaderCircle size={18} className="feyn-loading-icon" /> : <Send size={18} />}<span>{busy ? 'Enviando…' : 'Enviar'}</span></button>
          </div>
          <div className="feyn-compose-footer"><span>Seu desenho vai junto com a explicação.</span><span>Enter envia · Shift + Enter quebra a linha</span></div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      </div>

      <aside className="feyn-student-column" aria-label="Seu aluno virtual">
        <section className={`feyn-student-card ${busy ? 'is-thinking' : ''}`} aria-labelledby="feyn-student-title">
          <div className="feyn-student-label"><span><i /> Gui, seu aluno</span><Lightbulb size={18} /></div>
          <StudentIllustration thinking={busy} />
          <div className="feyn-student-copy">
            <p className="eyebrow">{busy ? 'Ouvindo sua explicação' : turns ? 'Uma pergunta para você' : 'Vamos aprender juntos'}</p>
            <h2 id="feyn-student-title">{busy ? 'Deixa eu pensar…' : turns ? 'Me explica uma coisa…' : 'Explique com suas palavras.'}</h2>
            <div className="feyn-student-question" aria-live="polite" aria-atomic="true">{busy ? <p role="status">Estou olhando sua explicação. Já volto com uma pergunta!</p> : <ReactMarkdown>{question}</ReactMarkdown>}</div>
          </div>
          <div className="feyn-student-foot"><Sparkles size={14} /><p>Não precisa ser perfeito.<br />Só precisa fazer sentido para você.</p></div>
        </section>
        <div className="feyn-lesson-progress">
          <div><span>{score !== null ? 'Aula concluída' : 'Um passo de cada vez'}</span><span>{score !== null ? <Check size={14} /> : `${turns} ${turns === 1 ? 'explicação' : 'explicações'}`}</span></div>
          <div role="progressbar" aria-label="Progresso da aula" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${Math.max(3, progress)}%` }} /></div>
        </div>
        {score !== null && <div className="feyn-score" role="status">🏅 Clareza: <b>{score}/10</b><small>XP ganho! Pode continuar ensinando.</small></div>}
      </aside>
    </div>

    {historyOpen && <section id="feyn-history" className="feyn-history" aria-label="Conversa da aula">
      <header><div><MessageCircle size={17} /><h2>O caminho até entender</h2></div><p>Suas explicações e as perguntas do Gui, no mesmo lugar.</p></header>
      <div className="feyn-chat">
        {msgs.map((x, i) => <div key={i} className={`bubble-row ${x.role}`}>
          <span className="feyn-message-author">{x.role === 'assistant' ? 'Gui' : 'Você'}</span>
          <div className="bubble">{x.board && <img src={x.board} alt="Desenho enviado na explicação" className="bubble-board" />}{x.text && (x.role === 'assistant' ? <ReactMarkdown>{x.text}</ReactMarkdown> : <p>{x.text}</p>)}</div>
        </div>)}
        {busy && <div className="bubble-row assistant"><span className="feyn-message-author">Gui</span><div className="bubble typing"><i /><i /><i /></div></div>}
        <div ref={end} />
      </div>
    </section>}
  </section>;
}
