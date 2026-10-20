import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "./auth-gate";
import { signalAccountChange } from "@/lib/account-sync-model";
import type { PreparationLibrary } from "@/lib/preparation-library-model";
import { preparationMissionKey, type PreparationGuide } from "@/lib/preparation-model";
import {
  activities,
  activityOrder,
  activityUnlocked,
  completeActivity,
  learningKey,
  preparationActivities,
  readLearning,
  type ActivityMode,
  type LearningContext,
  type LearningPlan,
  type LearningSearch,
  type LearningWorkspace,
} from "@/lib/learning-model";

type LearningValue = {
  plans: LearningPlan[];
  ready: boolean;
  savePlan: (plan: LearningPlan) => boolean;
  removePlan: (id: string) => boolean;
  complete: (planId: string, topicId: string, mode: ActivityMode) => boolean;
  setPreparationMission: (planId: string, index: number, done: boolean) => boolean;
  savePreparationGuide: (planId: string, guide: PreparationGuide) => boolean;
  savePreparationLibrary: (planId: string, library: PreparationLibrary) => boolean;
};
const Context = createContext<LearningValue | null>(null);
export function LearningProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const key = `${learningKey}:${user.id}`;
  const [workspace, setWorkspace] = useState<LearningWorkspace>({ version: 1, plans: [] });
  const [ready, setReady] = useState(false);
  const current = useRef(workspace);
  const readable = useRef(false);
  useEffect(() => {
    const load = () => {
      try {
        const next = readLearning(localStorage.getItem(key));
        current.current = next;
        setWorkspace(next);
        readable.current = true;
      } catch {
        readable.current = false;
        toast.error("Não foi possível ler suas trilhas. Os dados salvos serão preservados.");
      } finally {
        setReady(true);
      }
    };
    load();
    const sync = (e: StorageEvent) => {
      if (e.key === key) load();
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);
  const write = useCallback(
    (update: (value: LearningWorkspace) => LearningWorkspace) => {
      try {
        if (!readable.current)
          throw new Error("Recupere o armazenamento das trilhas antes de salvar novas alterações.");
        // Read the latest version so progress from another tab is preserved.
        const next = readLearning(JSON.stringify(update(readLearning(localStorage.getItem(key)))));
        localStorage.setItem(key, JSON.stringify(next));
        current.current = next;
        setWorkspace(next);
        signalAccountChange();
        return true;
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Não foi possível salvar sua trilha neste navegador.",
        );
        return false;
      }
    },
    [key],
  );
  const savePlan = useCallback(
    (plan: LearningPlan) =>
      write((value) => {
        if (value.plans.length >= 40 && !value.plans.some((p) => p.id === plan.id))
          throw new Error(
            "Você já tem 40 planos de estudo. Exclua um plano antigo para criar outro.",
          );
        return { ...value, plans: [plan, ...value.plans.filter((p) => p.id !== plan.id)] };
      }),
    [write],
  );
  const removePlan = useCallback(
    (id: string) => write((value) => ({ ...value, plans: value.plans.filter((p) => p.id !== id) })),
    [write],
  );
  const complete = useCallback(
    (planId: string, topicId: string, mode: ActivityMode) =>
      write((value) => {
        const plan = value.plans.find((p) => p.id === planId);
        if (!plan || !activityUnlocked(plan, topicId, mode))
          throw new Error("Conclua a etapa anterior antes de avançar nesta trilha.");
        return {
          ...value,
          plans: value.plans.map((p) => (p.id === planId ? completeActivity(p, topicId, mode) : p)),
        };
      }),
    [write],
  );
  const savePreparationGuide = useCallback(
    (planId: string, guide: PreparationGuide) =>
      write((value) => {
        const plan = value.plans.find((p) => p.id === planId);
        if (!plan?.preparation)
          throw new Error("Este objetivo não está mais disponível. Reabra seus planos.");
        if (plan.preparation.guide) return value;
        return {
          ...value,
          plans: value.plans.map((p) =>
            p.id === planId ? { ...p, preparation: { ...p.preparation!, guide } } : p,
          ),
        };
      }),
    [write],
  );
  const savePreparationLibrary = useCallback(
    (planId: string, library: PreparationLibrary) =>
      write((value) => {
        const plan = value.plans.find((p) => p.id === planId);
        if (!plan?.preparation?.guide)
          throw new Error("Este roteiro não está mais disponível. Reabra seus objetivos.");
        return {
          ...value,
          plans: value.plans.map((p) =>
            p.id === planId
              ? {
                  ...p,
                  preparation: { ...p.preparation!, guide: { ...p.preparation!.guide!, library } },
                }
              : p,
          ),
        };
      }),
    [write],
  );
  const setPreparationMission = useCallback(
    (planId: string, index: number, done: boolean) =>
      write((value) => {
        const plan = value.plans.find((p) => p.id === planId);
        if (!plan?.preparation?.guide?.missions[index] || !Number.isInteger(index))
          throw new Error("Esta sessão não está mais disponível. Reabra seu plano.");
        const completed = { ...plan.completed };
        const missionKey = preparationMissionKey(index);
        if (done) completed[missionKey] ??= new Date().toISOString();
        else delete completed[missionKey];
        return {
          ...value,
          plans: value.plans.map((p) => (p.id === planId ? { ...p, completed } : p)),
        };
      }),
    [write],
  );
  return (
    <Context.Provider
      value={{
        plans: workspace.plans,
        ready,
        savePlan,
        removePlan,
        complete,
        setPreparationMission,
        savePreparationGuide,
        savePreparationLibrary,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useLearning() {
  const value = useContext(Context);
  if (!value) throw new Error("LearningProvider missing");
  return value;
}
export function useLessonContext(search: LearningSearch) {
  const learning = useLearning();
  const path = useLocation({ select: (l) => l.pathname });
  const plan = learning.plans.find((p) => p.id === search.p);
  const topic = plan?.topics.find((t) => t.id === search.t);
  const preparationRoute = path.startsWith("/preparar/");
  const mode = activityOrder.find(
    (m) =>
      activities[m].to === path ||
      ((m === "quiz" || m === "flashcards") && preparationActivities[m].to === path),
  );
  const allowed =
    (!plan && !preparationRoute) ||
    Boolean(
      plan &&
      (!preparationRoute || plan.preparation) &&
      topic &&
      mode &&
      activityUnlocked(plan, topic.id, mode),
    );
  const context: LearningContext | undefined =
    plan && topic && allowed
      ? {
          subject: plan.subject,
          topic: topic.title,
          goal: topic.goal,
          notes: plan.notes,
          challenge: topic.challenge,
        }
      : undefined;
  const backSearch: LearningSearch = plan ? { p: plan.id, ...(topic ? { t: topic.id } : {}) } : {};
  const complete = useCallback(
    (activity: ActivityMode) =>
      plan && topic ? learning.complete(plan.id, topic.id, activity) : false,
    [plan, topic, learning.complete],
  );
  const index = mode ? activityOrder.indexOf(mode) : -1;
  const nextMode = activityOrder[index + 1];
  const nextTopic = plan?.topics[(plan?.topics.findIndex((t) => t.id === topic?.id) ?? -1) + 1];
  const next =
    plan && topic && mode
      ? nextMode
        ? { to: activities[nextMode].to, search: { ...search, p: plan.id, t: topic.id } }
        : nextTopic
          ? { to: activities.explain.to, search: { ...search, p: plan.id, t: nextTopic.id } }
          : { to: "/aprender" as const, search: backSearch }
      : undefined;
  const preparationNext =
    plan?.preparation && topic && mode === "flashcards"
      ? { to: preparationActivities.quiz.to, search: { ...search, p: plan.id, t: topic.id } }
      : undefined;
  return {
    context,
    plan,
    topic,
    complete,
    next: plan?.preparation ? preparationNext : next,
    backTo: plan?.preparation || preparationRoute ? ("/preparar" as const) : ("/aprender" as const),
    backSearch,
    allowed,
    ready: learning.ready,
  };
}
