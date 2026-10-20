import type { SupabaseClient } from "@supabase/supabase-js";

export const SERVER_AI_LIMITS = {
  quiz: 10,
  flashcards: 10,
  explain: 10,
  feynman: 20, // lousa
  socrates: 30,
  photo_import: 15,
  library: 25,
  material: 20,
} as const;

export type AiQuotaAction = keyof typeof SERVER_AI_LIMITS;

export const ACTION_LABELS: Record<AiQuotaAction, string> = {
  quiz: "Quiz",
  flashcards: "Flashcards",
  explain: "Explicações conceituais",
  feynman: "Lousa / Método Feynman",
  socrates: "Sócrates",
  photo_import: "Importação de fotos",
  library: "Pesquisa na biblioteca",
  material: "Criação de resumos por IA",
};

export class ServerAiQuotaExceededError extends Error {
  action: AiQuotaAction;
  limit: number;

  constructor(action: AiQuotaAction, limit: number) {
    const label = ACTION_LABELS[action] || action;
    super(
      `Limite diário de IA atingido para ${label}. Você já utilizou suas ${limit} tentativas gratuitas de hoje. Volte amanhã ou continue revisando seus materiais salvos!`,
    );
    this.name = "ServerAiQuotaExceededError";
    this.action = action;
    this.limit = limit;
  }
}

/**
 * Registra o consumo e verifica a cota de IA do usuário no servidor.
 * Se a cota for excedida, lança ServerAiQuotaExceededError com mensagem amigável em pt-BR.
 */
export async function enforceServerAiQuota(
  supabase: SupabaseClient,
  userId: string,
  action: AiQuotaAction,
  customLimit?: number,
): Promise<{ allowed: boolean; count: number; limit: number; remaining: number }> {
  const limit = customLimit ?? SERVER_AI_LIMITS[action];
  const today = new Date().toLocaleDateString("sv-SE");

  // Tenta chamar a RPC atômica se disponível
  try {
    const { data, error } = await supabase.rpc("check_and_consume_ai_quota", {
      p_action: action,
      p_max_limit: limit,
    });

    if (!error && data) {
      const res = data as { allowed: boolean; count: number; limit: number; remaining: number };
      if (!res.allowed) {
        throw new ServerAiQuotaExceededError(action, limit);
      }
      return res;
    }
  } catch (err) {
    if (err instanceof ServerAiQuotaExceededError) {
      throw err;
    }
    // Se a RPC não estiver cadastrada no banco ainda, faz fallback direto na tabela user_daily_ai_usage
  }

  try {
    const { data: existing, error: selectErr } = await supabase
      .from("user_daily_ai_usage")
      .select("count")
      .eq("user_id", userId)
      .eq("action", action)
      .eq("day", today)
      .maybeSingle();

    if (selectErr && (selectErr.code === "42P01" || selectErr.code === "PGRST204")) {
      // Tabela ainda não foi criada no SQL Editor; não bloqueia o estudante
      return { allowed: true, count: 1, limit, remaining: limit - 1 };
    }

    const currentCount = existing?.count ?? 0;
    if (currentCount >= limit) {
      throw new ServerAiQuotaExceededError(action, limit);
    }

    const newCount = currentCount + 1;
    await supabase.from("user_daily_ai_usage").upsert({
      user_id: userId,
      action,
      day: today,
      count: newCount,
      updated_at: new Date().toISOString(),
    });

    return { allowed: true, count: newCount, limit, remaining: limit - newCount };
  } catch (err) {
    if (err instanceof ServerAiQuotaExceededError) {
      throw err;
    }
    // Erro de rede ou RLS temporário: permite prosseguir para não travar o app
    return { allowed: true, count: 1, limit, remaining: limit - 1 };
  }
}
