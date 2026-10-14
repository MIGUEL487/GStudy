import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { useAuth, NotionMark } from './auth-gate';
import { useStudy } from './study-provider';
import { connectNotion, oauthError } from '@/lib/oauth-client';
import { disconnectNotion, importNotionPage, listNotionPages } from '@/lib/notion.functions';
import { safeNotionUrl, useNotionStatus } from '@/lib/notion-client';
import { mergeNotionPages, type NotionCatalogItem } from '@/lib/notion-model';

export function NotionPanel() {
  const { user } = useAuth(); const { data, update } = useStudy(); const status = useNotionStatus();
  const [items, setItems] = useState<NotionCatalogItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [source, setSource] = useState<{ id: string; title: string }>();
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState('');
  const [filter, setFilter] = useState(''); const [subject, setSubject] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const subjects = data.subjects.map(s => s.name);
  const changed = () => window.dispatchEvent(new Event('gstudy-notion-changed'));
  async function browse(nextSource?: { id: string; title: string }, more = false) {
    setBusy(true); setMessages([]);
    try {
      const result = await listNotionPages({ data: { userId: user.id, subjects, ...(nextSource ? { sourceId: nextSource.id } : {}), ...(more && cursor ? { cursor } : {}) } });
      setSource(nextSource);
      setItems(old => more ? [...old, ...result.items.filter(item => !old.some(o => o.id === item.id))] : result.items);
      setSelected(old => new Set([...(more ? old : []), ...result.items.filter(i => i.kind === 'page' && i.suggested).map(i => i.id)]));
      setCursor(result.cursor || undefined); setHasMore(result.hasMore);
      if (!result.items.length && !more) setMessages(['Nenhuma página encontrada. Compartilhe suas páginas e tabelas com a conexão GStudy no Notion e atualize a lista.']);
    } catch (e) { setMessages([oauthError(e)]); }
    finally { setBusy(false); }
  }
  async function importSelected() {
    const chosen = items.filter(i => selected.has(i.id) && i.kind === 'page');
    if (!chosen.length) return;
    setBusy(true); setMessages([]); const notices = new Set<string>(); let count = 0;
    for (const [index, item] of chosen.entries()) {
      setProgress(`Importando ${index + 1} de ${chosen.length}: ${item.title}`);
      try {
        const result = await importNotionPage({ data: { userId: user.id, id: item.id, subjects, subject } });
        if (!update(d => mergeNotionPages(d, [result.page], user.id))) notices.add('O material foi salvo na conta, mas não coube neste navegador. Exporte seus dados antes de liberar espaço.');
        result.warnings.forEach(w => notices.add(w)); count++;
      } catch (e) { notices.add(`${item.title}: ${oauthError(e)}`); }
    }
    setMessages([...notices]); setProgress(''); setBusy(false); changed();
    if (count) toast.success(`${count} página(s) salva(s) na sua conta.`);
  }
  return <section className="settings-section"><h2>Seus estudos do Notion</h2>
    <p>Cada pessoa conecta seu próprio espaço e autoriza as páginas que deseja compartilhar. Anotações viram cadernos e materiais de estudo; datas explícitas aparecem no calendário.</p>
    {status.data?.connected && <p>Conectado: {status.data.workspace}{status.data.lastSynced ? ` · Última importação: ${new Date(status.data.lastSynced).toLocaleString('pt-BR')}` : ''}</p>}
    {status.error && <p className="form-error" role="alert">{oauthError(status.error)}</p>}
    <div className="flex flex-wrap gap-2 mt-3">
      <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await connectNotion(user.id, !!user.identities?.some(i => i.provider === 'notion')); } catch (e) { setMessages([oauthError(e)]); } finally { setBusy(false); } }}><NotionMark />{status.data?.connected ? 'Reautorizar Notion' : 'Conectar Notion'}</Button>
      {status.data?.connected && <><Button variant="outline" disabled={busy} onClick={() => void browse(undefined)}>Ver páginas autorizadas</Button><Button variant="ghost" disabled={busy} onClick={async () => { setBusy(true); try { await disconnectNotion({ data: { userId: user.id } }); setItems([]); setSelected(new Set()); changed(); toast.success('Conexão removida. Os estudos já importados foram mantidos.'); } catch (e) { setMessages([oauthError(e)]); } finally { setBusy(false); } }}>Desconectar importação</Button></>}
    </div>
    {(!!items.length || hasMore) && <div className="mt-4">
      <p>{source ? `Tabela: ${source.title}` : 'Páginas compartilhadas'} · Sugestões de estudo vêm marcadas; revise antes de importar.</p>
      {source && <Button variant="ghost" disabled={busy} onClick={() => void browse(undefined, false)}>Voltar às páginas</Button>}
      <label className="form-label">Filtrar títulos<input className="form-input" value={filter} onChange={e => setFilter(e.target.value)} /></label>
      <label className="form-label">Matéria de destino (opcional)<input className="form-input" list="notion-subjects" maxLength={100} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Vazio: reconhecer pelo título e pelos campos" /></label>
      <datalist id="notion-subjects">{subjects.map(name => <option key={name} value={name} />)}</datalist>
      <p className="text-sm">Se não houver uma matéria correspondente, ela será criada. Tabelas precisam ser abertas para selecionar suas linhas.</p>
      <div className="flex flex-col gap-3 mt-3">{items.filter(i => i.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map(item => <div key={item.id} className="flex flex-wrap items-center gap-2">
        {item.kind === 'page' ? <label className="flex items-center gap-2"><input type="checkbox" disabled={busy} checked={selected.has(item.id)} onChange={() => setSelected(old => { const next = new Set(old); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} />{item.title}</label> : <Button variant="outline" disabled={busy} onClick={() => { setFilter(''); void browse({ id: item.id, title: item.title }); }}>Abrir tabela: {item.title}</Button>}
        {safeNotionUrl(item.url) && <a className="text-xs underline" href={safeNotionUrl(item.url)} target="_blank" rel="noopener noreferrer">Ver no Notion</a>}
      </div>)}</div>
      <div className="flex flex-wrap gap-2 mt-4">{hasMore && <Button variant="outline" disabled={busy} onClick={() => void browse(source, true)}>Carregar mais</Button>}<Button disabled={busy || !selected.size} onClick={() => void importSelected()}>Importar {selected.size} página(s)</Button></div>
      <p className="text-xs mt-3">Para atualizar, selecione e importe novamente. Edições locais dos cadernos são preservadas em uma cópia. Anexos não são interpretados; páginas sem data ficam como anotações.</p>
    </div>}
    {busy && <p role="status" className="mt-3">{progress || 'Conectando ao Notion…'}</p>}
    {!!messages.length && <ul className="text-sm mt-3" aria-live="polite">{messages.map(message => <li key={message}>{message}</li>)}</ul>}
  </section>;
}
