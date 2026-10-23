import type { GameDefinition, GameDifficulty, GameQuestion } from "./types";

export function seededRandom(seed: string) {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
export function normalizeAnswer(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
}
export type GameAnswer = number | string | string[] | Record<string, string>;
export function checkGameAnswer(question: GameQuestion, answer: GameAnswer): boolean {
  if (typeof answer === "number") return answer === question.correctIndex;
  if (typeof answer === "string")
    return (
      normalizeAnswer(answer) ===
      normalizeAnswer(
        String(
          question.targetKey ??
            question.correctAnswer ??
            question.options?.[question.correctIndex ?? -1] ??
            "",
        ),
      )
    );
  if (Array.isArray(answer))
    return Boolean(
      question.sequence &&
      answer.length === question.sequence.length &&
      answer.every((item, i) => item === question.sequence![i]),
    );
  if (question.pairs) return question.pairs.every((pair) => answer[pair.left] === pair.right);
  return Boolean(question.items?.every((item) => answer[item.label] === item.category));
}
export function gameSequence(
  game: GameDefinition,
  difficulty: GameDifficulty,
  seed: string,
): GameQuestion[] {
  const random = seededRandom(`${seed}:${game.id}:${difficulty}`);
  if (game.id === "math-primos") {
    const level = difficulty === "facil" ? 1 : difficulty === "medio" ? 2 : 3;
    return Array.from({ length: 6 }, (_, i) => {
      const values = shuffled(
        Array.from({ length: 20 * level }, (_, n) => n + 2),
        random,
      ).slice(0, 6);
      if (i % 2) {
        const total = [12, 18, 24, 36][Math.floor(random() * 4)]! * level;
        return {
          id: `factor-${i}`,
          prompt: `Quais números são fatores de ${total}?`,
          categories: ["É fator", "Não é fator"],
          items: values.map((value) => ({
            label: String(value),
            category: total % value === 0 ? "É fator" : "Não é fator",
          })),
        };
      }
      return {
        id: `prime-${i}`,
        prompt: "Separe números primos de compostos",
        categories: ["Primo", "Composto"],
        items: values.map((value) => ({
          label: String(value),
          category: Array.from({ length: Math.floor(Math.sqrt(value)) - 1 }, (_, n) => n + 2).some(
            (divisor) => value % divisor === 0,
          )
            ? "Composto"
            : "Primo",
        })),
      };
    });
  }
  if (game.id === "math-calc-mental" || game.id === "math-tabuada" || game.id === "math-balanca") {
    const level = difficulty === "facil" ? 1 : difficulty === "medio" ? 2 : 3;
    return Array.from({ length: 12 }, (_, i) => {
      const a = 2 + Math.floor(random() * 8 * level),
        b = 2 + Math.floor(random() * 8 * level);
      const equation = game.id !== "math-calc-mental";
      const fraction = game.id === "math-tabuada" && i % 3 === 0;
      const answer = fraction ? a : equation ? b : i % 2 ? a * b : a + b;
      const prompt = fraction
        ? `${a * b}/${b} = ?`
        : equation
          ? `${a}x + ${a} = ${a * b + a}. Quanto vale x?`
          : i % 2
            ? `${a} × ${b} = ?`
            : `${a} + ${b} = ?`;
      const options = shuffled(
        [answer, answer + 1, answer + 2, Math.max(0, answer - 1)].map(String),
        random,
      );
      return {
        id: `rule-${i}`,
        prompt,
        options,
        correctIndex: options.indexOf(String(answer)),
        correctAnswer: String(answer),
        explanation: fraction
          ? `Divida ${a * b} em ${b} partes: o resultado é ${a}.`
          : equation
            ? `Subtraia ${a} dos dois lados e divida por ${a}: x = ${b}.`
            : `${prompt.replace(" = ?", "")} = ${answer}.`,
      };
    });
  }
  return shuffled(game.questions[difficulty], random).map((question) => {
    if (!question.options || question.correctIndex === undefined) return { ...question };
    const order = shuffled(
      question.options.map((option, index) => ({ option, index })),
      random,
    );
    return {
      ...question,
      options: order.map(({ option }) => option),
      correctIndex: order.findIndex(({ index }) => index === question.correctIndex),
    };
  });
}
export type GameProgress = {
  score: number;
  hits: number;
  mistakes: number;
  combo: number;
  maxCombo: number;
  answers: { question: GameQuestion; answer: GameAnswer; correct: boolean }[];
};
export const initialGameProgress = (): GameProgress => ({
  score: 0,
  hits: 0,
  mistakes: 0,
  combo: 1,
  maxCombo: 1,
  answers: [],
});
export function applyGameAnswer(
  progress: GameProgress,
  question: GameQuestion,
  answer: GameAnswer,
): GameProgress {
  const correct = checkGameAnswer(question, answer);
  const combo = correct ? Math.min(4, progress.combo + 1) : 1;
  return {
    score: progress.score + (correct ? 100 * progress.combo : 0),
    hits: progress.hits + Number(correct),
    mistakes: progress.mistakes + Number(!correct),
    combo,
    maxCombo: Math.max(progress.maxCombo, combo),
    answers: [...progress.answers, { question, answer, correct }],
  };
}
