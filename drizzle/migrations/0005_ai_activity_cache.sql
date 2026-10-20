-- Migração 0005: Cache e pré-geração de atividades de IA
-- Salva quizzes, flashcards e explicações geradas para carregamento instantâneo (< 100ms)

CREATE TABLE IF NOT EXISTS public.ai_activity_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  cache_key text NOT NULL,
  mode text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_ai_cache_key UNIQUE (user_id, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_activity_cache_lookup
  ON public.ai_activity_cache (user_id, cache_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_activity_cache TO authenticated;
GRANT ALL ON public.ai_activity_cache TO service_role;
ALTER TABLE public.ai_activity_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own ai cache" ON public.ai_activity_cache
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "insert own ai cache" ON public.ai_activity_cache
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update own ai cache" ON public.ai_activity_cache
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "delete own ai cache" ON public.ai_activity_cache
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
