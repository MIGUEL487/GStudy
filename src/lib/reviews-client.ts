import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { AccountDatabase } from "@/integrations/supabase/account-types";
const db = supabase as unknown as SupabaseClient<AccountDatabase>;
const review = z.object({
  id: z.string().uuid(),
  category: z.enum(["review", "suggestion"]),
  rating: z.number().int().min(1).max(5),
  body: z.string(),
  anonymous: z.boolean(),
  author: z.string(),
  isMine: z.boolean(),
  createdAt: z.string(),
  reply: z.string().nullable(),
  repliedAt: z.string().nullable(),
  up: z.number().int().nonnegative(),
  down: z.number().int().nonnegative(),
  myVote: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});
const board = z.object({ isAdmin: z.boolean(), items: z.array(review) });
export type Review = z.infer<typeof review>;
export type ReviewTab = "reviews" | "mine" | "suggestions";
export function reviewFailure(error: { code?: string; message?: string }) {
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code ?? ""))
    return new Error(
      "Ative a migração 0002_account_sync_reviews.sql no SQL Editor do Supabase para usar as avaliações.",
    );
  if (error.code === "42501" || error.code === "22023")
    return new Error(error.message || "Esta ação não está disponível para sua conta.");
  return new Error(
    "Não foi possível acessar as avaliações agora. Tente novamente; seu texto foi preservado.",
  );
}
export const reviewsApi = {
  async list(tab: ReviewTab, sort: "recent" | "helpful", offset = 0) {
    const { data, error } = await db.rpc("get_review_board", {
      p_tab: tab,
      p_sort: sort,
      p_offset: offset,
    });
    if (error) throw reviewFailure(error);
    const parsed = board.safeParse(data);
    if (!parsed.success)
      throw new Error("As avaliações vieram em um formato inesperado. Tente atualizar.");
    return {
      isAdmin: parsed.data.isAdmin,
      items: parsed.data.items.slice(0, 20),
      hasMore: parsed.data.items.length > 20,
    };
  },
  async create(input: {
    category: "review" | "suggestion";
    rating: number;
    message: string;
    anonymous: boolean;
  }) {
    const { data, error } = await db.rpc("create_app_review", {
      p_category: input.category,
      p_rating: input.rating,
      p_body: input.message,
      p_anonymous: input.anonymous,
    });
    if (error) throw reviewFailure(error);
    return data;
  },
  async vote(id: string, value: -1 | 0 | 1) {
    const { error } = await db.rpc("vote_app_review", { p_review_id: id, p_value: value });
    if (error) throw reviewFailure(error);
  },
  async reply(id: string, text: string) {
    const { error } = await db.rpc("reply_app_review", { p_review_id: id, p_reply: text });
    if (error) throw reviewFailure(error);
  },
  async remove(id: string) {
    const { error } = await db.rpc("delete_app_review", { p_review_id: id });
    if (error) throw reviewFailure(error);
  },
};
