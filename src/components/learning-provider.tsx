import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useAuth } from './auth-gate';
import { activities, activityOrder, activityUnlocked, completeActivity, learningKey, readLearning, type ActivityMode, type LearningContext, type LearningPlan, type LearningSearch, type LearningWorkspace } from '@/lib/learning-model';

type LearningValue = { plans: LearningPlan[]; ready: boolean; savePlan: (plan: LearningPlan) => boolean; removePlan: (id: string) => boolean; complete: (planId: string, topicId: string, mode: ActivityMode) => boolean };
const Context = createContext<LearningValue | null>(null);
export function LearningProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const key = `${learningKey}:${user.id}`;
  const [workspace, setWorkspace] = useState<LearningWorkspace>({ version: 1, plans: [] });
  const [ready, setReady] = useState(false);
  const current = useRef(workspace); const readable = useRef(false);
  useEffect(() => {
    const load = () => {
      try { const next = readLearning(localStorage.getItem(key)); current.current = next; setWorkspace(next); readable.current = true; }
      catch { readable.current = false; toast.error('Não foi possível ler suas trilhas. Os dados salvos serão preservados.'); }
      finally { setReady(true); }
    };
    load();
    const sync = (e: StorageEvent) => { if (e.key === key) load(); };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, [key]);
  const write = useCallback((update: (value: LearningWorkspace) => LearningWorkspace) => {
    try {
      if (!readable.current) throw new Error('Recupere o armazenamento das trilhas antes de salvar novas alterações.');
      // Read the latest version so progress from another tab is preserved.
      const next = readLearning(JSON.stringify(update(readLearning(localStorage.getItem(key)))));
      localStorage.setItem(key, JSON.stringify(next)); current.current = next; setWorkspace(next); return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível salvar sua trilha neste navegador.'); return false; }
  }, [key]);
  const savePlan = useCallback((plan: LearningPlan) => write(value => {
    if (value.plans.length >= 40 && !value.plans.some(p => p.id === plan.id)) throw new Error('Você já tem 40 trilhas. Exclua uma trilha antiga para criar outra.');
    return { ...value, plans: [plan, ...value.plans.filter(p => p.id !== plan.id)] };
  }), [write]);
  const removePlan = useCallback((id: string) => write(value => ({ ...value, plans: value.plans.filter(p => p.id !== id) })), [write]);
  const complete = useCallback((planId: string, topicId: string, mode: ActivityMode) => write(value => {
    const plan = value.plans.find(p => p.id === planId);
    if (!plan || !activityUnlocked(plan, topicId, mode)) throw new Error('Conclua a etapa anterior antes de avançar nesta trilha.');
    return { ...value, plans: value.plans.map(p => p.id === planId ? completeActivity(p, topicId, mode) : p) };
  }), [write]);
  return <Context.Provider value={{ plans: workspace.plans, ready, savePlan, removePlan, complete }}>{children}</Context.Provider>;
}
export function useLearning() { const value = useContext(Context); if (!value) throw new Error('LearningProvider missing'); return value; }
export function useLessonContext(search: LearningSearch) {
  const learning = useLearning();
  const path = useLocation({ select: l => l.pathname });
  const plan = learning.plans.find(p => p.id === search.p);
  const topic = plan?.topics.find(t => t.id === search.t);
  const mode = activityOrder.find(m => activities[m].to === path);
  const allowed = !plan || Boolean(topic && mode && activityUnlocked(plan, topic.id, mode));
  const context: LearningContext | undefined = plan && topic && allowed ? { subject: plan.subject, topic: topic.title, goal: topic.goal, notes: plan.notes, challenge: topic.challenge } : undefined;
  const backSearch: LearningSearch = plan ? { p: plan.id, ...(topic ? { t: topic.id } : {}) } : {};
  const complete = useCallback((activity: ActivityMode) => plan && topic ? learning.complete(plan.id, topic.id, activity) : false, [plan, topic, learning.complete]);
  const index = mode ? activityOrder.indexOf(mode) : -1;
  const nextMode = activityOrder[index + 1];
  const nextTopic = plan?.topics[(plan?.topics.findIndex(t => t.id === topic?.id) ?? -1) + 1];
  const next = plan && topic && mode ? nextMode
    ? { to: activities[nextMode].to, search: { ...search, p: plan.id, t: topic.id } }
    : nextTopic ? { to: activities.explain.to, search: { ...search, p: plan.id, t: nextTopic.id } } : { to: '/aprender' as const, search: backSearch }
    : undefined;
  return { context, plan, topic, complete, next, backSearch, allowed, ready: learning.ready };
}
