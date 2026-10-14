import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export type Material = { id: string; title: string; kind: string; source: string | null; memory: string; created_at: string };
export type Stats = { xp: number; streak: number; last_day: string | null };

export const levelOf = (xp: number) => ({ level: Math.floor(xp / 100) + 1, into: xp % 100 });
const today = () => new Date().toLocaleDateString('sv-SE');

export function useMaterials() {
  const [items, setItems] = useState<Material[] | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('study_materials').select('*').order('created_at', { ascending: false });
    if (error) toast.error('Não foi possível carregar seus materiais.');
    setItems((data as Material[]) ?? []);
  }, []);
  useEffect(() => { void load(); const refresh=()=>void load(); window.addEventListener('gstudy-notion-changed',refresh); return ()=>window.removeEventListener('gstudy-notion-changed',refresh); }, [load]);
  const remove = async (id: string) => { const { error } = await supabase.from('study_materials').delete().eq('id', id); if (error) { toast.error('Não foi possível apagar.'); return; } setItems(i => i?.filter(m => m.id !== id) ?? null); };
  return { items, reload: load, remove };
}

export function useStats() {
  const [stats, setStats] = useState<Stats>({ xp: 0, streak: 0, last_day: null });
  useEffect(() => { void supabase.from('learner_stats').select('xp, streak, last_day').maybeSingle().then(({ data }) => { if (data) setStats(data); }); }, []);
  return stats;
}

/** Soma XP e mantém a ofensiva (dias seguidos estudando). */
export async function awardXp(amount: number) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data: cur } = await supabase.from('learner_stats').select('xp, streak, last_day').maybeSingle();
  const t = today();
  const y = new Date(Date.now() - 864e5).toLocaleDateString('sv-SE');
  const streak = cur?.last_day === t ? cur.streak : cur?.last_day === y ? (cur.streak + 1) : 1;
  const next = { user_id: u.user.id, xp: (cur?.xp ?? 0) + amount, streak, last_day: t, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('learner_stats').upsert(next);
  if (error) { toast.error('Não consegui salvar seu XP.'); return null; }
  return next;
}

export const idsFrom = (m?: string) => (m ? m.split(',').filter(x => /^[0-9a-f-]{36}$/.test(x)).slice(0, 20) : []);
