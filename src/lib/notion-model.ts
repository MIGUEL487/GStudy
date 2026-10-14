import type { StudyData, Subject } from './study-model';

export type NotionEvent = { date: string; title: string; sourceId: string; url: string; end?: string };
export type NotionStudyPage = { id: string; title: string; url: string; text: string; subject: string; events: NotionEvent[]; lastEdited: string; importedAt: string };
export type NotionCatalogItem = { id: string; title: string; kind: 'page' | 'data_source'; url: string; lastEdited: string; suggested: boolean };
export type RichText = { plain_text?: string; text?: { content?: string }; mention?: { date?: { start?: string } } };
export type NotionProperty = { type?: string; title?: RichText[]; rich_text?: RichText[]; select?: { name: string } | null; multi_select?: { name: string }[]; date?: { start: string; end?: string | null } | null; number?: number | null; checkbox?: boolean; url?: string | null; formula?: { type?: string; string?: string | null; date?: { start: string; end?: string | null } | null } };
export type NotionPage = { object: string; id: string; title?: RichText[]; url?: string; last_edited_time?: string; properties?: Record<string, NotionProperty>; parent?: { page_id?: string; data_source_id?: string; database_id?: string }; archived?: boolean; in_trash?: boolean };
export const normalizeStudyName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const richText = (items?: RichText[]) => (items ?? []).map(item => item.plain_text ?? item.text?.content ?? item.mention?.date?.start ?? '').join('');
export function notionTitle(page: NotionPage) { return (richText(page.title) || richText(Object.values(page.properties ?? {}).find(p => p.type === 'title')?.title) || 'Sem título').trim(); }
export function propertyText(p: NotionProperty): string {
  return richText(p.title) || richText(p.rich_text) || p.select?.name || p.multi_select?.map(s => s.name).join(', ') || p.date?.start || p.formula?.date?.start || p.formula?.string || p.url || (p.number != null ? String(p.number) : p.checkbox != null ? String(p.checkbox) : '');
}
export function isStudyRelated(title: string, subjects: string[] = []) {
  const normalized = normalizeStudyName(title);
  return /materia|disciplina|estudo|aula|anotac|caderno|cronograma|horario|prova|exame|trabalho|revisao|faculdade|escola|biologia|matematica|fisica|quimica|historia|geografia|portugues|literatura|filosofia|sociologia|ingles|programacao|subject|study|lecture|notes|schedule|homework/.test(normalized)
    || subjects.some(name => normalized.includes(normalizeStudyName(name)));
}
export function subjectOf(page: NotionPage, subjects: string[], inherited = '') {
  for (const [name, value] of Object.entries(page.properties ?? {})) {
    if (/^(materia|disciplina|subject|course)$/i.test(normalizeStudyName(name))) {
      const text = propertyText(value).trim(); if (text) return text.slice(0, 100);
    }
  }
  const title = normalizeStudyName(notionTitle(page));
  return subjects.find(name => title.includes(normalizeStudyName(name))) || inherited.trim().slice(0, 100) || 'Notion';
}
function validDay(value: string) {
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(day + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null;
}
export function eventsOf(page: NotionPage, text: string): NotionEvent[] {
  const title = notionTitle(page), url = page.url || `https://www.notion.so/${page.id.replace(/-/g, '')}`;
  const events: NotionEvent[] = [];
  for (const [name, value] of Object.entries(page.properties ?? {})) {
    const range = value.date || value.formula?.date;
    const date = range && validDay(range.start);
    if (date) {
      const end = range?.end ? validDay(range.end) : null;
      events.push({ date, title: `${title} · ${name}`, sourceId: page.id, url, ...(end ? { end } : {}) });
    }
  }
  for (const line of text.split('\n')) {
    for (const match of line.matchAll(/\b(\d{4}-\d{2}-\d{2})\b|\b(\d{2})\/(\d{2})\/(\d{4})\b/g)) {
      const date = validDay(match[1] || `${match[4]}-${match[3]}-${match[2]}`);
      if (date && !events.some(e => e.date === date)) events.push({ date, title: line.trim().slice(0, 180) || title, sourceId: page.id, url });
    }
  }
  if (events.length > 200) throw new Error('A página contém mais de 200 datas. Divida o cronograma em páginas menores; nenhuma importação parcial foi salva.');
  return events;
}

/** Re-import updates its own notebook. Local edits become a separate preserved copy. */
export function mergeNotionPages(data: StudyData, pages: NotionStudyPage[], userId: string): StudyData {
  const subjects: Subject[] = data.subjects.map(subject => ({ ...subject, notebooks: [...subject.notebooks], courses: [...subject.courses] }));
  const imported = { ...(data.notionImports ?? {}) };
  for (const page of pages) {
    const ownerKey = `${userId}:${page.id}`;
    const notebookId = `notion:${ownerKey}`;
    const previous = imported[ownerKey];
    let oldSubject = subjects.find(s => s.notebooks.some(n => n.id === notebookId));
    const oldNotebook = oldSubject?.notebooks.find(n => n.id === notebookId);
    if (oldNotebook && previous && (oldNotebook.text !== previous.text || oldNotebook.title !== previous.title)) {
      oldSubject!.notebooks = oldSubject!.notebooks.map(n => n.id === notebookId ? { ...n, id: crypto.randomUUID(), title: `${n.title} (edição local preservada)` } : n);
      oldSubject = undefined;
    }
    let target = subjects.find(s => normalizeStudyName(s.name) === normalizeStudyName(page.subject));
    if (!target) { target = { id: crypto.randomUUID(), name: page.subject, emoji: '📘', notebooks: [], courses: [] }; subjects.push(target); }
    if (oldSubject && oldSubject !== target) oldSubject.notebooks = oldSubject.notebooks.filter(n => n.id !== notebookId);
    const notebook = { id: notebookId, title: page.title, text: page.text, updatedAt: page.importedAt };
    const index = target.notebooks.findIndex(n => n.id === notebookId);
    if (index >= 0) target.notebooks[index] = notebook; else target.notebooks.push(notebook);
    imported[ownerKey] = { title: page.title, text: page.text, subject: page.subject };
  }
  return { ...data, subjects, notionImports: imported };
}
