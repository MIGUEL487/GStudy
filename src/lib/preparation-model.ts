import { z } from "zod";
import { preparationLibrarySchema, amazonProduct } from "./preparation-library-model";
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
export const preparationGuideSchema = z.object({
  headline: z.string().trim().min(3).max(160),
  approach: z.string().trim().min(20).max(2200),
  rhythm: z.string().trim().min(10).max(1000),
  missions: z
    .array(
      z.object({
        title: z.string().trim().min(3).max(180),
        topicIndex: z.number().int().min(0).max(7),
        kind: z.enum(["watch", "read", "solve", "review"]),
        minutes: z.number().int().min(5).max(180),
        instructions: z.string().trim().min(10).max(1800),
        deliverable: z.string().trim().min(5).max(600),
      }),
    )
    .min(3)
    .max(12),
  library: preparationLibrarySchema.optional(),
  resources: z
    .array(
      z.object({
        kind: z.enum(["video", "book"]),
        title: z.string().trim().min(3).max(220),
        creator: z.string().trim().max(180),
        reason: z.string().trim().min(10).max(1000),
        topicIndex: z.number().int().min(0).max(7),
        sourceIndex: z.number().int().min(0).max(7).nullable(),
      }),
    )
    .min(2)
    .max(8)
    .refine(
      (resources) =>
        resources.some((r) => r.kind === "video") && resources.some((r) => r.kind === "book"),
    ),
});
export const preparationMetadataSchema = preparationDetailsSchema.omit({ subject: true }).extend({
  target: z.number().int().min(1).max(100),
  examDate: z.string().date().optional(),
  answers: z.string().trim().max(5000).default(""),
  research: preparationResearchSchema,
  dailyMinutes: z.number().int().min(15).max(180).optional(),
  guide: preparationGuideSchema.optional(),
});
export type PreparationResearch = z.infer<typeof preparationResearchSchema>;
export type PreparationDetails = z.infer<typeof preparationDetailsSchema>;
export type PreparationMetadata = z.infer<typeof preparationMetadataSchema>;
export type PreparationGuide = z.infer<typeof preparationGuideSchema>;
export const preparationSearch = (search: Record<string, unknown>): { p?: string | undefined } =>
  typeof search["p"] === "string" && search["p"].length <= 100 ? { p: search["p"] } : {};
export const preparationMissionKey = (index: number) => `preparation:mission:${index}`;
export function preparationProgress(plan: {
  preparation?: PreparationMetadata | undefined;
  completed: Record<string, string>;
}) {
  const missions = plan.preparation?.guide?.missions ?? [];
  return {
    done: missions.filter((_, index) => Boolean(plan.completed[preparationMissionKey(index)]))
      .length,
    total: missions.length,
  };
}

// Recommendations never supply arbitrary URLs. Direct links must come from grounding;
// otherwise the app constructs a clearly labelled search URL for the title/author.
export function preparationResourceLink(
  resource: PreparationGuide["resources"][number],
  sources: PreparationResearch["sources"],
) {
  const source = resource.sourceIndex === null ? undefined : sources[resource.sourceIndex];
  if (source && sourceUrl.safeParse(source.url).success) {
    const url = new URL(source.url);
    const host = url.hostname.toLowerCase();
    const video =
      resource.kind === "video" &&
      ((["www.youtube.com", "youtube.com", "m.youtube.com"].includes(host) &&
        url.pathname === "/watch" &&
        /^[\w-]{11}$/.test(url.searchParams.get("v") ?? "")) ||
        (host === "youtu.be" && /^\/[\w-]{11}$/.test(url.pathname)));
    const book = resource.kind === "book" ? amazonProduct(source.url) : null;
    if (video || book) return { url: book || source.url, direct: true };
  }
  const query = [resource.title, resource.creator].filter(Boolean).join(" ");
  return {
    url:
      resource.kind === "video"
        ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
        : `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}`,
    direct: false,
  };
}

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
