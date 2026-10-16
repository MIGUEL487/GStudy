import { z } from "zod";
import { emptyPerformance, type StudyData, type Subject } from "./study-model";

// Keep the request below the hosting limit; the browser compresses camera photos first.
export const studyPhotoSchema = z
  .string()
  .max(3_000_000)
  .regex(
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/,
    "Escolha uma foto em JPG, PNG ou WebP.",
  );
const warnings = z.array(z.string().trim().min(1).max(500)).max(8);
export const notebookPhotoResult = z.object({ text: z.string().max(24000), warnings });
export type NotebookPhotoResult = z.infer<typeof notebookPhotoResult>;
export const reportPhotoResult = z.object({
  rows: z
    .array(
      z.object({
        subject: z.string().trim().min(1).max(120),
        period: z.number().int().min(1).max(4).nullable(),
        periodLabel: z.string().trim().max(100),
        score: z.number().finite().min(0).max(1000).nullable(),
        absences: z.number().int().min(0).max(1000).nullable(),
      }),
    )
    .max(80),
  warnings,
});
export type ReportPhotoResult = z.infer<typeof reportPhotoResult>;
export type ReportDraft = {
  subjectId: string;
  period: string;
  score: string;
  absences: string;
  selected: boolean;
  source: string;
  periodLabel: string;
};
const normalized = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]/g, "");
export function reportDrafts(result: ReportPhotoResult, subjects: Subject[]): ReportDraft[] {
  return result.rows.map((row) => {
    const matches = subjects.filter((s) => normalized(s.name) === normalized(row.subject));
    const subjectId = matches.length === 1 ? matches[0]!.id : "";
    return {
      subjectId,
      period: row.period === null ? "" : String(row.period),
      score: row.score === null ? "" : String(row.score),
      absences: row.absences === null ? "" : String(row.absences),
      selected: !!subjectId && row.period !== null && row.score !== null,
      source: row.subject,
      periodLabel: row.periodLabel,
    };
  });
}
const valueSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:[.,]\d+)?$/);
function numeric(value: string, field: string, whole = false) {
  const raw = valueSchema.safeParse(value);
  const number = raw.success ? Number(raw.data.replace(",", ".")) : NaN;
  if (
    !Number.isFinite(number) ||
    number < 0 ||
    number > 1000 ||
    (whole && !Number.isInteger(number))
  )
    throw new Error(`Confira ${field}: use um número ${whole ? "inteiro " : ""}entre 0 e 1000.`);
  return String(number);
}
export function applyReportDrafts(
  data: StudyData,
  drafts: ReportDraft[],
  options: { includeAbsences: boolean; overwrite: boolean },
) {
  const selected = drafts.filter((row) => row.selected);
  if (!selected.length) throw new Error("Selecione pelo menos um período para importar.");
  const performance = { ...data.performance },
    targets = new Set<string>();
  let changed = 0,
    kept = 0;
  for (const row of selected) {
    const subject = data.subjects.find((s) => s.id === row.subjectId);
    if (!subject) throw new Error(`Escolha uma matéria cadastrada para ${row.source}.`);
    if (!/^[1-4]$/.test(row.period))
      throw new Error(`Escolha o bimestre de ${row.source}; o período da foto não foi definido.`);
    const target = JSON.stringify([row.subjectId, row.period]);
    if (targets.has(target))
      throw new Error(
        `${subject.name}: há dois registros selecionados para o ${row.period}º bimestre. Desmarque um deles ou ajuste o período.`,
      );
    targets.add(target);
    const values: { score?: string; absences?: string } = {};
    if (row.score.trim()) values.score = numeric(row.score, "a nota");
    if (options.includeAbsences && row.absences.trim())
      values.absences = numeric(row.absences, "as faltas", true);
    if (!Object.keys(values).length)
      throw new Error(`${subject.name}: preencha a nota ou habilite a importação de faltas.`);
    const current = performance[row.subjectId] ?? emptyPerformance();
    const grades = Array.from({ length: Math.max(4, current.grades.length) }, (_, index) => ({
      ...(current.grades[index] ?? { score: "", absences: "", behavior: "", warnings: "" }),
    }));
    const grade = grades[Number(row.period) - 1]!;
    for (const key of ["score", "absences"] as const) {
      const value = values[key];
      if (value === undefined || grade[key] === value) continue;
      if (grade[key] !== "" && !options.overwrite) {
        kept++;
        continue;
      }
      grade[key] = value;
      changed++;
    }
    performance[row.subjectId] = { ...current, grades };
  }
  return { data: { ...data, performance }, changed, kept };
}
export function appendTranscription(existing: string, transcription: string) {
  const text = transcription.trim();
  if (!text) throw new Error("Revise a transcrição: o texto está vazio.");
  return existing.trimEnd() ? `${existing.trimEnd()}\n\n${text}` : text;
}
