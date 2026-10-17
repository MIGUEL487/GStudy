import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ path: "/preparar/questoes", generate: vi.fn(), award: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  useLocation: ({ select }: { select: (value: { pathname: string }) => unknown }) =>
    select({ pathname: mocks.path }),
  Link: ({ to, children, ...props }: { to: string; children: ReactNode; search?: unknown }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/components/auth-gate", () => ({
  useAuth: () => ({ user: { id: "practice-student" } }),
}));
vi.mock("@/lib/learn.functions", () => ({ generateActivity: mocks.generate }));
vi.mock("@/lib/learn-client", () => ({ awardXp: mocks.award, idsFrom: () => [] }));
import { LearningProvider, useLearning } from "@/components/learning-provider";
import { PreparationPractice } from "@/components/preparation-practice";
import { QuizLesson } from "@/components/quiz-lesson";
import { FlashcardsLesson } from "@/components/flashcards-lesson";
import { learningKey, readLearning, type LearningPlan } from "@/lib/learning-model";
import { attemptKey, readAttempts, reserveAttempt, settleAttempt } from "@/lib/daily-attempts";
import { preparationGuide } from "./helpers/preparation-fixture";
const user = "practice-student",
  key = `${learningKey}:${user}`;
const plan: LearningPlan = {
  id: "obgp",
  subjectId: "preparation:obgp",
  subject: "Programa completo",
  topic: "OBGP",
  overview: "Relações de poder.",
  materialIds: [],
  notes: "Poder e território.",
  createdAt: new Date().toISOString(),
  topics: [
    {
      id: "power",
      title: "Poder e território",
      goal: "Relacionar poder e espaço.",
      challenge: "Explique uma fronteira.",
    },
  ],
  completed: {},
  preparation: {
    kind: "olimpiada",
    exam: "OBGP",
    edition: "",
    schoolYear: "medio-2",
    focus: "",
    target: 85,
    answers: "",
    research: {
      report: "Confira o programa no regulamento da edição.",
      sources: [],
      mode: "knowledge",
      researchedAt: new Date().toISOString(),
    },
    guide: preparationGuide,
  },
};
const search = { p: "obgp", t: "power" };
function View({ mode }: { mode: "quiz" | "flashcards" | "practice" }) {
  const { ready, plans } = useLearning();
  return !ready ? null : mode === "quiz" ? (
    <QuizLesson search={search} />
  ) : mode === "flashcards" ? (
    <FlashcardsLesson search={search} />
  ) : (
    <PreparationPractice plan={plans[0]!} />
  );
}
const open = (mode: "quiz" | "flashcards" | "practice") =>
  render(
    <LearningProvider>
      <View mode={mode} />
    </LearningProvider>,
  );
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.path = "/preparar/questoes";
  mocks.award.mockResolvedValue(undefined);
  localStorage.setItem(key, JSON.stringify({ version: 1, plans: [plan] }));
  mocks.generate.mockImplementation(async ({ data }) =>
    data.mode === "quiz"
      ? {
          mode: "quiz",
          quiz: {
            questions: [
              {
                question: "O que é território?",
                options: ["Relações de poder", "Só paisagem"],
                answer: 0,
                why: "Poder e apropriação definem território.",
              },
            ],
          },
        }
      : {
          mode: "flashcards",
          cards: {
            cards: [
              {
                front: "Qual a relação entre território e poder?",
                back: "O território envolve apropriação e poder.",
              },
            ],
          },
        },
  );
});
afterEach(cleanup);
describe("Prática da preparação com limite compartilhado", () => {
  it("consome a tentativa restante de Aprender, conclui no plano e bloqueia a terceira geração", async () => {
    settleAttempt(localStorage, user, reserveAttempt(localStorage, user, "quiz"), true);
    const view = open("quiz");
    await screen.findByText("O que é território?");
    expect(mocks.generate.mock.calls[0]![0].data.context).toMatchObject({
      subject: "Programa completo",
      topic: "Poder e território",
      notes: plan.notes,
    });
    fireEvent.click(screen.getByRole("button", { name: /Relações de poder/ }));
    fireEvent.click(screen.getByRole("button", { name: "Conferir resposta" }));
    fireEvent.click(screen.getByRole("button", { name: "Concluir quiz" }));
    await screen.findByText("Cada tentativa ensina.");
    expect(screen.getByRole("link", { name: /Voltar ao plano/ })).toHaveAttribute(
      "href",
      "/preparar",
    );
    expect(readLearning(localStorage.getItem(key)).plans[0]!.completed["power:quiz"]).toBeDefined();
    expect(readAttempts(localStorage.getItem(attemptKey(user))).entries).toHaveLength(2);
    view.unmount();
    open("quiz");
    await screen.findByText(/Você já usou as 2 tentativas/);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
  it("não exige Entenda para revisar cartas e só oferece questões em seguida", async () => {
    mocks.path = "/preparar/flashcards";
    open("flashcards");
    fireEvent.click(await screen.findByRole("button", { name: /Qual a relação entre território/ }));
    fireEvent.click(screen.getByRole("button", { name: "Eu lembrei" }));
    await screen.findByText("Conexões na memória!");
    expect(screen.getByRole("link", { name: "Próxima atividade" })).toHaveAttribute(
      "href",
      "/preparar/questoes",
    );
    expect(
      readLearning(localStorage.getItem(key)).plans[0]!.completed["power:flashcards"],
    ).toBeDefined();
    expect(readAttempts(localStorage.getItem(attemptKey(user))).entries[0]).toMatchObject({
      mode: "flashcards",
      status: "used",
    });
  });
  it("mostra só as duas práticas e desabilita a atividade esgotada", async () => {
    reserveAttempt(localStorage, user, "quiz");
    reserveAttempt(localStorage, user, "quiz");
    open("practice");
    await screen.findByRole("heading", { name: "Poder e território" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Questões · limite de hoje/ })).toBeDisabled(),
    );
    expect(screen.getByRole("link", { name: /Flashcards/ })).toHaveAttribute(
      "href",
      "/preparar/flashcards",
    );
    expect(screen.queryByText("Active Recall")).not.toBeInTheDocument();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
