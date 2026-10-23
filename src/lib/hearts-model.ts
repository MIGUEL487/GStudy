import { z } from "zod";

// Defaults for layout only. The protected learning_rules row is authoritative at runtime.
export const HEARTS_MAX = 3;
export const HEARTS_REGEN_MINUTES = 120;
export const heartsStateSchema = z
  .object({
    hearts: z.number().int().min(0),
    max: z.number().int().min(1).max(10),
    regen_minutes: z.number().int().positive(),
    server_now: z.string().datetime({ offset: true }),
    next_at: z.string().datetime({ offset: true }).nullable(),
  })
  .refine((state) => state.hearts <= state.max);
export type HeartsState = z.infer<typeof heartsStateSchema>;

export function heartCountdown(nextAt: string | null | undefined, now: number): string {
  if (!nextAt) return "Corações completos";
  const minutes = Math.max(0, Math.ceil((Date.parse(nextAt) - now) / 60000));
  if (!minutes) return "Atualizando corações…";
  return `Próximo coração em ${minutes >= 60 ? `${Math.floor(minutes / 60)} h ` : ""}${minutes % 60} min`;
}
