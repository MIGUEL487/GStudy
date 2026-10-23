import { supabase } from "@/integrations/supabase/client";
import type { BackendError } from "./backend-errors";

/** Additive migrations must not require editing the generated Supabase client. */
export function learningRpc(
  name:
    | "get_learning_hearts"
    | "lose_learning_heart"
    | "get_learning_leaderboard"
    | "record_game_result"
    | "create_game_challenge"
    | "get_game_leaderboard"
    | "get_game_challenge"
    | "get_game_records",
  args: Record<string, unknown>,
) {
  return (
    supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => PromiseLike<{ data: unknown; error: BackendError }>;
    }
  ).rpc(name, args);
}
