import { describe, expect, it } from "vitest";
import {
  applyGameAnswer,
  checkGameAnswer,
  gameSequence,
  initialGameProgress,
} from "@/lib/games/engine";
import { GAMES_CATALOG, getGameById } from "@/lib/games/catalog";
import { validateGameQuestions } from "@/lib/games/ai-model";
describe("Motor dos jogos", () => {
  it("oferece os 16 jogos e mecânicas distintas em todos os níveis", () => {
    expect(GAMES_CATALOG).toHaveLength(16);
    const types = new Set(GAMES_CATALOG.map((game) => game.type));
    for (const type of [
      "multiple-choice",
      "time-survival",
      "memory-pairs",
      "sequence-order",
      "word-hangman",
      "map-click",
      "typing-fast",
      "drag-classify",
    ] as const)
      expect(types.has(type)).toBe(true);
    for (const game of GAMES_CATALOG)
      for (const difficulty of ["facil", "medio", "dificil"] as const)
        expect(gameSequence(game, difficulty, "test").length).toBeGreaterThanOrEqual(3);
  });
  it("uma semente reproduz perguntas e alternativas; outra muda a partida", () => {
    const game = getGameById("math-balanca")!;
    const first = gameSequence(game, "medio", "shared-seed");
    expect(gameSequence(game, "medio", "shared-seed")).toEqual(first);
    expect(gameSequence(game, "medio", "other-seed")).not.toEqual(first);
    expect(gameSequence(game, "dificil", "shared-seed")).not.toEqual(first);
    for (const question of first)
      expect(checkGameAnswer(question, question.correctIndex!)).toBe(true);
  });
  it("inclui a última resposta na pontuação, limita o combo e o reinicia ao errar", () => {
    const question = { id: "q", prompt: "2 + 2?", options: ["4", "5"], correctIndex: 0 };
    let state = initialGameProgress();
    for (let i = 0; i < 5; i++) state = applyGameAnswer(state, question, 0);
    expect(state).toMatchObject({ score: 1400, hits: 5, combo: 4, maxCombo: 4 });
    state = applyGameAnswer(state, question, 1);
    state = applyGameAnswer(state, question, 0);
    expect(state).toMatchObject({ score: 1500, hits: 6, mistakes: 1, combo: 2, maxCombo: 4 });
  });
  it("confere ordem, pares, categorias e texto sem confundir mecânicas", () => {
    expect(
      checkGameAnswer({ id: "q", prompt: "Ordene", sequence: ["A", "B", "C"] }, ["A", "C", "B"]),
    ).toBe(false);
    expect(
      checkGameAnswer({ id: "q", prompt: "Unidade", correctAnswer: "newton" }, "  NEWTON "),
    ).toBe(true);
    expect(
      checkGameAnswer(
        { id: "q", prompt: "Pares", pairs: [{ left: "water", right: "água" }] },
        { water: "água" },
      ),
    ).toBe(true);
    expect(
      checkGameAnswer(
        { id: "q", prompt: "Classifique", items: [{ label: "2", category: "Primo" }] },
        { "2": "Composto" },
      ),
    ).toBe(false);
  });
  it("rejeita conteúdo de IA com respostas incompletas e classes desconhecidas", () => {
    expect(() =>
      validateGameQuestions(
        "multiple-choice",
        Array(3).fill({ prompt: "Pergunta", options: ["A", "B"], correctIndex: 3 }),
      ),
    ).toThrow();
    expect(() =>
      validateGameQuestions(
        "drag-classify",
        Array(3).fill({
          prompt: "Classifique",
          categories: ["A", "B"],
          items: [
            { label: "a", category: "C" },
            { label: "b", category: "A" },
            { label: "c", category: "B" },
          ],
        }),
      ),
    ).toThrow();
  });
});
