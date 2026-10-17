import { schoolYearSchema } from './school-year';
import { normalizeAbsenceTotals, type AttendancePeriod } from './attendance-model';
export type Notebook = { id: string; title: string; text: string; updatedAt: string };
export type Course = { id: string; title: string; url: string };
export type Subject = { id: string; name: string; emoji?: string | undefined; notebooks: Notebook[]; courses: Course[] };
export type Grade = { score: string; absences: string; absenceCalendarCount?: number; absenceThrough?: string; absencePastCount?: number; behavior: string; warnings: string };
export type Performance = { max: string; min: string; limit: string; goal: string; perWeek?: string; grades: Grade[]; sessions: { date: string; minutes: number }[] };
export type StudyData = { version: 1; name: string; schoolYear?: string | undefined; avatar?: string | undefined; schoolDays?: number[]; attendanceYear?: number; attendancePeriods?: AttendancePeriod[]; attendance?: Record<string,'present'|'absent'>; schedule?: Schedule; subjects: Subject[]; performance: Record<string, Performance>; notionImports?: Record<string, { title: string; text: string; subject?: string }> };
export const storageKey = 'gstudy.workspace.v1';
export const uid = () => crypto.randomUUID();
export function initialData(): StudyData { return { version: 1, name: '', subjects: ['Matemática', 'Rotina', 'Física'].map((name,i) => ({id: `subject-${i}`,name, notebooks: [], courses: []})), performance: {} }; }
export function cleanName(value: string) { const name = value.trim(); if (!name) throw new Error('Preencha o nome para continuar.'); if (name.length > 100) throw new Error('Use um nome com até 100 caracteres.'); return name; }
export function courseUrl(value: string) { const raw = value.trim(); if (!raw) throw new Error('Preencha o link do curso.'); const normalized = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`; try { const url = new URL(normalized); if (!['https:','http:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) throw new Error(); return url.href; } catch { throw new Error('Digite um link válido, como https://site.com/curso.'); } }
export function addNotebook(data: StudyData, subjectId: string, title: string): StudyData { const name = cleanName(title); const subject = data.subjects.find(s=>s.id===subjectId); if (!subject) throw new Error('Matéria não encontrada. Volte ao início e tente novamente.'); const notebook: Notebook = { id: uid(),title: name,text:'',updatedAt:new Date().toISOString() }; return {...data,subjects:data.subjects.map(s=>s.id===subjectId ? {...s,notebooks:[...s.notebooks,notebook]} : s)}; }
export function addCourse(data: StudyData, subjectId: string, title: string, link: string): StudyData { const name = cleanName(title); const url = courseUrl(link); if (!data.subjects.some(s=>s.id===subjectId)) throw new Error('Matéria não encontrada.'); return {...data,subjects:data.subjects.map(s=>s.id===subjectId ? {...s,courses:[...s.courses,{id:uid(),title:name,url}]}:s)}; }
export function emptyPerformance(): Performance { return {max:'',min:'',limit:'',goal:'',grades:Array.from({length:4},()=>({score:'',absences:'',behavior:'',warnings:''})),sessions:[]}; }
export function loadData(storage: Pick<Storage,'getItem'>): StudyData {
 const saved = storage.getItem(storageKey);
 if (saved) { const parsed = JSON.parse(saved); if (parsed.version !== 1 || !Array.isArray(parsed.subjects) || parsed.subjects.some((s:Subject)=>!s.id || typeof s.name !== 'string' || !Array.isArray(s.notebooks) || !Array.isArray(s.courses))) throw new Error('Os dados salvos não puderam ser carregados.'); return normalizeAbsenceTotals({...parsed,schoolYear:schoolYearSchema.safeParse(parsed.schoolYear).success?parsed.schoolYear:undefined,performance:parsed.performance || {},schoolDays:Array.isArray(parsed.schoolDays)?parsed.schoolDays.filter((n:unknown)=>Number.isInteger(n)&&(n as number)>=0&&(n as number)<=6):defaultSchoolDays,attendance:parsed.attendance&&typeof parsed.attendance==='object'?parsed.attendance:{}}); }
 const legacy = storage.getItem('materias'); if (!legacy) return initialData();
 const names: unknown = JSON.parse(legacy); if (!Array.isArray(names)) throw new Error('As matérias antigas não puderam ser carregadas.');
 const notebooks = JSON.parse(storage.getItem('cadernos') || '{}'); const courses = JSON.parse(storage.getItem('cursos') || '{}'); const notes = JSON.parse(storage.getItem('notas') || '{}');
 const data = initialData(); data.subjects = names.filter((n):n is string=>typeof n==='string').map((name,i)=>({id:`subject-${i}`,name,notebooks:(Array.isArray(notebooks[name]) ? notebooks[name] : []).filter((c:{titulo:unknown})=>typeof c?.titulo==='string').map((c:{titulo:string;texto:string})=>({id:uid(),title:c.titulo,text:typeof c.texto==='string'?c.texto:'',updatedAt:new Date().toISOString()})),courses:(Array.isArray(courses[name])?courses[name]:[]).filter((c:{nome:unknown;link:unknown})=>typeof c?.nome==='string'&&typeof c.link==='string').flatMap((c:{nome:string;link:string})=>{try{return [{id:uid(),title:c.nome,url:courseUrl(c.link)}];}catch{return [];}})}));
 data.subjects.forEach(s=>{ const old=notes[s.name]; if(old) data.performance[s.id]={max:String(old.config?.maxNota || ''),min:String(old.config?.minBim || ''),limit:String(old.config?.limiteFaltas || ''),goal:String(old.config?.metaFaltas || ''),grades:(old.bimestres || []).map((g:{nota:string;faltas:string;comportamento:string;advertencias:string})=>({score:g.nota,absences:g.faltas,behavior:g.comportamento,warnings:g.advertencias})),sessions:(old.estudo || []).map((e:{data:string;minutos:number})=>({date:e.data,minutes:e.minutos}))}; }); return normalizeAbsenceTotals(data);
}

export const defaultSchoolDays = [1,2,3,4,5];
export const schoolYearDays = 200;
export const maxAbsenceRate = 0.25;
/** Aulas por semana × 4 semanas × 12 meses; reprova acima de 25% de faltas. */
export function absenceBudget(perWeek: number, absences: number) { const total = Math.max(0, Math.floor(perWeek)) * 4 * 12; const limit = Math.floor(total * maxAbsenceRate); return { total, limit, absences, remaining: Math.max(0, limit - absences), over: absences > limit, frequency: total ? Math.round((1 - absences / total) * 1000) / 10 : null }; }
export function dayBudget(absentDays: number) { return { total: schoolYearDays, limit: schoolYearDays * maxAbsenceRate, absences: absentDays, remaining: Math.max(0, schoolYearDays * maxAbsenceRate - absentDays), over: absentDays > schoolYearDays * maxAbsenceRate }; }
export const subjectEmojis = ['📘','📐','🧮','🧪','🔭','🌱','🧠','🎨','🎵','🌍','📜','💻','⚽','🗣️','✍️','🧬'];

/** Horário semanal: cells[dia da semana][linha] = id da matéria ('' = vago). */
export type Schedule = { rows: number; cells: Record<string, string[]> };
export const emptySchedule = (): Schedule => ({ rows: 1, cells: {} });
/** Aulas da matéria num dia da semana, segundo o horário. */
export function classesOn(schedule: Schedule | undefined, weekday: number, subjectId: string) { return (schedule?.cells[String(weekday)] ?? []).slice(0, schedule?.rows ?? 0).filter(id => id === subjectId).length; }
/** Faltas vindas do calendário: cada dia marcado como falta soma as aulas daquela matéria no dia. */
export function calendarAbsences(data: Pick<StudyData,'attendance'|'schedule'>, subjectId: string) { return Object.entries(data.attendance ?? {}).filter(([,v]) => v === 'absent').reduce((n,[date]) => { const [y,m,d] = date.split('-').map(Number); return n + classesOn(data.schedule, new Date(y!, m!-1, d!).getDay(), subjectId); }, 0); }
export function addSubject(data: StudyData, name: string): { data: StudyData; id: string } { const clean = cleanName(name); const id = uid(); return { id, data: { ...data, subjects: [...data.subjects, { id, name: clean, emoji: '📘', notebooks: [], courses: [] }] } }; }

/** Upper bound for a full school day; not an attendance allowance. */
export const maxClassesPerDay = 12;
export function maxWeeklyClasses(data: Pick<StudyData, "schoolDays">) {
  return new Set(data.schoolDays ?? defaultSchoolDays).size * maxClassesPerDay;
}
export function scheduledWeeklyClasses(
  data: Pick<StudyData, "schedule" | "schoolDays">,
  subjectId: string,
) {
  return [...new Set(data.schoolDays ?? defaultSchoolDays)].reduce(
    (total, day) => total + classesOn(data.schedule, day, subjectId),
    0,
  );
}
export function performanceWeeklyClasses(
  data: Pick<StudyData, "schedule" | "schoolDays" | "performance">,
  subjectId: string,
) {
  const manual = data.performance[subjectId]?.perWeek;
  return manual?.trim() && /^\d+$/.test(manual) && Number(manual) <= maxWeeklyClasses(data)
    ? Number(manual)
    : scheduledWeeklyClasses(data, subjectId);
}
export function maxPeriodAbsences(
  data: Pick<StudyData, "schedule" | "schoolDays" | "performance">,
  subjectId: string,
) {
  const weekly = performanceWeeklyClasses(data, subjectId);
  return (
    (Number.isInteger(weekly) && weekly > 0 && weekly <= maxWeeklyClasses(data)
      ? weekly
      : maxWeeklyClasses(data)) * 12
  );
}
export function validateCountInput(value: string, max: number, label: string) {
  if (value === "") return value;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max)
    throw new Error(`${label}: use um número inteiro entre 0 e ${max}.`);
  return String(Number(value));
}
export function validateAbsenceCount(value: string) {
  if (value === "") return value;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error("Faltas por bimestre: use um número inteiro não negativo.");
  return String(Number(value));
}
export function validatePerformanceCounts(
  data: Pick<StudyData, "schedule" | "schoolDays" | "performance">,
  subjectId: string,
  performance: Performance,
) {
  const previous = data.performance[subjectId];
  const weeklyChanged = performance.perWeek !== previous?.perWeek;
  if (weeklyChanged)
    validateCountInput(performance.perWeek ?? "", maxWeeklyClasses(data), "Aulas por semana");
  performance.grades.forEach((grade, index) => {
    if (weeklyChanged || grade.absences !== previous?.grades[index]?.absences)
      validateAbsenceCount(grade.absences);
  });
  return performance;
}
