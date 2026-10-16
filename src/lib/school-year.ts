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
  { value: "superior", label: "Ensino superior" },
  { value: "concluido", label: "Já concluí a escola" },
  { value: "outro", label: "Outra etapa de estudo" },
];
export const schoolYearSchema = z
  .string()
  .refine(
    (value) => schoolYears.some((year) => year.value === value),
    "Escolha seu ano ou etapa de estudo.",
  );
export const schoolYearLabel = (value?: string) =>
  schoolYears.find((year) => year.value === value)?.label ?? "Ano não informado";
