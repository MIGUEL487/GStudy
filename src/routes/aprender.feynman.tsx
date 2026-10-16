import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import ReactMarkdown from 'react-markdown';
import { ArrowLeft, ArrowRight, Award, BookOpen, Check, Lightbulb, LoaderCircle, MessageCircle, Send, Sparkles, Users, X } from 'lucide-react';
import { feynmanReply } from '@/lib/learn.functions';
import { awardXp, idsFrom } from '@/lib/learn-client';
import { learningSearch } from '@/lib/learning-model';
import { useLessonContext } from '@/components/learning-provider';
import { useDailyAttempt } from '@/hooks/use-daily-attempt';
import { students, studentOf, type StudentId } from '@/lib/students';
import { LessonShell } from '@/components/lesson';
import { Whiteboard, type Board } from '@/components/whiteboard';
import { StudentIllustration } from '@/components/student-illustration';
import '@/styles/feynman-polish.css';

export const Route = createFileRoute('/aprender/feynman')({
  validateSearch: learningSearch,
  head: () => ({ meta: [{ title: 'GStudy · Método Feynman' }, { name: 'description', content: 'Ensine o conteúdo para alunos virtuais curiosos, usando texto e lousa.' }, { property: 'og:title', content: 'GStudy · Método Feynman' }, { property: 'og:description', content: 'Ensine para aprender de verdade.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }),
  component: FeynmanPage,
});

type Msg = { role: 'user' | 'assistant'; text: string; board?: string; studentId?: StudentId };
type LessonSearch = ReturnType<typeof learningSearch>;

function FeynmanPage() { const search = Route.useSearch(); return <FeynmanLesson key={`${search.p ?? ''}:${search.t ?? ''}:${search.m ?? ''}`} lessonSearch={search} />; }

function StudentPicker({ selected, disabled, onChange }: { selected: StudentId; disabled: boolean; onChange: (student: StudentId) => void }) {
  return <div className="feyn-student-picker" role="group" aria-label="Escolher aluno">
    {students.map(student => <button type="button" key={student.id} aria-pressed={selected === student.id} title={student.description} disabled={disabled} onClick={() => onChange(student.id)}>
      <span className="feyn-student-mini" style={{ color: student.color }}><StudentIllustration studentId={student.id} /></span><span>{student.name}</span>
    </button>)}
  </div>;
}

export function FeynmanLesson({ materialSearch, lessonSearch }: { materialSearch?: string | undefined; lessonSearch?: LessonSearch | undefined }) {
  const search = lessonSearch ?? learningSearch({ m: materialSearch });
  const lesson = useLessonContext(search);
  const attempt = useDailyAttempt('feynman');
  const reply = useServerFn(feynmanReply);
  const [topic, setTopic] = useState(lesson.context?.topic ?? '');
  const [started, setStarted] = useState(false);
  const [studentId, setStudentId] = useState<StudentId>('gui');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [progressSaved, setProgressSaved] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const successfulSession = useRef(false);
  const sending = useRef(false);
  const awarded = useRef(false);
  const board = useRef<Board>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const student = studentOf(studentId);

  useEffect(() => { if (!started && lesson.ready && lesson.context?.topic) setTopic(lesson.context.topic); }, [started, lesson.ready, lesson.context?.topic]);
  useEffect(() => { const chat = end.current?.parentElement; if (chat) chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' }); }, [msgs, busy, historyOpen]);
  useEffect(() => { if (started && !busy) input.current?.focus({ preventScroll: true }); }, [started, busy]);

  const chooseStudent = (id: StudentId) => {
    if (busy || id === studentId) return;
    setStudentId(id);
    if (started) setMsgs(messages => [...messages, { role: 'assistant', text: studentOf(id).greeting(topic.trim()), studentId: id }]);
  };
  const start = () => {
    if (!topic.trim() || !lesson.ready || !lesson.allowed) return;
    setStarted(true);
    setMsgs([{ role: 'assistant', text: student.greeting(topic.trim()), studentId }]);
  };
  const saveGrade = (value: number) => {
    const saved = lesson.complete('feynman');
    if (search.p && !saved) { setProgressSaved(false); setError('Sua nota está pronta, mas o progresso não foi salvo. Tente salvar novamente.'); return; }
    setProgressSaved(true); setError('');
    if (!awarded.current) { awarded.current = true; void awardXp(20 + Math.round(value * 3)); }
  };
  const send = async () => {
    if (sending.current) return;
    if (board.current?.isLoading?.()) { setError("Aguarde a imagem terminar de carregar na lousa antes de enviar."); return; }
    const shot = board.current?.snapshot();
    if (!text.trim() && !shot) return;
    let token: string | undefined;
    try { if (!successfulSession.current) token = attempt.begin(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível iniciar esta aula.'); return; }
    sending.current = true;
    const mine: Msg = { role: 'user', text: text.trim(), ...(shot ? { board: shot } : {}) };
    const next = [...msgs, mine];
    setMsgs(next); setText(''); setError(''); setBusy(true);
    try {
      const result = await reply({ data: {
        topic: topic.trim().slice(0, 200), ids: idsFrom(search.m), studentId,
        ...(lesson.context ? { context: lesson.context } : {}),
        messages: next.slice(1).slice(-30).filter((message, index, history) => index >= history.findIndex(m => m.role === 'user')).map(({ role, text: messageText, board: image }) => ({ role, text: messageText, ...(image ? { board: image } : {}) })),
      } });
      if (token) attempt.succeed(token);
      successfulSession.current = true;
      setMsgs(messages => [...messages, { role: 'assistant', text: result.text, studentId }]);
      board.current?.clear();
      const grade = /NOTA:\s*(\d+(?:[.,]\d+)?)\s*\/\s*10/i.exec(result.text);
      if (grade && score === null) {
        const value = Math.min(10, Math.max(0, Number(grade[1]!.replace(',', '.'))));
        setScore(value); saveGrade(value);
      }
    } catch (cause) {
      if (token) attempt.fail(token);
      setError(cause instanceof Error ? cause.message : `${student.name} não conseguiu responder. Tente novamente.`);
      setMsgs(messages => messages.slice(0, -1)); setText(mine.text);
    } finally { sending.current = false; setBusy(false); }
  };

  if (search.p && lesson.ready && (!lesson.context || !lesson.allowed)) return <LessonShell progress={0} title="Método Feynman"><div className="lesson-thinking"><BookOpen size={32} /><h1>Volte à sua trilha</h1><p>Esta etapa não está disponível. Abra a trilha e escolha a próxima atividade.</p><Link to="/aprender" search={lesson.backSearch} className="duo-btn">Ver minha trilha</Link></div></LessonShell>;

  if (!started) return <LessonShell progress={0} title="Método Feynman" backSearch={lesson.backSearch}><div className="lesson-body feyn-intro">
    <div className="feyn-intro-portrait" key={studentId}><StudentIllustration studentId={studentId} /></div>
    <span className="feyn-intro-kicker"><Users size={15} /> Uma turma inteira para aprender com você</span>
    <h1 className="lesson-q">Quem ensina também aprende.</h1>
    <p className="page-subtitle">Gui, Lia, Rafa e Maya fazem perguntas de jeitos diferentes. Escolha quem vai ouvir sua explicação e use palavras, exemplos ou a lousa.</p>
    <StudentPicker selected={studentId} disabled={false} onChange={chooseStudent} />
    <input className="form-input" autoFocus placeholder="Qual é o tema da aula? Ex.: Fotossíntese" maxLength={200} value={topic} onChange={event => setTopic(event.target.value)} onKeyDown={event => event.key === 'Enter' && start()} />
    <p className="feyn-attempt-note">{attempt.remaining} de 2 aulas disponíveis hoje. A conversa inteira conta como uma aula.</p>
    <button className="duo-btn" disabled={!topic.trim() || attempt.remaining === 0 || !lesson.ready} onClick={start}>Começar a aula</button>
  </div></LessonShell>;

  const turns = msgs.filter(message => message.role === 'user').length;
  const question = [...msgs].reverse().find(message => message.role === 'assistant')?.text || '';
  const progress = score !== null ? 100 : Math.round(Math.min(0.9, turns / 6) * 100);
  return <section className="feyn-studio" aria-label="Aula com lousa de estudos">
    <header className="feyn-studio-heading">
      <div>
        <Link to="/aprender" search={lesson.backSearch} className="feyn-back"><ArrowLeft size={14} /> Voltar à trilha</Link>
        <p className="eyebrow">Método Feynman · Aprender ensinando</p>
        <h1>Lousa de estudos<span className="feyn-title-dot">.</span></h1>
        <p className="feyn-topic"><BookOpen size={14} /> Sua aula: <strong>{topic.trim()}</strong></p>
      </div>
      <button type="button" className={`feyn-history-toggle ${historyOpen ? 'is-open' : ''}`} aria-expanded={historyOpen} aria-controls="feyn-history" onClick={() => setHistoryOpen(open => !open)}>
        {historyOpen ? <X size={17} /> : <MessageCircle size={17} />}{historyOpen ? 'Fechar conversa' : 'Ver conversa'}{turns > 0 && <span aria-hidden="true">{turns}</span>}
      </button>
    </header>
    <div className="feyn-stage">
      <div className="feyn-board-area">
        <form className="feyn-studio-compose" onSubmit={event => { event.preventDefault(); void send(); }}>
          <div className="feyn-compose-label"><Sparkles size={16} /><label htmlFor="feyn-explanation">Agora é a sua vez</label><span>Explique para {student.name}</span></div>
          <div className="feyn-compose-fields">
            <textarea id="feyn-explanation" ref={input} rows={2} maxLength={8000} placeholder="Explique aqui, do seu jeito…" value={text} disabled={busy} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} />
            <button type="submit" disabled={busy} className="feyn-send" aria-label="Enviar explicação">{busy ? <LoaderCircle size={18} className="feyn-loading-icon" /> : <Send size={18} />}<span>{busy ? 'Enviando…' : 'Enviar'}</span></button>
          </div>
          <div className="feyn-compose-footer"><span>Imagens e desenhos da lousa vão junto com sua explicação.</span><span>Enter envia · Shift + Enter quebra a linha</span></div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
        <Whiteboard ref={board} disabled={busy} variant="paper" />
      </div>
      <aside className="feyn-student-column" aria-label="Seu aluno virtual">
        <StudentPicker selected={studentId} disabled={busy} onChange={chooseStudent} />
        <section key={studentId} className={`feyn-student-card ${busy ? 'is-thinking' : ''}`} aria-labelledby="feyn-student-title">
          <div className="feyn-student-label"><span><i style={{ background: student.color }} /> {student.name}, {studentId === 'lia' || studentId === 'maya' ? 'sua aluna' : 'seu aluno'}</span><Lightbulb size={18} /></div>
          <StudentIllustration thinking={busy} studentId={studentId} />
          <div className="feyn-student-copy">
            <p className="eyebrow">{busy ? 'Ouvindo sua explicação' : student.description}</p>
            <h2 id="feyn-student-title">{busy ? 'Deixa eu pensar…' : turns ? 'Me explica uma coisa…' : 'Explique com suas palavras.'}</h2>
            <div className="feyn-student-question" aria-live="polite" aria-atomic="true">{busy ? <div role="status"><p>Estou olhando sua explicação. Já volto com uma pergunta!</p><div className="dots" aria-hidden="true"><i /><i /><i /></div></div> : <ReactMarkdown>{question}</ReactMarkdown>}</div>
          </div>
          <div className="feyn-student-foot"><Sparkles size={14} /><p>Não precisa ser perfeito.<br />Só precisa fazer sentido para você.</p></div>
        </section>
        <div className="feyn-lesson-progress">
          <div><span>{score !== null ? 'Aula concluída' : 'Um passo de cada vez'}</span><span>{score !== null ? <Check size={14} /> : `${turns} ${turns === 1 ? 'explicação' : 'explicações'}`}</span></div>
          <div role="progressbar" aria-label="Progresso da aula" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${Math.max(3, progress)}%` }} /></div>
        </div>
        {score !== null && <div className="feyn-score" role="status"><Award size={19} /><span>Clareza: <b>{score}/10</b><small>{progressSaved ? 'XP ganho! Pode continuar ensinando.' : 'Sua nota está pronta. Salve o progresso para continuar.'}</small></span>{!progressSaved && <button className="duo-btn ghost" onClick={() => saveGrade(score)}>Salvar progresso</button>}{progressSaved && lesson.next && <Link {...lesson.next} className="feyn-next">Próxima atividade <ArrowRight size={15} /></Link>}</div>}
      </aside>
    </div>
    {historyOpen && <section id="feyn-history" className="feyn-history" aria-label="Conversa da aula">
      <header><div><MessageCircle size={17} /><h2>O caminho até entender</h2></div><p>Suas explicações e as perguntas da turma, no mesmo lugar.</p></header>
      <div className="feyn-chat">
        {msgs.map((message, index) => <div key={index} className={`bubble-row ${message.role}`}>
          <span className="feyn-message-author">{message.role === 'assistant' ? studentOf(message.studentId ?? 'gui').name : 'Você'}</span>
          <div className="bubble">{message.board && <img src={message.board} alt="Desenho enviado na explicação" className="bubble-board" />}{message.text && (message.role === 'assistant' ? <ReactMarkdown>{message.text}</ReactMarkdown> : <p>{message.text}</p>)}</div>
        </div>)}
        {busy && <div className="bubble-row assistant"><span className="feyn-message-author">{student.name}</span><div className="bubble typing"><i /><i /><i /></div></div>}
        <div ref={end} />
      </div>
    </section>}
  </section>;
}
