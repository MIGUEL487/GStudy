import { safeNotionUrl, useNotionImports } from '@/lib/notion-client';
export function NotionCalendar({ month }: { month: Date }) {
  const imported = useNotionImports();
  const prefix = `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`;
  const events = (imported.data ?? []).flatMap(page => page.events.map((event, index) => ({ ...event, subject: page.subject, key: `${page.id}:${index}` })))
    .filter(event => event.date <= `${prefix}-31` && (event.end || event.date) >= `${prefix}-01`).sort((a,b) => a.date.localeCompare(b.date));
  if (!imported.data?.length) return null;
  return <section className="settings-section"><h2>Cronograma do Notion</h2>
    <p>Datas identificadas nas páginas importadas. Atualize a importação nas configurações quando mudar seu Notion.</p>
    {imported.error && <p className="form-error">Não foi possível atualizar o cronograma. Tente novamente nas configurações.</p>}
    {imported.isFetching && <p role="status">Atualizando cronograma…</p>}
    {!events.length ? <p>Nenhuma data importada neste mês. Anotações sem data continuam nos cadernos.</p> : <ul className="flex flex-col gap-3 mt-3">{events.map(event => <li key={event.key}><strong>{event.date.split('-').reverse().join('/')}{event.end && event.end !== event.date ? ` a ${event.end.split('-').reverse().join('/')}` : ''}</strong> · {event.subject}<br />{safeNotionUrl(event.url) ? <a href={safeNotionUrl(event.url)} target="_blank" rel="noopener noreferrer" className="underline">{event.title}</a> : event.title}</li>)}</ul>}
  </section>;
}
