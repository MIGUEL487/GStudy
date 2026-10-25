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

export const quizRecordSchema = z
  .object({
    id: z.string().uuid(),
    activity: z.string(),
    updatedAt: z.number().finite(),
    progress: quizProgressSchema,
    copies: z.array(quizProgressSchema).default([]),
  })
  .refine((value) => value.id === value.progress.sessionId);
export const quizDocumentSchema = z.object({
  version: z.literal(1),
  sessions: z.array(quizRecordSchema),
});
export type QuizRecord = z.infer<typeof quizRecordSchema>;
export const quizDocumentKey = (user: string) => `gstudy.quizzes.v1:${user}`;
export function quizPosition(value: QuizProgress) {
  return value.index * 4 + Number(value.checked) * 2 + Number(value.done) * 400;
}
export function mergeQuizRecords(a: QuizRecord, b: QuizRecord): QuizRecord {
  const rank = quizPosition(a.progress) - quizPosition(b.progress);
  const winner =
    rank > 0 ||
    (rank === 0 &&
      (a.updatedAt > b.updatedAt ||
        (a.updatedAt === b.updatedAt && JSON.stringify(a.progress) >= JSON.stringify(b.progress))))
      ? a
      : b;
  const other = winner === a ? b : a;
  const values = [...a.copies, ...b.copies];
  if (
    JSON.stringify(a.progress) !== JSON.stringify(b.progress) &&
    (JSON.stringify(a.progress.questions) !== JSON.stringify(b.progress.questions) ||
      (JSON.stringify(a.progress.mistakes) !== JSON.stringify(b.progress.mistakes) &&
        !a.progress.mistakes.every((index) => b.progress.mistakes.includes(index)) &&
        !b.progress.mistakes.every((index) => a.progress.mistakes.includes(index))) ||
      (a.progress.index === b.progress.index &&
        a.progress.checked &&
        b.progress.checked &&
        a.progress.pick !== b.progress.pick))
  )
    values.push(other.progress);
  const unique = [
    ...new Map(values.map((value) => [JSON.stringify(value), value])).values(),
  ].filter((value) => JSON.stringify(value) !== JSON.stringify(winner.progress));
  return {
    ...winner,
    copies: unique.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
}
// Identical session/question pairs must charge a wrong answer only once across devices.
export function quizHeartEvent(sessionId: string, index: number) {
  const value = (BigInt("0x" + sessionId.replaceAll("-", "")) ^ BigInt(index + 1))
    .toString(16)
    .padStart(32, "0");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
