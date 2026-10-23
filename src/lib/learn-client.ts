import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type Material = {
  id: string;
  title: string;
  kind: string;
  source: string | null;
  memory: string;
  created_at: string;
};
export type Stats = { xp: number; streak: number; last_day: string | null };

export const levelOf = (xp: number) => ({ level: Math.floor(xp / 100) + 1, into: xp % 100 });

export function useMaterials() {
  const [items, setItems] = useState<Material[] | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("study_materials")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Não foi possível carregar seus materiais.");
    setItems((data as Material[]) ?? []);
  }, []);
  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("gstudy-notion-changed", refresh);
    return () => window.removeEventListener("gstudy-notion-changed", refresh);
  }, [load]);
  const remove = async (id: string) => {
    const { error } = await supabase.from("study_materials").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível apagar.");
      return;
    }
    setItems((i) => i?.filter((m) => m.id !== id) ?? null);
  };
  return { items, reload: load, remove };
}

export function useStats() {
  const [stats, setStats] = useState<Stats>({ xp: 0, streak: 0, last_day: null });
  useEffect(() => {
    const refresh = () =>
      void supabase
        .from("learner_stats")
        .select("xp, streak, last_day")
        .maybeSingle()
        .then(({ data }) => {
          if (data) setStats(data);
        });
    refresh();
    window.addEventListener("gstudy-reward-updated", refresh);
    return () => window.removeEventListener("gstudy-reward-updated", refresh);
  }, []);
  return stats;
}

/** Soma XP e mantém a ofensiva (dias seguidos estudando) de forma atômica no servidor. */
export async function awardXp(
  amount: number,
  action = "study",
  eventId: string = crypto.randomUUID(),
) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;

  try {
    const rpc = supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
    const { data, error } = await rpc("record_learning_reward", {
      p_amount: amount,
      p_action: action,
      p_event_id: eventId,
    });
    if (!error && data) {
      window.dispatchEvent(new Event("gstudy-reward-updated"));
      return data as { user_id: string; xp: number; streak: number; last_day: string };
    }
  } catch {
    // Never write counters directly or invent a successful award when RPC is absent.
  }

  toast.error("Não foi possível registrar seu XP. Seu progresso na atividade foi preservado.");
  return null;
}

export const idsFrom = (m?: string) =>
  m
    ? m
        .split(",")
        .filter((x) => /^[0-9a-f-]{36}$/.test(x))
        .slice(0, 20)
    : [];
