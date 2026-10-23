import { z } from "zod";

export const schoolYears = [
  ...Array.from({ length: 9 }, (_, i) => ({
    value: `fundamental-${i + 1}`,
    label: `${i + 1}º ano · Ensino fundamental`,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    value: `medio-${i + 1}`,
    label: `${i + 1}º ano · Ensino médio`,
  })),
  { value: "cursinho", label: "Concluí o EM / Cursinho" },
  { value: "superior", label: "Ensino superior" },
  { value: "concluido", label: "Já concluí a escola" },
  { value: "outro", label: "Outra etapa de estudo" },
];

export const onboardingSchoolYears = [
  { value: "fundamental-6", label: "6º ano · Fundamental" },
  { value: "fundamental-7", label: "7º ano · Fundamental" },
  { value: "fundamental-8", label: "8º ano · Fundamental" },
  { value: "fundamental-9", label: "9º ano · Fundamental" },
  { value: "medio-1", label: "1º ano · Ensino Médio" },
  { value: "medio-2", label: "2º ano · Ensino Médio" },
  { value: "medio-3", label: "3º ano · Ensino Médio" },
  { value: "cursinho", label: "Cursinho / Pré-vestibular" },
  { value: "superior", label: "Ensino Superior" },
];

export const schoolYearSchema = z
  .string()
  .refine(
    (value) => schoolYears.some((year) => year.value === value),
    "Escolha seu ano ou etapa de estudo.",
  );

export const schoolYearLabel = (value?: string) =>
  schoolYears.find((year) => year.value === value)?.label ?? "Ano não informado";

export function getNextSchoolYear(currentYear?: string): string | null {
  if (!currentYear) return null;
  const progression: Record<string, string> = {
    "fundamental-6": "fundamental-7",
    "fundamental-7": "fundamental-8",
    "fundamental-8": "fundamental-9",
    "fundamental-9": "medio-1",
    "medio-1": "medio-2",
    "medio-2": "medio-3",
    "medio-3": "cursinho",
  };
  return progression[currentYear] ?? null;
}

/** Academic years turn at São Paulo midnight; university is never inferred. */
export function schoolYearAt(current: string, selectedAt: string, now = new Date()): string {
  const selected = new Date(selectedAt);
  if (!Number.isFinite(selected.getTime())) return current;
  const year = (date: Date) =>
    Number(
      new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/Sao_Paulo" }).format(
        date,
      ),
    );
  const elapsed = Math.max(0, Math.min(20, year(now) - year(selected)));
  let result = current;
  for (let i = 0; i < elapsed; i++) result = getNextSchoolYear(result) ?? result;
  return result;
}
