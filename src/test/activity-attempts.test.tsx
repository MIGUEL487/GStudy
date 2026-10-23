import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  begin: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
}));
vi.mock("@/lib/learn.functions", () => ({ generateActivity: mocks.generate }));
vi.mock("@/lib/learn-client", () => ({
  idsFrom: (value?: string) => (value ? value.split(",") : []),
}));
vi.mock("@/hooks/use-daily-attempt", () => ({
  useDailyAttempt: () => ({
    begin: mocks.begin,
    succeed: mocks.succeed,
    fail: mocks.fail,
    remaining: 1,
  }),
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn:
    (fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
}));
import { useGeneratedActivity } from "@/hooks/use-generated-activity";
const quiz = {
  mode: "quiz",
  quiz: {
    questions: [{ question: "Pergunta?", options: ["A", "B"], answer: 0, why: "Explicação." }],
  },
};
const context = { subject: "Matemática", topic: "Frações" };
function deferred() {
  let resolve!: (value: typeof quiz) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<typeof quiz>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.clearAllMocks();
  let reservation = 0;
  mocks.begin.mockImplementation(() => `attempt-${++reservation}`);
});
afterEach(cleanup);

describe("Tentativas das atividades geradas", () => {
  it("mostra cada item completo antes do fim e só libera a prática após o evento final", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder();
    mocks.generate.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(value) {
            controller = value;
          },
        }),
      ),
    );
    const { result } = renderHook(() => useGeneratedActivity("quiz"));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    await act(async () => {
      controller.enqueue(
        encoder.encode(
          JSON.stringify({ type: "item", index: 0, value: quiz.quiz.questions[0] }) + "\n",
        ),
      );
    });
    expect(result.current.partialItems).toHaveLength(1);
    expect(result.current.result).toBeNull();
    expect(mocks.succeed).not.toHaveBeenCalled();
    await act(async () => {
      controller.enqueue(encoder.encode(JSON.stringify({ type: "done", value: quiz }) + "\n"));
      controller.close();
    });
    expect(result.current.result).toEqual(quiz);
    expect(mocks.succeed).toHaveBeenCalledOnce();
  });
  it("reserva uma vez no StrictMode e só consome depois de receber conteúdo válido", async () => {
    const request = deferred();
    mocks.generate.mockReturnValue(request.promise);
    const { result, rerender } = renderHook(
      () => useGeneratedActivity("quiz", undefined, { ...context }),
      { wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> },
    );
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    rerender();
    expect(mocks.begin).toHaveBeenCalledTimes(1);
    expect(mocks.succeed).not.toHaveBeenCalled();
    await act(async () => request.resolve(quiz));
    expect(result.current.result).toEqual(quiz);
    expect(mocks.succeed).toHaveBeenCalledExactlyOnceWith("attempt-1");
    expect(mocks.generate).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
      data: { mode: "quiz", ids: [], context, stream: true },
    });
  });

  it("não faz pedidos nem reserva tentativas enquanto o contexto não estiver pronto", async () => {
    mocks.generate.mockResolvedValue(quiz);
    const { result, rerender } = renderHook(
      ({ enabled }) => useGeneratedActivity("quiz", undefined, context, enabled),
      { initialProps: { enabled: false } },
    );
    await act(async () => {});
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.begin).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.result).toEqual(quiz));
    expect(mocks.begin).toHaveBeenCalledTimes(1);
  });

  it("libera o token certo de uma resposta antiga e mantém o resultado do novo contexto", async () => {
    const old = deferred(),
      current = deferred();
    mocks.generate.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const { result, rerender } = renderHook(
      ({ topic }) => useGeneratedActivity("quiz", undefined, { ...context, topic }),
      { initialProps: { topic: "Frações" } },
    );
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    rerender({ topic: "Potências" });
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
    await act(async () => old.reject(new Error("Falha antiga")));
    expect(mocks.fail).toHaveBeenCalledExactlyOnceWith("attempt-1");
    expect(result.current.error).toBe("");
    await act(async () => current.resolve(quiz));
    expect(mocks.succeed).toHaveBeenCalledExactlyOnceWith("attempt-2");
    expect(result.current.result).toEqual(quiz);
  });

  it("libera tentativas para uma resposta vazia e reserva de novo na repetição", async () => {
    mocks.generate
      .mockResolvedValueOnce({ mode: "quiz", quiz: { questions: [] } })
      .mockResolvedValueOnce(quiz);
    const { result } = renderHook(() => useGeneratedActivity("quiz"));
    await waitFor(() => expect(result.current.error).toMatch(/Não foi possível criar conteúdo/));
    expect(mocks.fail).toHaveBeenCalledExactlyOnceWith("attempt-1");
    expect(mocks.succeed).not.toHaveBeenCalled();
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.result).toEqual(quiz));
    expect(mocks.begin).toHaveBeenCalledTimes(2);
    expect(mocks.succeed).toHaveBeenCalledExactlyOnceWith("attempt-2");
  });

  it("informa o limite diário antes de chamar a IA", async () => {
    mocks.begin.mockImplementation(() => {
      throw new Error("As duas tentativas de hoje foram usadas.");
    });
    const { result } = renderHook(() => useGeneratedActivity("quiz"));
    await waitFor(() =>
      expect(result.current.error).toBe("As duas tentativas de hoje foram usadas."),
    );
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.fail).not.toHaveBeenCalled();
  });
});
