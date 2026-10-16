import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useStudy } from './study-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { addSubject, defaultSchoolDays, emptySchedule, type Schedule } from '@/lib/study-model';

const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const NEW = '__new__';

export function ScheduleTable() {
  const { data, update } = useStudy();
  const sch = data.schedule ?? emptySchedule();
  const days = [...(data.schoolDays ?? defaultSchoolDays)].sort();
  const [pending, setPending] = useState<{ day: number; row: number } | null>(null);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState(false);

  const save = (fn: (s: Schedule) => Schedule) => update(d => ({ ...d, schedule: fn(d.schedule ?? emptySchedule()) }));
  const setCell = (day: number, row: number, id: string) => save(s => { const col = [...(s.cells[String(day)] ?? [])]; while (col.length < s.rows) col.push(''); col[row] = id; return { ...s, cells: { ...s.cells, [String(day)]: col } }; });
  const removeRow = (row: number) => save(s => ({ rows: Math.max(1, s.rows - 1), cells: Object.fromEntries(Object.entries(s.cells).map(([k, v]) => [k, v.filter((_, i) => i !== row)])) }));
  const close = () => { setPending(null); setName(''); setConfirm(false); };
  const create = () => {
    if (!pending) return;
    let id = '';
    const ok = update(d => { const r = addSubject(d, name); id = r.id; return r.data; });
    if (ok) { setCell(pending.day, pending.row, id); close(); }
  };

  return <div className="page-enter">
    <p className="page-subtitle">Monte seu horário: em cada dia, escolha a matéria de cada aula. Cada linha é uma aula.</p>
    <div className="schedule-scroll"><table className="schedule-table">
      <thead><tr><th>Aula</th>{days.map(d => <th key={d}>{names[d]}</th>)}<th /></tr></thead>
      <tbody>{Array.from({ length: sch.rows }, (_, row) => <tr key={row} className="schedule-row">
        <td className="schedule-n">{row + 1}ª</td>
        {days.map(day => { const v = sch.cells[String(day)]?.[row] ?? ''; return <td key={day}>
          <select aria-label={`${names[day]}, ${row + 1}ª aula`} className={`form-input schedule-select ${v ? 'filled' : ''}`} value={data.subjects.some(s => s.id === v) ? v : ''} onChange={e => { if (e.target.value === NEW) setPending({ day, row }); else setCell(day, row, e.target.value); }}>
            <option value="">—</option>
            {data.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value={NEW}>+ Adicionar matéria…</option>
          </select></td>; })}
        <td>{sch.rows > 1 && <Button variant="ghost" size="icon" aria-label={`Remover ${row + 1}ª aula`} onClick={() => removeRow(row)}><Trash2 /></Button>}</td>
      </tr>)}</tbody>
    </table></div>
    <Button variant="outline" className="mt-3" onClick={() => save(s => ({ ...s, rows: s.rows + 1 }))}><Plus />Adicionar aula</Button>
    <Dialog open={!!pending} onOpenChange={v => !v && close()}><DialogContent>
      <DialogHeader><DialogTitle className="font-serif text-3xl">{confirm ? 'Criar essa matéria?' : 'Nova matéria'}</DialogTitle>
        <DialogDescription>{confirm ? `“${name.trim()}” ainda não está nas suas matérias. Quer criar agora e colocar no horário?` : 'Escreva o nome da matéria, por exemplo História ou Ciências.'}</DialogDescription></DialogHeader>
      {confirm ? <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirm(false)}>Voltar</Button><Button onClick={create}>Sim, criar matéria</Button></div>
        : <form onSubmit={e => { e.preventDefault(); const n = name.trim(); if (!n) return; const found = data.subjects.find(s => s.name.toLowerCase() === n.toLowerCase()); if (found && pending) { setCell(pending.day, pending.row, found.id); close(); } else setConfirm(true); }}>
          <label className="form-label">Nome<input autoFocus maxLength={100} className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: História" /></label>
          <div className="mt-4 flex justify-end"><Button type="submit" disabled={!name.trim()}>Continuar</Button></div>
        </form>}
    </DialogContent></Dialog>
  </div>;
}
