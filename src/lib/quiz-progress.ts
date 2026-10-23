import { z } from "zod";

export const quizProgressSchema = z
  .object({
    sessionId: z.string().uuid(),
    questions: z
      .array(
        z
          .object({
            question: z.string(),
            options: z.array(z.string()).min(2),
            answer: z.number().int().nonnegative(),
            why: z.string(),
          })
          .refine((q) => q.answer < q.options.length),
      )
      .min(1)
      .max(100),
    index: z.number().int().nonnegative(),
    pick: z.number().int().nonnegative().nullable(),
    checked: z.boolean(),
    right: z.number().int().nonnegative(),
    done: z.boolean(),
    mistakes: z.array(z.number().int().nonnegative()),
    pendingHeartId: z.string().uuid().nullable(),
  })
  .refine(
    (s) =>
      s.index < s.questions.length &&
      s.right <= s.questions.length &&
      s.mistakes.every((i) => i < s.questions.length),
  );
export type QuizProgress = z.infer<typeof quizProgressSchema>;
export function readQuizProgress(key: string) {
  try {
    const raw = localStorage.getItem(key);
    return { value: raw ? quizProgressSchema.parse(JSON.parse(raw)) : null, error: "" };
  } catch {
    return {
      value: null,
      error:
        "Não foi possível ler o quiz salvo. Seus dados foram preservados; confira o armazenamento deste navegador.",
    };
  }
}
export function writeQuizProgress(key: string, value: QuizProgress): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
