import { learningRpc } from "@/lib/learning-rpc";
import { backendErrorMessage } from "@/lib/backend-errors";
import type { GameResult, GameHighScore } from "./types";
import { z } from "zod";
export const gameChallengeSchema = z.object({
  challenge: z.object({
    id: z.string().uuid(),
    sender_id: z.string().uuid(),
    recipient_id: z.string().uuid(),
    game_id: z.string(),
    seed: z.string().min(1).max(80),
    difficulty: z.enum(["facil", "medio", "dificil"]),
    expires_at: z.string(),
  }),
  results: z.array(
    z.object({ user_id: z.string().uuid(), display_name: z.string(), score: z.number() }),
  ),
});
export async function gamePersonalRecords(): Promise<Record<string, GameHighScore>> {
  const result = await learningRpc("get_game_records", {});
  if (result.error)
    throw new Error(backendErrorMessage(result.error, "Não foi possível carregar seus recordes."));
  const parsed = z
    .array(
      z.object({
        game_id: z.string(),
        difficulty: z.enum(["facil", "medio", "dificil"]),
        best_score: z.number().int().min(0),
        stars: z.number().int().min(1).max(3),
        updated_at: z.string(),
      }),
    )
    .safeParse(result.data ?? []);
  if (!parsed.success) throw new Error("Não foi possível confirmar seus recordes agora.");
  return Object.fromEntries(
    parsed.data.map((row) => [
      `${row.game_id}_${row.difficulty}`,
      {
        gameId: row.game_id,
        difficulty: row.difficulty,
        bestScore: row.best_score,
        stars: row.stars,
        updatedAt: row.updated_at,
      },
    ]),
  );
}
export async function readGameChallenge(id: string) {
  const result = await learningRpc("get_game_challenge", { p_id: id });
  if (result.error)
    throw new Error(backendErrorMessage(result.error, "Este desafio não está disponível."));
  const parsed = gameChallengeSchema.safeParse(result.data);
  if (!parsed.success) throw new Error("Este desafio não está disponível agora.");
  return parsed.data;
}
export async function createGameChallenge(
  friendId: string,
  gameId: string,
  difficulty: string,
  seed: string,
) {
  const result = await learningRpc("create_game_challenge", {
    p_friend_id: friendId,
    p_game_id: gameId,
    p_difficulty: difficulty,
    p_seed: seed,
  });
  if (result.error)
    throw new Error(
      backendErrorMessage(
        result.error,
        "Não foi possível enviar o desafio agora. Confira se a amizade continua ativa e tente novamente em instantes.",
      ),
    );
  const parsed = z.object({ id: z.string().uuid() }).safeParse(result.data);
  if (!parsed.success)
    throw new Error(
      "O envio do desafio não foi confirmado. Confira suas notificações antes de repetir.",
    );
  return parsed.data;
}
export async function gameLeaderboard(gameId: string, difficulty: string, period: string) {
  const result = await learningRpc("get_game_leaderboard", {
    p_game_id: gameId,
    p_difficulty: difficulty,
    p_period: period,
  });
  if (result.error)
    throw new Error(
      backendErrorMessage(result.error, "Não foi possível carregar os recordes agora."),
    );
  const parsed = z
    .array(
      z.object({
        user_id: z.string().uuid(),
        display_name: z.string(),
        avatar_url: z.string().nullable(),
        score: z.number(),
        rank_position: z.coerce.number(),
      }),
    )
    .safeParse(result.data ?? []);
  if (!parsed.success) throw new Error("Não foi possível confirmar os recordes agora.");
  return parsed.data;
}
export async function submitGameResult(
  result: GameResult & { eventId: string; seed: string; total: number; challengeId?: string },
) {
  const { data, error } = await learningRpc("record_game_result", {
    p_event_id: result.eventId,
    p_game_id: result.gameId,
    p_difficulty: result.difficulty,
    p_seed: result.seed,
    p_score: result.score,
    p_hits: result.hits,
    p_mistakes: result.mistakes,
    p_total: result.total,
    p_max_combo: result.maxCombo,
    p_challenge_id: result.challengeId ?? null,
  });
  if (error || !data)
    throw new Error(
      backendErrorMessage(
        error,
        "Não foi possível registrar a partida. Seu resultado continua aqui.",
      ),
    );
  const value = data as { awarded?: unknown };
  if (
    typeof value.awarded !== "number" ||
    !Number.isSafeInteger(value.awarded) ||
    value.awarded < 0 ||
    value.awarded > 100
  )
    throw new Error("O registro da partida não foi confirmado. Tente novamente.");
  window.dispatchEvent(new Event("gstudy-reward-updated"));
  return { awarded: value.awarded };
}
