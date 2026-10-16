import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Download, MessageSquareHeart, RefreshCw, Save, Star, Trash2 } from 'lucide-react';
import { Button } from './ui/button';

const categories = { suggestion: 'Sugestão', problem: 'Problema', compliment: 'O que funcionou bem' } as const;
type Category = keyof typeof categories;
export type FeedbackEntry = { id: string; category: Category; rating: number; message: string; createdAt: string };
const storageKey = (userId: string) => `gstudy.feedback.v1:${userId}`;

function readFeedback(userId: string): FeedbackEntry[] {
  const raw = localStorage.getItem(storageKey(userId));
  if (!raw) return [];
  const saved: unknown = JSON.parse(raw);
  if (!saved || typeof saved !== 'object' || !('version' in saved) || saved.version !== 1 || !('entries' in saved) || !Array.isArray(saved.entries) || saved.entries.length > 100) throw new Error('invalid feedback');
  const ids = new Set<string>();
  for (const entry of saved.entries) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !entry.id || entry.id.length > 100 || typeof entry.category !== 'string' || !Object.hasOwn(categories, entry.category) || !Number.isInteger(entry.rating) || entry.rating < 1 || entry.rating > 5 || typeof entry.message !== 'string' || entry.message.trim().length < 10 || entry.message.length > 3000 || typeof entry.createdAt !== 'string' || !Number.isFinite(Date.parse(entry.createdAt))) throw new Error('invalid feedback');
    if (ids.has(entry.id)) throw new Error('duplicate feedback');
    ids.add(entry.id);
  }
  return saved.entries as FeedbackEntry[];
}

function download(entries: FeedbackEntry[]) {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ app: 'GStudy', version: 1, entries }, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'gstudy-feedbacks.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FeedbackPanel({ userId }: { userId: string }) {
  const id = useId();
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [ready, setReady] = useState(false); const [storageError, setStorageError] = useState('');
  const [category, setCategory] = useState<Category>('suggestion'); const [rating, setRating] = useState(4);
  const [message, setMessage] = useState(''); const [notice, setNotice] = useState('');
  const load = useCallback(() => {
    try { setEntries(readFeedback(userId)); setReady(true); setStorageError(''); }
    catch { setEntries([]); setReady(false); setStorageError('Não foi possível ler seu histórico de feedbacks. Ele foi preservado. Tente recarregar ou libere o armazenamento do navegador.'); }
  }, [userId]);
  useEffect(() => { load(); setMessage(''); setNotice(''); setCategory('suggestion'); setRating(4); }, [load]);
  const persist = (next: FeedbackEntry[]) => {
    try { localStorage.setItem(storageKey(userId), JSON.stringify({ version: 1, entries: next })); setEntries(next); setStorageError(''); return true; }
    catch { setStorageError('O feedback não foi salvo. O navegador pode estar sem espaço ou com o armazenamento bloqueado. Seu texto continua aqui.'); return false; }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault(); setNotice('');
    if (!ready || message.trim().length < 10 || message.length > 3000) return;
    if (entries.length >= 100) { setStorageError('Seu histórico chegou a 100 feedbacks. Exporte uma cópia e remova os antigos para continuar.'); return; }
    const next: FeedbackEntry = { id: crypto.randomUUID(), category, rating, message: message.trim(), createdAt: new Date().toISOString() };
    if (persist([next, ...entries])) { setMessage(''); setNotice('Feedback salvo neste dispositivo. Baixe o histórico se quiser compartilhá-lo.'); }
  };
  return <section className="settings-section feedback-panel">
    <div className="settings-card-heading"><MessageSquareHeart size={25} strokeWidth={1.5} /><div><h2>Sua experiência importa</h2><p>Um espaço para registrar o que pode melhorar e o que ajudou você a aprender.</p></div></div>
    <p className="feedback-local-note">Seus feedbacks ficam salvos neste navegador, separados por conta. Eles não são enviados automaticamente à equipe. Você pode baixar e compartilhar uma cópia.</p>
    <form onSubmit={submit} className="feedback-form">
      <label className="form-label" htmlFor={`${id}-category`}>Sobre o que você quer falar?<select id={`${id}-category`} className="form-input" value={category} onChange={e => setCategory(e.target.value as Category)}>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <fieldset className="feedback-rating"><legend>Como está sua experiência?</legend><div>{[1, 2, 3, 4, 5].map(value => <label key={value} className={rating === value ? 'selected' : ''}><input type="radio" name={`${id}-rating`} value={value} checked={rating === value} onChange={() => setRating(value)} /><Star size={19} strokeWidth={1.5} /><span>{value}</span><span className="sr-only"> de 5</span></label>)}</div></fieldset>
      <label className="form-label" htmlFor={`${id}-message`}>Conte um pouco mais<textarea id={`${id}-message`} className="form-input" rows={5} minLength={10} maxLength={3000} value={message} onChange={e => { setMessage(e.target.value); setNotice(''); }} placeholder="O que aconteceu? O que deixaria seus estudos melhores?" required /></label>
      <div className="feedback-form-footer"><small>{message.length}/3000 caracteres · mínimo de 10</small><Button type="submit" disabled={!ready || message.trim().length < 10}><Save size={16} />Salvar feedback</Button></div>
    </form>
    {storageError && <div className="feedback-error" role="alert"><p>{storageError}</p><Button type="button" variant="outline" size="sm" onClick={load}><RefreshCw size={15} />Recarregar histórico</Button></div>}
    {notice && <p className="feedback-success" role="status">{notice}</p>}
    <div className="section-heading feedback-history-heading"><div><h3>Seus registros</h3><p>{entries.length} {entries.length === 1 ? 'feedback salvo' : 'feedbacks salvos'} neste dispositivo</p></div><Button variant="outline" size="sm" disabled={!entries.length} onClick={() => download(entries)}><Download size={15} />Baixar</Button></div>
    {!entries.length && ready && <p className="feedback-empty">Seu primeiro registro pode começar com uma ideia simples.</p>}
    <div className="feedback-history">{entries.map(entry => <article key={entry.id}><div className="feedback-entry-heading"><span>{categories[entry.category]}</span><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString('pt-BR')}</time><Button variant="ghost" size="icon" aria-label="Excluir feedback" onClick={() => { if (confirm('Excluir este feedback do navegador?')) persist(entries.filter(item => item.id !== entry.id)); }}><Trash2 size={15} /></Button></div><p>{entry.message}</p><small><Star size={13} />Experiência: {entry.rating}/5</small></article>)}</div>
  </section>;
}
