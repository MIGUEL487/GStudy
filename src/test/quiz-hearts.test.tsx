import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QuizLesson } from "@/components/quiz-lesson";
import { HeartsProvider } from "@/components/hearts-provider";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  award: vi.fn(),
  complete: vi.fn(),
  generated: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/learn-client", () => ({ awardXp: mocks.award }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/learning-provider", () => ({
  useLessonContext: () => ({
    ready: true,
    allowed: true,
    context: { subject: "Matemática", topic: "Contas" },
    complete: mocks.complete,
    backTo: "/aprender",
    backSearch: {},
  }),
}));
const questions = Array.from({ length: 4 }, (_, i) => ({
  question: `Conta ${i + 1}?`,
  options: [`Certa ${i + 1}`, `Errada ${i + 1}`],
  answer: 0,
  why: `Explicação ${i + 1}`,
}));
vi.mock("@/hooks/use-generated-activity", () => ({
  useGeneratedActivity: (...args: unknown[]) => {
    mocks.generated(...args);
    return { result: { mode: "quiz", quiz: { questions } }, error: "", reload: vi.fn() };
  },
}));
let remoteHearts = 3;
const seen = new Set<string>();
const open = () =>
  render(
    <HeartsProvider userId="learner-a">
      <QuizLesson search={{ p: "algebra", t: "sum" }} />
    </HeartsProvider>,
  );
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  remoteHearts = 3;
  seen.clear();
  mocks.complete.mockReturnValue(true);
  mocks.rpc.mockImplementation(async (name: string, args: { p_event_id?: string }) => {
    if (name === "lose_learning_heart" && !seen.has(args.p_event_id!)) {
      seen.add(args.p_event_id!);
      remoteHearts = Math.max(0, remoteHearts - 1);
    }
    return {
      data: {
        hearts: remoteHearts,
        max: 3,
        regen_minutes: 120,
        server_now: new Date().toISOString(),
        next_at: remoteHearts < 3 ? new Date(Date.now() + 7200000).toISOString() : null,
      },
      error: null,
    };
  });
});
describe("Retomada de quiz com corações", () => {
  it("termina a explicação ao zerar, preserva erros e retoma a quarta questão após recuperar", async () => {
    const view = open();
    for (let i = 1; i <= 3; i++) {
      fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Errada ${i}`) }));
      fireEvent.click(screen.getByRole("button", { name: "Conferir resposta" }));
      expect(screen.getByRole("status")).toHaveTextContent(`Explicação ${i}`);
      fireEvent.click(await screen.findByRole("button", { name: "Próxima pergunta" }));
    }
    await screen.findByRole("heading", { name: "Um intervalo para aprender" });
    expect(mocks.award).not.toHaveBeenCalled();
    expect(seen.size).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: "Revisar erros sem custo" }));
    expect(screen.getByRole("region", { name: "Revisão dos erros" })).toHaveTextContent(
      "Explicação 3",
    );
    view.unmount();
    open();
    await screen.findByRole("heading", { name: "Um intervalo para aprender" });
    remoteHearts = 1;
    fireEvent.click(screen.getByRole("button", { name: "Verificar corações" }));
    fireEvent.click(await screen.findByRole("button", { name: /Certa 4/ }));
    fireEvent.click(screen.getByRole("button", { name: "Conferir resposta" }));
    fireEvent.click(screen.getByRole("button", { name: "Concluir quiz" }));
    await screen.findByText("Cada tentativa ensina.");
    expect(mocks.award).toHaveBeenCalledExactlyOnceWith(15, "quiz", expect.any(String));
    expect(seen.size).toBe(3);
  });
  it("não desconta duas vezes ao reenviar uma resposta após perda de conexão", async () => {
    let rejectOnce = true;
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation(async (...args: unknown[]) => {
      const result = await original(...args);
      if (args[0] === "lose_learning_heart" && rejectOnce) {
        rejectOnce = false;
        throw new Error("Sem conexão");
      }
      return result;
    });
    const view = open();
    fireEvent.click(await screen.findByRole("button", { name: /Errada 1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Conferir resposta" }));
    await waitFor(() => expect(remoteHearts).toBe(2));
    await screen.findByText(/Falta sincronizar|Sem conexão/);
    view.unmount();
    open();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Próxima pergunta" })).toBeEnabled(),
    );
    expect(remoteHearts).toBe(2);
    expect(seen.size).toBe(1);
  });
});
