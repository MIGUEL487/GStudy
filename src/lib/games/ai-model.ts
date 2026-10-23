import { z } from "zod";
import type { GameDefinition, GameQuestion } from "./types";
const text = z.string().trim().min(1).max(500);
export const generatedGameType = z.enum([
  "multiple-choice",
  "time-survival",
  "memory-pairs",
  "sequence-order",
  "word-hangman",
  "typing-fast",
  "drag-classify",
]);
export const generatedQuestions = z
  .array(
    z.object({
      prompt: text,
      explanation: text.optional(),
      options: z.array(text).min(2).max(6).optional(),
      correctIndex: z.number().int().min(0).max(5).optional(),
      correctAnswer: z.string().trim().min(1).max(80).optional(),
      sequence: z.array(text).min(3).max(6).optional(),
      pairs: z
        .array(z.object({ left: text, right: text }))
        .min(3)
        .max(6)
        .optional(),
      categories: z.array(text).min(2).max(4).optional(),
      items: z
        .array(z.object({ label: text, category: text }))
        .min(3)
        .max(6)
        .optional(),
    }),
  )
  .min(3)
  .max(12);
export function validateGameQuestions(
  type: z.infer<typeof generatedGameType>,
  value: unknown,
): GameQuestion[] {
  const parsed = generatedQuestions.safeParse(value);
  if (!parsed.success) throw new Error("O jogo não veio completo. Tente criar novamente.");
  const questions = parsed.data;
  for (const question of questions) {
    if (
      (type === "multiple-choice" || type === "time-survival") &&
      (!question.options ||
        question.correctIndex === undefined ||
        !question.options[question.correctIndex] ||
        new Set(question.options).size !== question.options.length)
    )
      throw new Error("As alternativas do jogo não foram concluídas.");
    if (
      type === "memory-pairs" &&
      (!question.pairs ||
        new Set(question.pairs.flatMap((pair) => [pair.left, pair.right])).size !==
          question.pairs.length * 2)
    )
      throw new Error("Os pares do jogo precisam ser distintos.");
    if (
      type === "sequence-order" &&
      (!question.sequence || new Set(question.sequence).size !== question.sequence.length)
    )
      throw new Error("A sequência do jogo não foi concluída.");
    if ((type === "word-hangman" || type === "typing-fast") && !question.correctAnswer)
      throw new Error("Faltou a resposta do jogo.");
    if (type === "word-hangman" && !/^[\p{L} -]{4,32}$/u.test(question.correctAnswer!))
      throw new Error("A palavra do jogo não está em um formato válido.");
    if (
      type === "drag-classify" &&
      (!question.items ||
        !question.categories ||
        new Set(question.items.map((item) => item.label)).size !== question.items.length ||
        question.items.some((item) => !question.categories!.includes(item.category)))
    )
      throw new Error("As categorias do jogo não foram concluídas.");
  }
  return questions.map((question, i) => ({ ...question, id: `ai-${i}` }));
}
export function generatedDefinition(
  id: string,
  title: string,
  type: z.infer<typeof generatedGameType>,
  questions: GameQuestion[],
  subject: GameDefinition["subject"] = "outros",
): GameDefinition {
  const descriptions = {
    "multiple-choice": "Escolha uma alternativa por rodada. Acertos aumentam o combo.",
    "time-survival":
      "Responda antes de o tempo acabar. Acertos recuperam três segundos; erros tiram dois.",
    "memory-pairs": "Vire duas cartas por vez para encontrar os pares.",
    "sequence-order": "Organize os cartões na ordem pedida. Arraste ou use as setas.",
    "word-hangman": "Descubra a palavra usando as letras. Você pode errar até seis letras.",
    "typing-fast":
      "Digite a resposta antes de o tempo acabar. Acentos e maiúsculas não alteram o resultado.",
    "drag-classify": "Toque num item e depois na categoria, ou arraste para classificar.",
  };
  return {
    id,
    title,
    type,
    topic: title,
    subject,
    source: "ai",
    description: "Um jogo de estudo gerado para este tema.",
    rules: descriptions[type],
    iconName: "Sparkles",
    estimatedMinutes: 2,
    ...(type === "typing-fast" || type === "time-survival" ? { timeLimitSeconds: 60 } : {}),
    questions: { facil: questions, medio: questions, dificil: questions },
  };
}
