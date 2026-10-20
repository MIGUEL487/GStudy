-- Migração 0004: Cotas de IA no servidor e RPC atômica de XP/ofensiva

-- 1. Tabela de consumo diário de IA por usuário e tipo de ação
CREATE TABLE IF NOT EXISTS public.user_daily_ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  action text NOT NULL,
  day date NOT NULL DEFAULT CURRENT_DATE,
  count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_action_day UNIQUE (user_id, action, day)
);

GRANT SELECT ON public.user_daily_ai_usage TO authenticated;
GRANT ALL ON public.user_daily_ai_usage TO service_role;
ALTER TABLE public.user_daily_ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own ai usage" ON public.user_daily_ai_usage
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2. Função RPC segura para verificar e incrementar a cota de IA
CREATE OR REPLACE FUNCTION public.check_and_consume_ai_quota(
  p_action text,
  p_max_limit integer DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_limit integer;
  v_today date;
  v_current_count integer;
  v_new_count integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  v_today := CURRENT_DATE;

  -- Limites padrão por tipo de ação caso p_max_limit não seja passado
  IF p_max_limit IS NOT NULL AND p_max_limit > 0 THEN
    v_limit := p_max_limit;
  ELSE
    CASE p_action
      WHEN 'quiz' THEN v_limit := 10;
      WHEN 'flashcards' THEN v_limit := 10;
      WHEN 'explain' THEN v_limit := 10;
      WHEN 'feynman' THEN v_limit := 20;
      WHEN 'socrates' THEN v_limit := 30;
      WHEN 'photo_import' THEN v_limit := 15;
      WHEN 'library' THEN v_limit := 25;
      WHEN 'material' THEN v_limit := 20;
      ELSE v_limit := 10;
    END CASE;
  END IF;

  -- Bloqueio e incremento atômico
  INSERT INTO public.user_daily_ai_usage (user_id, action, day, count, updated_at)
  VALUES (v_user_id, p_action, v_today, 1, now())
  ON CONFLICT (user_id, action, day)
  DO UPDATE SET
    count = CASE
      WHEN public.user_daily_ai_usage.count >= v_limit THEN public.user_daily_ai_usage.count
      ELSE public.user_daily_ai_usage.count + 1
    END,
    updated_at = now()
  RETURNING count INTO v_new_count;

  IF v_new_count > v_limit OR (v_new_count = v_limit AND EXISTS (
    SELECT 1 FROM public.user_daily_ai_usage
    WHERE user_id = v_user_id AND action = p_action AND day = v_today AND count >= v_limit
  )) THEN
    -- Se já estava no limite antes da chamada
    SELECT count INTO v_current_count FROM public.user_daily_ai_usage
    WHERE user_id = v_user_id AND action = p_action AND day = v_today;
    
    IF v_current_count >= v_limit THEN
      RETURN json_build_object(
        'allowed', false,
        'count', v_current_count,
        'limit', v_limit,
        'remaining', 0
      );
    END IF;
  END IF;

  RETURN json_build_object(
    'allowed', true,
    'count', v_new_count,
    'limit', v_limit,
    'remaining', GREATEST(0, v_limit - v_new_count)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_consume_ai_quota(text, integer) TO authenticated;

-- 3. RPC atômica para XP e ofensiva (Item 1.3)
CREATE OR REPLACE FUNCTION public.award_learner_xp(
  p_amount integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_cur RECORD;
  v_today date;
  v_yesterday date;
  v_new_streak integer;
  v_new_xp integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'Quantidade de XP inválida.';
  END IF;

  v_today := CURRENT_DATE;
  v_yesterday := CURRENT_DATE - 1;

  SELECT xp, streak, last_day INTO v_cur
  FROM public.learner_stats
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_new_streak := 1;
    v_new_xp := p_amount;

    INSERT INTO public.learner_stats (user_id, xp, streak, last_day, updated_at)
    VALUES (v_user_id, v_new_xp, v_new_streak, v_today, now());
  ELSE
    IF v_cur.last_day = v_today THEN
      v_new_streak := v_cur.streak;
    ELSIF v_cur.last_day = v_yesterday THEN
      v_new_streak := v_cur.streak + 1;
    ELSE
      v_new_streak := 1;
    END IF;

    v_new_xp := v_cur.xp + p_amount;

    UPDATE public.learner_stats
    SET xp = v_new_xp,
        streak = v_new_streak,
        last_day = v_today,
        updated_at = now()
    WHERE user_id = v_user_id;
  END IF;

  RETURN json_build_object(
    'user_id', v_user_id,
    'xp', v_new_xp,
    'streak', v_new_streak,
    'last_day', to_char(v_today, 'YYYY-MM-DD')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_learner_xp(integer) TO authenticated;

-- 4. Ajuste de RLS em learner_stats para impedir que o cliente altere xp/streak diretamente
DROP POLICY IF EXISTS "own stats" ON public.learner_stats;
DROP POLICY IF EXISTS "read own stats" ON public.learner_stats;
DROP POLICY IF EXISTS "insert own stats" ON public.learner_stats;

CREATE POLICY "read own stats" ON public.learner_stats
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "insert initial stats" ON public.learner_stats
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND xp = 0 AND streak = 0);

-- Revoga permissão de UPDATE direto de authenticated (só a função security definer pode alterar)
REVOKE UPDATE ON public.learner_stats FROM authenticated;
