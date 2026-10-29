import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/lib/games/rpc", () => ({ submitGameResult: mocks.save, readGameChallenge: vi.fn() }));
vi.mock("@/lib/games.functions", () => ({ explainGameMistake: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
import { GamePlayer } from "@/components/games/game-player";
import type { GameDefinition } from "@/lib/games/types";
const question = { id: "one", prompt: "Quanto vale 2 + 2?", options: ["4", "5"], correctIndex: 0 };
const game: GameDefinition = {
  id: "score-regression",
  title: "Desafio de uma rodada",
  subject: "matematica",
  type: "multiple-choice",
  description: "Um teste real do fim da partida",
  rules: "Escolha a resposta para concluir a rodada.",
  iconName: "Zap",
  estimatedMinutes: 1,
  questions: { facil: [question], medio: [question], dificil: [question] },
};
beforeEach(() => {
  vi.useFakeTimers();
  mocks.save.mockReset().mockResolvedValue({ awarded: 20 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("Finalização da partida", () => {
  it("celebra visualmente um acerto digitado sem adicionar instruções ao campo", () => {
    const typingGame: GameDefinition = {
      ...game,
      id: "typing-success",
      type: "time-survival",
      questions: {
        facil: [{ ...question, correctAnswer: "4" }],
        medio: [{ ...question, correctAnswer: "4" }],
        dificil: [{ ...question, correctAnswer: "4" }],
      },
    };
    render(<GamePlayer game={typingGame} onClose={vi.fn()} seed="same" />);
    fireEvent.click(screen.getByRole("button", { name: "Começar desafio" }));
    const input = screen.getByRole("textbox", { name: "Resposta" });
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.submit(input.closest("form")!);
    expect(document.querySelector(".game-question-stage.is-correct")).toBeInTheDocument();
    expect(document.querySelector(".game-correct-celebration")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Você acertou!");
  });
  it("salva a última resposta e concede XP com o mesmo identificador numa repetição de rede", async () => {
    mocks.save
      .mockRejectedValueOnce(new Error("Rede temporariamente indisponível"))
      .mockResolvedValue({ awarded: 20 });
    render(<GamePlayer game={game} onClose={vi.fn()} seed="same" />);
    fireEvent.click(screen.getByRole("button", { name: "Começar desafio" }));
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });
    expect(screen.getByText("100 pontos")).toBeInTheDocument();
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ score: 100, hits: 1, mistakes: 0, total: 1, seed: "same" }),
    );
    const firstId = mocks.save.mock.calls[0]![0].eventId;
    fireEvent.click(screen.getByRole("button", { name: "Tentar salvar partida" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.save.mock.calls[1]![0].eventId).toBe(firstId);
    expect(screen.getByText("XP registrado: +20")).toBeInTheDocument();
  });
  it("fecha sem uma finalização atrasada e reinicia sem pontos da partida anterior", async () => {
    const view = render(<GamePlayer game={game} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Começar desafio" }));
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mocks.save).not.toHaveBeenCalled();
    render(<GamePlayer game={game} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Começar desafio" }));
    expect(screen.getByText("0 pts")).toBeInTheDocument();
  });
});
