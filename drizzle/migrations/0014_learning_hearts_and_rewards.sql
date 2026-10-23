-- Runtime rules live in one protected row. No production application by agents.
CREATE TABLE IF NOT EXISTS public.learning_rules (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  hearts_max integer NOT NULL CHECK (hearts_max BETWEEN 1 AND 10),
  hearts_regen_minutes integer NOT NULL CHECK (hearts_regen_minutes BETWEEN 1 AND 1440),
  xp_per_action integer NOT NULL CHECK (xp_per_action BETWEEN 1 AND 100),
  xp_per_day integer NOT NULL CHECK (xp_per_day BETWEEN 1 AND 1000)
);
INSERT INTO public.learning_rules(singleton,hearts_max,hearts_regen_minutes,xp_per_action,xp_per_day) VALUES(true, 3, 120, 100, 500) ON CONFLICT DO NOTHING;
ALTER TABLE public.learning_rules ADD COLUMN IF NOT EXISTS ai_limits jsonb NOT NULL DEFAULT
  '{"quiz":100,"flashcards":100,"explain":100,"feynman":100,"socrates":100,"game":50,"photo_import":30,"library":50,"material":50}'::jsonb;
ALTER TABLE public.learning_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_rules FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.learning_hearts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hearts integer NOT NULL DEFAULT 3 CHECK (hearts >= 0),
  hearts_updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.learning_heart_events (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, event_id)
);
CREATE TABLE IF NOT EXISTS public.learning_reward_events (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  action text NOT NULL,
  amount integer NOT NULL CHECK (amount >= 0),
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, event_id)
);
CREATE INDEX IF NOT EXISTS learning_rewards_day ON public.learning_reward_events(user_id, day);
ALTER TABLE public.learning_hearts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_heart_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_reward_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hearts_read_own ON public.learning_hearts;
CREATE POLICY hearts_read_own ON public.learning_hearts FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS heart_events_read_own ON public.learning_heart_events;
CREATE POLICY heart_events_read_own ON public.learning_heart_events FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS rewards_read_own ON public.learning_reward_events;
CREATE POLICY rewards_read_own ON public.learning_reward_events FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON public.learning_hearts, public.learning_heart_events, public.learning_reward_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.learning_hearts, public.learning_heart_events, public.learning_reward_events FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_learning_hearts()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid(); rules public.learning_rules; state public.learning_hearts;
  recovered integer; interval_length interval;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501'; END IF;
  SELECT * INTO STRICT rules FROM public.learning_rules WHERE singleton;
  interval_length := make_interval(mins => rules.hearts_regen_minutes);
  INSERT INTO public.learning_hearts(user_id, hearts) VALUES(caller, rules.hearts_max) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT state FROM public.learning_hearts WHERE user_id = caller FOR UPDATE;
  recovered := greatest(0, floor(extract(epoch FROM (now() - state.hearts_updated_at)) / extract(epoch FROM interval_length))::integer);
  IF state.hearts >= rules.hearts_max THEN
    state.hearts := rules.hearts_max;
    state.hearts_updated_at := now();
  ELSIF recovered > 0 THEN
    state.hearts := least(rules.hearts_max, state.hearts + recovered);
    state.hearts_updated_at := CASE WHEN state.hearts = rules.hearts_max THEN now()
      ELSE state.hearts_updated_at + recovered * interval_length END;
  END IF;
  UPDATE public.learning_hearts SET hearts = state.hearts, hearts_updated_at = state.hearts_updated_at WHERE user_id = caller;
  RETURN jsonb_build_object('hearts', state.hearts, 'max', rules.hearts_max,
    'regen_minutes', rules.hearts_regen_minutes, 'server_now', now(),
    'next_at', CASE WHEN state.hearts < rules.hearts_max THEN state.hearts_updated_at + interval_length ELSE NULL END);
END;
$$;

CREATE OR REPLACE FUNCTION public.lose_learning_heart(p_event_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid(); current_state jsonb; inserted_count integer;
BEGIN
  IF caller IS NULL OR p_event_id IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501'; END IF;
  current_state := public.get_learning_hearts(); -- also locks the account, serializing concurrent answers
  INSERT INTO public.learning_heart_events(user_id, event_id) VALUES(caller, p_event_id) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    UPDATE public.learning_hearts SET hearts = greatest(0, hearts - 1),
      hearts_updated_at = CASE WHEN hearts = (current_state->>'max')::integer THEN now() ELSE hearts_updated_at END
    WHERE user_id = caller;
  END IF;
  RETURN public.get_learning_hearts();
END;
$$;

CREATE OR REPLACE FUNCTION public.record_learning_reward(p_action text, p_event_id uuid, p_amount integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid(); rules public.learning_rules; current_stats public.learner_stats;
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; day_total integer; granted integer;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501'; END IF;
  IF p_event_id IS NULL OR p_action NOT IN ('study','quiz','flashcards','recall','review','feynman','game','legacy') OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Recompensa inválida';
  END IF;
  SELECT * INTO STRICT rules FROM public.learning_rules WHERE singleton;
  INSERT INTO public.learner_stats(user_id) VALUES(caller) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT current_stats FROM public.learner_stats WHERE user_id = caller FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.learning_reward_events WHERE user_id = caller AND event_id = p_event_id) THEN
    RETURN to_jsonb(current_stats) || jsonb_build_object('awarded', 0);
  END IF;
  SELECT coalesce(sum(amount), 0) INTO day_total FROM public.learning_reward_events WHERE user_id = caller AND day = today;
  granted := least(p_amount, rules.xp_per_action, greatest(0, rules.xp_per_day - day_total));
  IF p_action = 'game' THEN
    granted := least(granted, greatest(0, 100 - (SELECT coalesce(sum(amount), 0) FROM public.learning_reward_events WHERE user_id = caller AND day = today AND action = 'game')));
  END IF;
  IF granted = 0 THEN RETURN to_jsonb(current_stats) || jsonb_build_object('awarded', 0); END IF;
  INSERT INTO public.learning_reward_events(user_id, event_id, action, amount, day) VALUES(caller, p_event_id, p_action, granted, today);
  UPDATE public.learner_stats SET xp = xp + granted,
    streak = CASE WHEN granted = 0 OR last_day = today THEN streak WHEN last_day = today - 1 THEN streak + 1 ELSE 1 END,
    last_day = CASE WHEN granted > 0 THEN today ELSE last_day END, updated_at = now()
    WHERE user_id = caller RETURNING * INTO current_stats;
  RETURN to_jsonb(current_stats) || jsonb_build_object('awarded', granted);
END;
$$;

-- Preserve the old signature, closing the old uncapped entry point as well.
CREATE OR REPLACE FUNCTION public.award_learner_xp(p_amount integer)
RETURNS json LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.record_learning_reward('legacy', gen_random_uuid(), p_amount)::json;
$$;
REVOKE INSERT, UPDATE, DELETE ON public.learner_stats FROM authenticated;
DROP POLICY IF EXISTS "insert initial stats" ON public.learner_stats;

CREATE OR REPLACE FUNCTION public.get_learning_leaderboard(p_metric text DEFAULT 'xp', p_period text DEFAULT 'week')
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, score bigint, rank_position bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR p_metric NOT IN ('xp','streak') OR p_period NOT IN ('week','total') THEN RAISE EXCEPTION 'Consulta inválida'; END IF;
  RETURN QUERY WITH scores AS (
    SELECT p.id, coalesce(p.display_name, p.username) AS name, p.avatar_url AS avatar,
      CASE WHEN p_metric = 'streak' THEN CASE
        WHEN s.last_day IS NULL OR s.last_day < (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1 THEN 0
        WHEN p_period = 'week' THEN least(coalesce(s.streak, 0), greatest(0, s.last_day - date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')::date + 1))
        ELSE coalesce(s.streak, 0) END::bigint
      WHEN p_period = 'total' THEN coalesce(s.xp, 0)::bigint
      ELSE coalesce((SELECT sum(e.amount) FROM public.learning_reward_events e WHERE e.user_id = p.id
        AND e.day >= date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')::date), 0)::bigint END AS value
    FROM public.profiles p LEFT JOIN public.learner_stats s ON s.user_id = p.id
    WHERE p.id = auth.uid() OR (p.ranking_visibility = 'public' AND public.is_friend(auth.uid(), p.id))
  ) SELECT id, name, avatar, value, rank() OVER(ORDER BY value DESC) FROM scores ORDER BY value DESC, name;
END;
$$;
REVOKE ALL ON FUNCTION public.get_learning_hearts(), public.lose_learning_heart(uuid),
  public.record_learning_reward(text,uuid,integer), public.award_learner_xp(integer), public.get_learning_leaderboard(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_learning_hearts(), public.lose_learning_heart(uuid),
  public.record_learning_reward(text,uuid,integer), public.award_learner_xp(integer), public.get_learning_leaderboard(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_and_consume_ai_quota(p_action text, p_max_limit integer DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid(); today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  limits jsonb; ceiling integer; used integer;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501'; END IF;
  SELECT ai_limits INTO limits FROM public.learning_rules WHERE singleton;
  IF NOT (limits ? p_action) THEN RAISE EXCEPTION 'Ação inválida'; END IF;
  ceiling := (limits->>p_action)::integer;
  IF p_max_limit > 0 THEN ceiling := least(ceiling, p_max_limit); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('learning-quota:' || caller::text || ':' || p_action || ':' || today::text));
  INSERT INTO public.user_daily_ai_usage(user_id,action,day,count) VALUES(caller,p_action,today,0) ON CONFLICT DO NOTHING;
  SELECT count INTO used FROM public.user_daily_ai_usage WHERE user_id = caller AND action = p_action AND day = today FOR UPDATE;
  IF used >= ceiling THEN RETURN json_build_object('allowed',false,'count',used,'limit',ceiling,'remaining',0); END IF;
  UPDATE public.user_daily_ai_usage SET count = count + 1, updated_at = now()
    WHERE user_id = caller AND action = p_action AND day = today RETURNING count INTO used;
  RETURN json_build_object('allowed',true,'count',used,'limit',ceiling,'remaining',ceiling-used);
END;
$$;
REVOKE ALL ON FUNCTION public.check_and_consume_ai_quota(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_and_consume_ai_quota(text,integer) TO authenticated;
