import { describe, expect, it } from "vitest";
import {
  activityOrder,
  activityUnlocked,
  completeActivity,
  notebookNotes,
  planProgress,
  readLearning,
  topicUnlocked,
  type LearningPlan,
} from "@/lib/learning-model";
import {
  attemptKey,
  readAttempts,
  remainingAttempts,
  reserveAttempt,
  settleAttempt,
} from "@/lib/daily-attempts";

const date = new Date("2026-10-16T12:00:00");
const plan = (): LearningPlan => ({
  id: "plan",
  subjectId: "math",
  subject: "Matemática",
  topic: "Matemática básica",
  overview: "Fundamentos",
  materialIds: [],
  notes: "",
  topics: ["axioms", "operations"].map((id) => ({
    id,
    title: id,
    goal: "Entender",
    challenge: "Explique por quê",
  })),
  completed: {},
  createdAt: date.toISOString(),
});
function memoryStore() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}

describe("Trilhas e fontes pessoais", () => {
  it("desbloqueia atividades e tópicos em ordem e mantém conclusão idempotente", () => {
    let current = plan();
    expect(activityUnlocked(current, "axioms", "explain")).toBe(true);
    expect(activityUnlocked(current, "axioms", "quiz")).toBe(false);
    expect(topicUnlocked(current, 1)).toBe(false);
    for (const mode of activityOrder) {
      expect(activityUnlocked(current, "axioms", mode)).toBe(true);
      current = completeActivity(current, "axioms", mode, date);
      expect(completeActivity(current, "axioms", mode)).toBe(current);
    }
    expect(topicUnlocked(current, 1)).toBe(true);
    expect(planProgress(current)).toEqual({ done: 6, total: 12 });
    expect(activityUnlocked(current, "operations", "flashcards")).toBe(false);
  });
  it("recupera progresso salvo e rejeita arquivos incompatíveis sem fabricar progresso", () => {
    const value = { version: 1, plans: [completeActivity(plan(), "axioms", "explain", date)] };
    expect(readLearning(JSON.stringify(value))).toEqual(value);
    expect(() => readLearning("{broken")).toThrow();
    expect(() => readLearning(JSON.stringify({ ...value, version: 2 }))).toThrow();
    expect(() => completeActivity(plan(), "missing", "quiz")).toThrow("tópico não existe");
  });
  it("inclui apenas cadernos selecionados, inclusive os importados do Notion", () => {
    const subject = {
      id: "math",
      name: "Matemática",
      courses: [],
      notebooks: [
        {
          id: "notion:user:page",
          title: "Áreas",
          text: "A área é medida em unidades quadradas.",
          updatedAt: date.toISOString(),
        },
        {
          id: "private",
          title: "Outra anotação",
          text: "Não selecionado.",
          updatedAt: date.toISOString(),
        },
      ],
    };
    expect(notebookNotes(subject, ["notion:user:page"])).toBe(
      "## Áreas\nA área é medida em unidades quadradas.",
    );
    expect(notebookNotes(subject, [])).toBe("");
    expect(() =>
      notebookNotes(
        { ...subject, notebooks: [{ ...subject.notebooks[0]!, text: "x".repeat(40001) }] },
        ["notion:user:page"],
      ),
    ).toThrow("40 mil");
  });
});

describe("Duas tentativas diárias por conta e atividade", () => {
  it("conta reservas imediatamente, mantém após recarregar e bloqueia a terceira", () => {
    const store = memoryStore();
    const first = reserveAttempt(store, "ana", "quiz", date);
    settleAttempt(store, "ana", first, true);
    reserveAttempt(store, "ana", "quiz", date);
    expect(remainingAttempts(store, "ana", "quiz", date)).toBe(0);
    expect(() => reserveAttempt(store, "ana", "quiz", date)).toThrow("2 tentativas");
    expect(readAttempts(store.getItem(attemptKey("ana"))).entries).toHaveLength(2);
  });
  it("devolve somente a reserva que falhou, sem remover a atividade já gerada", () => {
    const store = memoryStore();
    const first = reserveAttempt(store, "ana", "quiz", date);
    const second = reserveAttempt(store, "ana", "quiz", date);
    settleAttempt(store, "ana", first, true);
    settleAttempt(store, "ana", second, false);
    settleAttempt(store, "ana", first, false);
    expect(remainingAttempts(store, "ana", "quiz", date)).toBe(1);
    expect(readAttempts(store.getItem(attemptKey("ana"))).entries[0]?.status).toBe("used");
  });
  it("separa atividades e contas e reinicia no próximo dia local", () => {
    const store = memoryStore();
    reserveAttempt(store, "ana", "recall", date);
    reserveAttempt(store, "ana", "recall", date);
    expect(remainingAttempts(store, "ana", "feynman", date)).toBe(2);
    expect(remainingAttempts(store, "bia", "recall", date)).toBe(2);
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(remainingAttempts(store, "ana", "recall", tomorrow)).toBe(2);
    reserveAttempt(store, "ana", "recall", tomorrow);
    expect(remainingAttempts(store, "ana", "recall", tomorrow)).toBe(1);
  });
  it("preserva armazenamento corrompido e impede começar se não conseguir salvar", () => {
    const store = memoryStore();
    store.setItem(attemptKey("ana"), "{corrupt");
    expect(() => reserveAttempt(store, "ana", "quiz", date)).toThrow("dados foram preservados");
    expect(store.getItem(attemptKey("ana"))).toBe("{corrupt");
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(() => reserveAttempt(full, "ana", "quiz", date)).toThrow(
      "Não foi possível salvar sua tentativa",
    );
  });
});
