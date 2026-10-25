import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { backendErrorMessage } from "./backend-errors";
import { isSocialFeatureEnabled } from "./social-model";
const inboxSchema = z.object({
  pending: z.number().int().nonnegative(),
  unread: z.record(z.string(), z.number().int().nonnegative()),
});
export async function getSocialInbox(): Promise<z.infer<typeof inboxSchema>> {
  if (!isSocialFeatureEnabled()) return { pending: 0, unread: {} };
  const { data, error } = await (supabase as unknown as SupabaseClient).rpc("get_social_inbox");
  if (error)
    throw new Error(backendErrorMessage(error, "Não foi possível atualizar pedidos e mensagens."));
  const parsed = inboxSchema.safeParse(data);
  if (!parsed.success)
    throw new Error("Não foi possível confirmar seus pedidos e mensagens agora.");
  return parsed.data;
}
export function subscribeSocialInbox(userId: string, refresh: () => void) {
  if (!isSocialFeatureEnabled()) return () => {};
  const channel = supabase.channel(`social:${userId}`, { config: { private: true } });
  for (const event of ["INSERT", "UPDATE"] as const) {
    for (const field of ["user_id", "friend_id"])
      channel.on(
        "postgres_changes",
        { event, schema: "public", table: "friendships", filter: `${field}=eq.${userId}` },
        refresh,
      );
    channel.on(
      "postgres_changes",
      { event, schema: "public", table: "direct_messages", filter: `recipient_id=eq.${userId}` },
      refresh,
    );
  }
  channel
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, refresh)
    .subscribe();
  window.addEventListener("gstudy-social-updated", refresh);
  window.addEventListener("focus", refresh);
  const timer = setInterval(() => {
    if (!document.hidden) refresh();
  }, 10000);
  return () => {
    clearInterval(timer);
    window.removeEventListener("gstudy-social-updated", refresh);
    window.removeEventListener("focus", refresh);
    void supabase.removeChannel(channel);
  };
}
export function signalSocialUpdate() {
  window.dispatchEvent(new Event("gstudy-social-updated"));
}
