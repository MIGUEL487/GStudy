-- Games: append-only results, bilateral challenges and server-written shared AI cache.
-- Apply manually after 0014. Reapplying is safe; never grant client counter writes.
CREATE TABLE IF NOT EXISTS public.game_content_cache (
  cache_key text PRIMARY KEY CHECK (length(cache_key) = 64),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
ALTER TABLE public.game_content_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS game_cache_read ON public.game_content_cache;
CREATE POLICY game_cache_read ON public.game_content_cache FOR SELECT TO authenticated USING (expires_at > now());
DROP POLICY IF EXISTS game_cache_server ON public.game_content_cache;
CREATE POLICY game_cache_server ON public.game_content_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.game_content_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.game_content_cache TO authenticated;
GRANT ALL ON public.game_content_cache TO service_role;

CREATE TABLE IF NOT EXISTS public.game_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id text NOT NULL CHECK (game_id ~ '^[a-z][a-z0-9-]{2,80}$'),
  difficulty text NOT NULL CHECK (difficulty IN ('facil','medio','dificil')),
  seed text NOT NULL CHECK (length(seed) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS game_challenges_sender_date ON public.game_challenges(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS game_challenges_recipient_date ON public.game_challenges(recipient_id, created_at DESC);
ALTER TABLE public.game_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS game_challenge_read ON public.game_challenges;
CREATE POLICY game_challenge_read ON public.game_challenges FOR SELECT TO authenticated
  USING ((sender_id = (SELECT auth.uid()) OR recipient_id = (SELECT auth.uid()))
    AND NOT public.users_blocked(sender_id, recipient_id));
REVOKE ALL ON public.game_challenges FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.game_challenges TO authenticated;

CREATE TABLE IF NOT EXISTS public.game_runs (
  event_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id text NOT NULL CHECK (game_id ~ '^[a-z][a-z0-9-]{2,80}$'),
  difficulty text NOT NULL CHECK (difficulty IN ('facil','medio','dificil')),
  seed text NOT NULL CHECK (length(seed) BETWEEN 1 AND 80),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 8000),
  hits integer NOT NULL CHECK (hits BETWEEN 0 AND 20),
  mistakes integer NOT NULL CHECK (mistakes BETWEEN 0 AND 1000),
  total integer NOT NULL CHECK (total BETWEEN 1 AND 20 AND hits <= total),
  max_combo integer NOT NULL CHECK (max_combo BETWEEN 1 AND 4),
  awarded integer NOT NULL DEFAULT 0 CHECK (awarded BETWEEN 0 AND 100),
  challenge_id uuid REFERENCES public.game_challenges(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (score <= hits * 400 AND (hits > 0 OR score = 0))
);
CREATE INDEX IF NOT EXISTS game_runs_user_game_date ON public.game_runs(user_id, game_id, difficulty, created_at DESC);
CREATE INDEX IF NOT EXISTS game_runs_challenge_user ON public.game_runs(challenge_id, user_id) WHERE challenge_id IS NOT NULL;
ALTER TABLE public.game_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS game_runs_read ON public.game_runs;
CREATE POLICY game_runs_read ON public.game_runs FOR SELECT TO authenticated USING (
  user_id = (SELECT auth.uid()) OR (public.is_friend((SELECT auth.uid()), user_id)
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = game_runs.user_id AND p.ranking_visibility = 'public'))
);
REVOKE ALL ON public.game_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.game_runs TO authenticated;

CREATE OR REPLACE FUNCTION public.create_game_challenge(p_friend_id uuid, p_game_id text, p_difficulty text, p_seed text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid(); challenge public.game_challenges; label text;
BEGIN
  IF caller IS NULL OR NOT public.is_friend(caller, p_friend_id) THEN RAISE EXCEPTION 'Convide somente um amigo disponível'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('game-challenge:' || caller::text, 0));
  IF (SELECT count(*) FROM public.game_challenges WHERE sender_id = caller AND created_at > now() - interval '1 minute') >= 10
    THEN RAISE EXCEPTION 'Aguarde um pouco antes de enviar outro desafio'; END IF;
  INSERT INTO public.game_challenges(sender_id, recipient_id, game_id, difficulty, seed)
    VALUES (caller, p_friend_id, p_game_id, p_difficulty, p_seed) RETURNING * INTO challenge;
  SELECT coalesce(display_name, username) INTO label FROM public.profiles WHERE id = caller;
  INSERT INTO public.notifications(user_id, sender_id, type, title, body, data)
    VALUES (p_friend_id, caller, 'game_challenge', 'Um desafio para você', coalesce(label, 'Seu amigo') || ' convidou você para jogar no seu tempo.',
      jsonb_build_object('challengeId', challenge.id, 'gameId', challenge.game_id, 'seed', challenge.seed, 'difficulty', challenge.difficulty));
  RETURN to_jsonb(challenge);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_game_result(p_event_id uuid, p_game_id text, p_difficulty text, p_seed text,
  p_score integer, p_hits integer, p_mistakes integer, p_total integer, p_max_combo integer, p_challenge_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid(); existing public.game_runs; challenge public.game_challenges; reward jsonb; stars integer; xp integer;
BEGIN
  IF caller IS NULL OR p_event_id IS NULL THEN RAISE EXCEPTION 'Sessão indisponível'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('game-result:' || p_event_id::text, 0));
  SELECT * INTO existing FROM public.game_runs WHERE event_id = p_event_id;
  IF FOUND THEN
    IF existing.user_id <> caller OR existing.game_id <> p_game_id OR existing.difficulty <> p_difficulty OR existing.seed <> p_seed
      OR existing.score <> p_score OR existing.hits <> p_hits OR existing.mistakes <> p_mistakes
      OR existing.total <> p_total OR existing.max_combo <> p_max_combo OR existing.challenge_id IS DISTINCT FROM p_challenge_id
      THEN RAISE EXCEPTION 'Esta partida já foi registrada com outros dados'; END IF;
    RETURN to_jsonb(existing);
  END IF;
  IF p_challenge_id IS NOT NULL THEN
    SELECT * INTO challenge FROM public.game_challenges WHERE id = p_challenge_id;
    IF NOT FOUND OR caller NOT IN (challenge.sender_id, challenge.recipient_id) OR challenge.expires_at <= now()
      OR public.users_blocked(challenge.sender_id, challenge.recipient_id)
      OR challenge.game_id <> p_game_id OR challenge.difficulty <> p_difficulty OR challenge.seed <> p_seed
      THEN RAISE EXCEPTION 'Este desafio não está disponível para esta partida'; END IF;
  END IF;
  -- The row constraints reject impossible ranges; this is not a competitive anti-cheat proof.
  INSERT INTO public.game_runs(event_id,user_id,game_id,difficulty,seed,score,hits,mistakes,total,max_combo,challenge_id)
    VALUES(p_event_id,caller,p_game_id,p_difficulty,p_seed,p_score,p_hits,p_mistakes,p_total,p_max_combo,p_challenge_id);
  stars := CASE WHEN p_hits::numeric / greatest(1,p_hits+p_mistakes) >= .85 THEN 3
    WHEN p_hits::numeric / greatest(1,p_hits+p_mistakes) >= .6 THEN 2 ELSE 1 END;
  xp := CASE WHEN p_hits > 0 THEN least(25,greatest(5,round(p_score::numeric/50)::integer)) + stars*5 ELSE 0 END;
  IF xp > 0 THEN reward := public.record_learning_reward('game',p_event_id,xp); END IF;
  UPDATE public.game_runs SET awarded = coalesce((reward->>'awarded')::integer,0) WHERE event_id = p_event_id RETURNING * INTO existing;
  RETURN to_jsonb(existing);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_game_leaderboard(p_game_id text, p_difficulty text, p_period text DEFAULT 'week')
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, score integer, rank_position bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR p_difficulty NOT IN ('facil','medio','dificil') OR p_period NOT IN ('week','total') THEN RAISE EXCEPTION 'Consulta inválida'; END IF;
  RETURN QUERY WITH scores AS (
    SELECT p.id, coalesce(p.display_name,p.username) AS name, p.avatar_url AS avatar, max(r.score) AS value
    FROM public.game_runs r JOIN public.profiles p ON p.id = r.user_id
    WHERE r.game_id = p_game_id AND r.difficulty = p_difficulty
      AND (p_period = 'total' OR r.created_at >= (date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'))
      AND (p.id = auth.uid() OR (p.ranking_visibility = 'public' AND public.is_friend(auth.uid(),p.id)))
    GROUP BY p.id,p.display_name,p.username,p.avatar_url
  ) SELECT id,name,avatar,value,rank() OVER(ORDER BY value DESC) FROM scores ORDER BY value DESC,name;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_game_records()
RETURNS TABLE(game_id text, difficulty text, best_score integer, stars integer, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.game_id,r.difficulty,max(r.score),max(CASE
    WHEN r.hits::numeric/greatest(1,r.hits+r.mistakes) >= .85 THEN 3
    WHEN r.hits::numeric/greatest(1,r.hits+r.mistakes) >= .6 THEN 2 ELSE 1 END),max(r.created_at)
  FROM public.game_runs r WHERE r.user_id = auth.uid() GROUP BY r.game_id,r.difficulty;
$$;
REVOKE ALL ON FUNCTION public.get_game_records() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_game_records() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_game_challenge(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE challenge public.game_challenges; results jsonb;
BEGIN
  SELECT * INTO challenge FROM public.game_challenges WHERE id = p_id;
  IF auth.uid() IS NULL OR NOT FOUND OR auth.uid() NOT IN (challenge.sender_id, challenge.recipient_id)
    OR public.users_blocked(challenge.sender_id, challenge.recipient_id)
    THEN RAISE EXCEPTION 'Este desafio não está disponível'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(result)),'[]'::jsonb) INTO results FROM (
    SELECT r.user_id, coalesce(p.display_name,p.username) AS display_name, max(r.score) AS score
    FROM public.game_runs r JOIN public.profiles p ON p.id = r.user_id
    WHERE r.challenge_id = p_id GROUP BY r.user_id,p.display_name,p.username
  ) result;
  RETURN jsonb_build_object('challenge',to_jsonb(challenge),'results',results);
END;
$$;
REVOKE ALL ON FUNCTION public.get_game_challenge(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_game_challenge(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_game_challenge(uuid,text,text,text), public.record_game_result(uuid,text,text,text,integer,integer,integer,integer,integer,uuid), public.get_game_leaderboard(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_game_challenge(uuid,text,text,text), public.record_game_result(uuid,text,text,text,integer,integer,integer,integer,integer,uuid), public.get_game_leaderboard(text,text,text) TO authenticated;
