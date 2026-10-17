import { z } from 'zod';
import { preparationMetadataSchema } from './preparation-model';
import type { Subject } from './study-model';

export const activityOrder = ['explain', 'flashcards', 'quiz', 'recall', 'feynman', 'review'] as const;
export type ActivityMode = typeof activityOrder[number];
export const activities = {
  explain: { title: 'Entenda', description: 'Conceitos e exemplos que fazem sentido', to: '/aprender/explicacoes' },
  flashcards: { title: 'Memorize', description: 'Conecte perguntas e respostas', to: '/aprender/flashcards' },
  quiz: { title: 'Pratique', description: 'Teste ideias e aprenda com as correções', to: '/aprender/quiz' },
  recall: { title: 'Active Recall', description: 'Estude por 5 minutos e recupere da memória', to: '/aprender/recall' },
  feynman: { title: 'Ensine', description: 'Explique aos alunos com a sua lousa', to: '/aprender/feynman' },
  review: { title: 'Conecte as ideias', description: 'Uma revisão visual para descobrir o porquê', to: '/aprender/revisao' },
} as const;
export const preparationActivities = { flashcards: { title: 'Flashcards', to: '/preparar/flashcards' }, quiz: { title: 'Questões', to: '/preparar/questoes' } } as const;
export type LearningContext = { subject: string; topic: string; goal?: string; notes?: string; challenge?: string };
export type LearningSearch = { m?: string | undefined; p?: string | undefined; t?: string | undefined };
export function learningSearch(s: Record<string, unknown>): LearningSearch {
  return Object.fromEntries(['m', 'p', 't'].filter(k => typeof s[k] === 'string' && (s[k] as string).length <= 800).map(k => [k, s[k]]));
}
const topicSchema = z.object({ id: z.string().min(1).max(100), title: z.string().min(1).max(200), goal: z.string().max(1000), challenge: z.string().max(1000) });
const planSchema = z.object({
  id: z.string().min(1).max(100), subjectId: z.string().min(1).max(100), subject: z.string().min(1).max(120), topic: z.string().min(1).max(200), overview: z.string().max(3000),
  materialIds: z.array(z.string().uuid()).max(20), notes: z.string().max(40000), topics: z.array(topicSchema).min(1).max(8).refine(topics => new Set(topics.map(topic => topic.id)).size === topics.length),
  preparation: preparationMetadataSchema.optional(),
  completed: z.record(z.string(), z.string().datetime()), createdAt: z.string().datetime(),
});
const workspaceSchema = z.object({ version: z.literal(1), plans: z.array(planSchema).max(40).refine(plans => new Set(plans.map(plan => plan.id)).size === plans.length) });
export type LearningPlan = z.infer<typeof planSchema>;
export type LearningTopic = LearningPlan['topics'][number];
export type LearningWorkspace = z.infer<typeof workspaceSchema>;
export const learningKey = 'gstudy.learning.v1';
export function readLearning(value: string | null): LearningWorkspace {
  return value ? workspaceSchema.parse(JSON.parse(value)) : { version: 1, plans: [] };
}
export function completionKey(topicId: string, mode: ActivityMode) { return `${topicId}:${mode}`; }
export function isCompleted(plan: LearningPlan, topicId: string, mode: ActivityMode) { return Boolean(plan.completed[completionKey(topicId, mode)]); }
export function completeActivity(plan: LearningPlan, topicId: string, mode: ActivityMode, now = new Date()): LearningPlan {
  if (!plan.topics.some(t => t.id === topicId)) throw new Error('Este tópico não existe mais. Volte à sua trilha.');
  const key = completionKey(topicId, mode);
  if (plan.completed[key]) return plan;
  return { ...plan, completed: { ...plan.completed, [key]: now.toISOString() } };
}
export function topicUnlocked(plan: LearningPlan, index: number) {
  if (index === 0) return true;
  const previous = plan.topics[index - 1];
  return Boolean(previous && activityOrder.every(mode => isCompleted(plan, previous.id, mode)));
}
export function activityUnlocked(plan: LearningPlan, topicId: string, mode: ActivityMode) {
  const index = plan.topics.findIndex(t => t.id === topicId);
  if (plan.preparation) return index >= 0 && (mode === 'quiz' || mode === 'flashcards');
  return index >= 0 && topicUnlocked(plan, index) && activityOrder.slice(0, activityOrder.indexOf(mode)).every(m => isCompleted(plan, topicId, m));
}
export function planProgress(plan: LearningPlan) {
  const done = plan.topics.reduce((n, topic) => n + activityOrder.filter(mode => isCompleted(plan, topic.id, mode)).length, 0);
  return { done, total: plan.topics.length * activityOrder.length };
}
export function notebookNotes(subject: Subject, ids: string[]) {
  const selected = subject.notebooks.filter(n => ids.includes(n.id));
  const text = selected.map(n => `## ${n.title}\n${n.text}`).join('\n\n');
  if (text.length > 40000) throw new Error('Selecione menos cadernos: o conteúdo escolhido ultrapassa 40 mil caracteres.');
  return text;
}
