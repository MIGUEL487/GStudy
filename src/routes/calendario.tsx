import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStudy } from '@/components/study-provider';
import { Button } from '@/components/ui/button';
import { dayBudget, defaultSchoolDays } from '@/lib/study-model';

export const Route = createFileRoute('/calendario')({ head: () => ({ meta: [{ title: 'GStudy · Calendário de presença' }, { name: 'description', content: 'Marque os dias em que foi ou faltou à aula e acompanhe sua frequência.' }, { property: 'og:title', content: 'GStudy · Calendário de presença' }, { property: 'og:description', content: 'Sua frequência, dia após dia.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] }), component: CalendarPage });

const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function CalendarPage() {
  const { data, update } = useStudy();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const days = data.schoolDays ?? defaultSchoolDays; const att = data.attendance ?? {};
  const cells: (Date | null)[] = Array(month.getDay()).fill(null);
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let i = 1; i <= count; i++) cells.push(new Date(month.getFullYear(), month.getMonth(), i));
  const absent = Object.values(att).filter(v => v === 'absent').length; const present = Object.values(att).filter(v => v === 'present').length;
  const b = dayBudget(absent); const today = iso(new Date());
  const toggle = (key: string) => update(d => { const a = { ...(d.attendance ?? {}) }; const cur = a[key]; if (!cur) a[key] = 'present'; else if (cur === 'present') a[key] = 'absent'; else delete a[key]; return { ...d, attendance: a }; });
  return <>
    <div className="eyebrow">UM DIA DE CADA VEZ</div>
    <div className="welcome-row"><div><h1>Calendário de presença</h1><p>Toque no dia: uma vez para “fui”, duas para “faltei”, três para limpar.</p></div></div>
    <div className={`absence-box ${b.over ? 'danger' : ''}`}>
      <div><small>Dias presentes</small><strong>{present}</strong></div>
      <div><small>Faltas</small><strong>{absent}</strong></div>
      <div><small>Limite no ano</small><strong>{b.limit}</strong></div>
      <div><small>Ainda pode faltar</small><strong>{b.remaining}</strong></div>
      <p>{b.over ? 'Atenção: você passou de 25% de faltas nos 200 dias letivos.' : 'Base: 200 dias letivos, frequência mínima de 75%.'}</p>
    </div>
    <div className="calendar">
      <div className="calendar-head"><Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></Button><h2>{month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2><Button variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></Button></div>
      <div className="calendar-grid" key={iso(month)}>
        {weekdays.map(w => <div className="calendar-weekday" key={w}>{w}</div>)}
        {cells.map((d, i) => { if (!d) return <div key={`e${i}`} />; const key = iso(d); const school = days.includes(d.getDay()); const st = att[key];
          return <button key={key} disabled={!school && !st} onClick={() => toggle(key)} aria-label={`${d.toLocaleDateString('pt-BR')}: ${st === 'present' ? 'presente' : st === 'absent' ? 'falta' : 'sem registro'}`} className={`calendar-day ${st ?? ''} ${key === today ? 'today' : ''} ${school ? '' : 'off'}`}><span>{d.getDate()}</span><small>{st === 'present' ? 'Fui' : st === 'absent' ? 'Faltei' : ''}</small></button>; })}
      </div>
    </div>
    <p className="page-subtitle mt-4">Os dias de aula podem ser ajustados em Configurações.</p>
  </>;
}
