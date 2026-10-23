import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameMechanic } from "@/components/games/game-mechanic";
afterEach(cleanup);
describe("Mecânicas por toque e teclado", () => {
  it("classifica por toque e confere o conjunto completo", () => {
    const onAnswer = vi.fn();
    render(
      <GameMechanic
        type="drag-classify"
        seed="s"
        disabled={false}
        onAnswer={onAnswer}
        onMistake={vi.fn()}
        question={{
          id: "q",
          prompt: "Classifique",
          categories: ["Primo", "Composto"],
          items: [
            { label: "2", category: "Primo" },
            { label: "4", category: "Composto" },
          ],
        }}
      />,
    );
    expect(screen.getByRole("button", { name: "Conferir classificação" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "Primo" }));
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "Composto" }));
    fireEvent.click(screen.getByRole("button", { name: "Conferir classificação" }));
    expect(onAnswer).toHaveBeenCalledWith({ "2": "Primo", "4": "Composto" });
  });
  it("a forca responde a letras do teclado e não exige acentos", () => {
    const onAnswer = vi.fn();
    render(
      <GameMechanic
        type="word-hangman"
        seed="s"
        disabled={false}
        onAnswer={onAnswer}
        onMistake={vi.fn()}
        question={{ id: "q", prompt: "Palavra", correctAnswer: "ação" }}
      />,
    );
    for (const key of ["a", "c", "o"])
      fireEvent.keyDown(screen.getByRole("button", { name: "A" }), { key });
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith("ação");
    expect(screen.getByLabelText("Palavra")).toHaveTextContent("ação");
  });
  it("sequências usam controles de ordem e não alternativas de múltipla escolha", () => {
    const onAnswer = vi.fn();
    render(
      <GameMechanic
        type="sequence-order"
        seed="s"
        disabled={false}
        onAnswer={onAnswer}
        onMistake={vi.fn()}
        question={{ id: "q", prompt: "Sequência", sequence: ["Primeiro", "Segundo", "Terceiro"] }}
      />,
    );
    const before = screen
      .getAllByRole("listitem")
      .map((item) => item.querySelector("span")!.textContent);
    const first = before[0]!;
    fireEvent.click(screen.getByRole("button", { name: `Descer ${first}` }));
    const after = screen
      .getAllByRole("listitem")
      .map((item) => item.querySelector("span")!.textContent);
    expect(after[1]).toBe(first);
    fireEvent.click(screen.getByRole("button", { name: "Conferir sequência" }));
    expect(onAnswer).toHaveBeenCalledWith(after);
  });
});
