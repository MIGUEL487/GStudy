import { createFileRoute } from '@tanstack/react-router';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useServerFn } from '@tanstack/react-start';
import ReactMarkdown from 'react-markdown';
import { Eraser, Send, Trash2 } from 'lucide-react';
import { feynmanReply } from '@/lib/learn.functions';
import { awardXp, idsFrom } from '@/lib/learn-client';
import { LessonShell } from '@/components/lesson';

export const Route = createFileRoute('/aprender/feynman')({
  validateSearch: (s: Record<string, unknown>) => ({ m: typeof s['m'] === 'string' ? s['m'] : undefined }),
  head: () => ({ meta: [{ title: 'GStudy · Método Feynman' }, { name: 'description', content: 'Ensine o conteúdo para um aluno virtual que faz perguntas, usando texto e lousa.' }, { property: 'og:title', content: 'GStudy · Método Feynman' }, { property: 'og:description', content: 'Ensine para aprender de verdade.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: FeynmanPage,
});

type Msg = { role: 'user' | 'assistant'; text: string; board?: string };
const colors = ['#f3efe2', '#f5d76e', '#7fd1ae', '#f28b82'];

function FeynmanPage() {
  const { m } = Route.useSearch();
  const reply = useServerFn(feynmanReply);
  const [topic, setTopic] = useState(''); const [started, setStarted] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const board = useRef<Board>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const chat = end.current?.parentElement;
    if (chat) chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy]);
  useEffect(() => { if (started && !busy) input.current?.focus({ preventScroll: true }); }, [started, busy]);

  const start = () => { if (!topic.trim()) return; setStarted(true); setMsgs([{ role: 'assistant', text: `Oi, prof! 👋 Hoje a aula é sobre **${topic.trim()}**, né? Eu não sei nada disso ainda… pode começar do começo? Se quiser, desenha na lousa!` }]); };
  const send = async () => {
    if (busy) return;
    const shot = board.current?.snapshot();
    if (!text.trim() && !shot) return;
    const mine: Msg = { role: 'user', text: text.trim(), ...(shot ? { board: shot } : {}) };
    const next = [...msgs, mine]; setMsgs(next); setText(''); setError(''); setBusy(true);
    try {
      const r = await reply({ data: { topic: topic.trim().slice(0, 200), ids: idsFrom(m), messages: next.slice(1).slice(-30) } });
      setMsgs(x => [...x, { role: 'assistant', text: r.text }]);
      board.current?.clear();
      const nota = /NOTA:\s*(\d+)\s*\/\s*10/i.exec(r.text);
      if (nota && score === null) { const n = Number(nota[1]); setScore(n); void awardXp(20 + n * 3); }
    } catch (e) { setError(e instanceof Error ? e.message : 'O Gui não conseguiu responder.'); setMsgs(x => x.slice(0, -1)); setText(mine.text); }
    finally { setBusy(false); }
  };

  if (!started) return <LessonShell progress={0} title="Método Feynman"><div className="lesson-body feyn-intro">
    <div className="feyn-avatar big">🧒</div>
    <h1 className="lesson-q">Hoje você é a professora.</h1>
    <p className="page-subtitle">Explique um tema para o Gui, um aluno curioso. Ele vai fazer perguntas até entender tudo — e você vai descobrir o que ainda precisa estudar. Use a lousa para desenhar!</p>
    <input className="form-input" autoFocus placeholder="Qual é o tema da aula? Ex.: Fotossíntese" maxLength={200} value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && start()} />
    <button className="duo-btn" disabled={!topic.trim()} onClick={start}>Começar a aula</button>
  </div></LessonShell>;

  const turns = msgs.filter(x => x.role === 'user').length;
  return <LessonShell progress={score !== null ? 1 : Math.min(0.9, turns / 6)} title="Método Feynman">
    <div className="feyn">
      <div className="feyn-chat">
        {msgs.map((x, i) => <div key={i} className={`bubble-row ${x.role}`}>
          {x.role === 'assistant' && <span className="feyn-avatar">🧒</span>}
          <div className="bubble">{x.board && <img src={x.board} alt="Desenho da lousa" className="bubble-board" />}{x.text && (x.role === 'assistant' ? <ReactMarkdown>{x.text}</ReactMarkdown> : <p>{x.text}</p>)}</div>
        </div>)}
        {busy && <div className="bubble-row assistant"><span className="feyn-avatar">🧒</span><div className="bubble typing"><i /><i /><i /></div></div>}
        {score !== null && <div className="feyn-score">🏅 Nota de clareza: <b>{score}/10</b> · XP ganho! Pode continuar ensinando.</div>}
        <div ref={end} />
      </div>
      <div className="feyn-side">
        <Whiteboard ref={board} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="feyn-compose">
          <textarea ref={input} className="form-input" rows={3} placeholder="Explique com suas palavras…" value={text} disabled={busy} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
          <button className="duo-btn" disabled={busy} onClick={() => void send()} aria-label="Enviar explicação"><Send size={18} /></button>
        </div>
        <small className="page-subtitle">O que estiver na lousa vai junto com sua mensagem.</small>
      </div>
    </div>
  </LessonShell>;
}

type Board = { snapshot: () => string | undefined; clear: () => void };
const Whiteboard = forwardRef<Board>(function Whiteboard(_, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(colors[0]!); const [erase, setErase] = useState(false);
  const drawing = useRef(false); const dirty = useRef(false);
  const ctx = () => canvas.current?.getContext('2d') ?? null;
  const paintBg = () => { const c = canvas.current; const g = ctx(); if (!c || !g) return; g.fillStyle = '#2f4a3a'; g.fillRect(0, 0, c.width, c.height); dirty.current = false; };
  useEffect(paintBg, []);
  useImperativeHandle(ref, () => ({ snapshot: () => (dirty.current ? canvas.current?.toDataURL('image/jpeg', 0.7) : undefined), clear: paintBg }));
  const pos = (e: RPointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [(e.clientX - r.left) * (e.currentTarget.width / r.width), (e.clientY - r.top) * (e.currentTarget.height / r.height)] as const; };
  const down = (e: RPointerEvent<HTMLCanvasElement>) => { const g = ctx(); if (!g) return; e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; const [x, y] = pos(e); g.beginPath(); g.moveTo(x, y); };
  const move = (e: RPointerEvent<HTMLCanvasElement>) => { const g = ctx(); if (!g || !drawing.current) return; const [x, y] = pos(e); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = erase ? 26 : 4; g.strokeStyle = erase ? '#2f4a3a' : color; g.lineTo(x, y); g.stroke(); dirty.current = true; };
  return <div className="whiteboard">
    <canvas ref={canvas} width={720} height={420} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drawing.current = false)} onPointerLeave={() => (drawing.current = false)} aria-label="Lousa para desenhar" />
    <div className="wb-tools">
      {colors.map(c => <button key={c} aria-label={`Giz ${c}`} className={`chalk ${!erase && color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => { setColor(c); setErase(false); }} />)}
      <button aria-label="Apagador" className={`icon-btn ${erase ? 'on' : ''}`} onClick={() => setErase(!erase)}><Eraser size={16} /></button>
      <button aria-label="Limpar lousa" className="icon-btn" onClick={paintBg}><Trash2 size={16} /></button>
    </div>
  </div>;
});
