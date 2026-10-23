import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { backendErrorMessage } from "./backend-errors";

// Request-side upper bounds. learning_rules is authoritative and can lower them.
export const SERVER_AI_LIMITS = {
  quiz: 100,
  flashcards: 100,
  explain: 100,
  feynman: 100,
  socrates: 100,
  game: 50,
  photo_import: 30,
  library: 50,
  material: 50,
} as const;
export type AiQuotaAction = keyof typeof SERVER_AI_LIMITS;
export const ACTION_LABELS: Record<AiQuotaAction, string> = {
  quiz: "Quiz",
  flashcards: "Flashcards",
  explain: "Explicações",
  feynman: "Lousa",
  socrates: "Sócrates",
  game: "Jogos",
  photo_import: "Importação de fotos",
  library: "Biblioteca",
  material: "Materiais",
};
export class ServerAiQuotaExceededError extends Error {
  action: AiQuotaAction;
  limit: number;
  constructor(action: AiQuotaAction, limit: number) {
    super(
      "Você fez muitas solicitações de IA. Continue revisando o que está salvo e tente gerar conteúdo mais tarde.",
    );
    this.name = "ServerAiQuotaExceededError";
    this.action = action;
    this.limit = limit;
  }
}
const quotaSchema = z.object({
  allowed: z.boolean(),
  count: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  remaining: z.number().int().nonnegative(),
});
export async function enforceServerAiQuota(
  supabase: SupabaseClient,
  _userId: string,
  action: AiQuotaAction,
  customLimit?: number,
) {
  let result;
  try {
    result = await supabase.rpc("check_and_consume_ai_quota", {
      p_action: action,
      p_max_limit: Math.min(customLimit ?? SERVER_AI_LIMITS[action], SERVER_AI_LIMITS[action]),
    });
  } catch {
    throw new Error(
      "Não foi possível verificar o acesso à IA. Seu conteúdo salvo continua disponível; tente novamente.",
    );
  }
  if (result.error)
    throw new Error(
      backendErrorMessage(
        result.error,
        "Não foi possível verificar o acesso à IA. Tente novamente.",
      ),
    );
  const parsed = quotaSchema.safeParse(result.data);
  if (!parsed.success)
    throw new Error("Não foi possível verificar o acesso à IA. Tente novamente.");
  if (!parsed.data.allowed) throw new ServerAiQuotaExceededError(action, parsed.data.limit);
  return parsed.data;
}
