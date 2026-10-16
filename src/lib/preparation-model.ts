import { z } from "zod";
import { schoolYearSchema } from "./school-year";

export const preparationKinds = {
  prova: { title: "Prova da escola", description: "Uma avaliação com o conteúdo das suas aulas." },
  concurso: {
    title: "Concurso ou vestibular",
    description: "Prepare-se para um edital, cargo ou processo seletivo.",
  },
  olimpiada: { title: "Olimpíada", description: "Explore desafios e o raciocínio da competição." },
} as const;
export type PreparationKind = keyof typeof preparationKinds;
export const sourceUrl = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Fonte inválida.");
export const preparationResearchSchema = z.object({
  report: z.string().trim().min(20).max(16000),
  sources: z.array(z.object({ title: z.string().min(1).max(300), url: sourceUrl })).max(8),
  mode: z.enum(["web", "knowledge", "school"]),
  researchedAt: z.string().datetime(),
});
export const preparationDetailsSchema = z.object({
  kind: z.enum(["prova", "concurso", "olimpiada"]),
  exam: z.string().trim().min(2).max(140),
  edition: z.string().trim().max(160).default(""),
  schoolYear: schoolYearSchema,
  subject: z.string().trim().min(1).max(120),
  focus: z.string().trim().max(600).default(""),
});
export const preparationMetadataSchema = preparationDetailsSchema.omit({ subject: true }).extend({
  target: z.number().int().min(1).max(100),
  examDate: z.string().date().optional(),
  answers: z.string().trim().max(5000).default(""),
  research: preparationResearchSchema,
});
export type PreparationResearch = z.infer<typeof preparationResearchSchema>;
export type PreparationDetails = z.infer<typeof preparationDetailsSchema>;
export type PreparationMetadata = z.infer<typeof preparationMetadataSchema>;

/** Clockwise from 12 o'clock. Continuous deltas avoid 100% → 0% jumps at the seam. */
export function goalAngle(x: number, y: number) {
  return (((Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * 100;
}
export function dragGoal(current: number, previousAngle: number, nextAngle: number) {
  let delta = nextAngle - previousAngle;
  if (delta > 50) delta -= 100;
  if (delta < -50) delta += 100;
  return Math.max(0, Math.min(100, current + delta));
}
