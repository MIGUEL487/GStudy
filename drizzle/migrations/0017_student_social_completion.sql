-- Complete profile/rollover and private social channels without changing stored study work.
CREATE TABLE IF NOT EXISTS public.student_rollover_notices (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_year integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,calendar_year)
);
ALTER TABLE public.student_rollover_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_rollover_notices FROM anon,authenticated;
GRANT SELECT ON public.student_rollover_notices TO authenticated;
DROP POLICY IF EXISTS rollover_notices_own ON public.student_rollover_notices;
CREATE POLICY rollover_notices_own ON public.student_rollover_notices FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.school_year_at(p_year text,p_selected timestamptz,p_now timestamptz DEFAULT now())
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE stages text[]:=ARRAY['fundamental-6','fundamental-7','fundamental-8','fundamental-9','medio-1','medio-2','medio-3','cursinho']; position integer; elapsed integer;
BEGIN
 position:=array_position(stages,p_year);
 IF position IS NULL OR p_selected IS NULL THEN RETURN p_year; END IF;
 elapsed:=greatest(0,least(20,extract(year FROM p_now AT TIME ZONE 'America/Sao_Paulo')::integer-extract(year FROM p_selected AT TIME ZONE 'America/Sao_Paulo')::integer));
 RETURN stages[least(cardinality(stages),position+elapsed)];
END $$;
CREATE OR REPLACE FUNCTION public.get_student_rollover()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid:=auth.uid(); profile public.profiles; target text; calendar_year integer:=extract(year FROM now() AT TIME ZONE 'America/Sao_Paulo'); added integer; label text;
BEGIN
 IF caller IS NULL THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE='42501'; END IF;
 SELECT * INTO profile FROM public.profiles WHERE id=caller FOR UPDATE;
 target:=public.school_year_at(profile.school_year,profile.year_selected_at);
 IF target IS NULL OR target IS NOT DISTINCT FROM profile.school_year THEN
   RETURN jsonb_build_object('needsPrompt',false,'currentCalendarYear',calendar_year); END IF;
 INSERT INTO public.student_rollover_notices(user_id,calendar_year) VALUES(caller,calendar_year) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;
 IF added=1 THEN
   label:=CASE WHEN target='cursinho' THEN 'Concluí o EM / Cursinho'
     WHEN target LIKE 'medio-%' THEN right(target,1)||'º ano · Ensino médio'
     ELSE right(target,1)||'º ano · Ensino fundamental' END;
   INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(caller,'year_rollover','Novo ano letivo: agora você está no '||label,
     'Confirme sua etapa de estudo ou altere nas configurações.',jsonb_build_object('schoolYear',target,'calendarYear',calendar_year));
 END IF;
 RETURN jsonb_build_object('needsPrompt',true,'currentSchoolYear',profile.school_year,'suggestedNextYear',target,'currentCalendarYear',calendar_year);
END $$;
CREATE OR REPLACE FUNCTION public.save_student_profile(p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid:=auth.uid(); profile public.profiles; field text;
BEGIN
 IF caller IS NULL THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE='42501'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'Perfil inválido'; END IF;
 FOR field IN SELECT jsonb_object_keys(p_patch) LOOP
   IF field NOT IN ('display_name','avatar_url','school_year','school_days','theme') THEN RAISE EXCEPTION 'Campo inválido'; END IF;
 END LOOP;
 SELECT * INTO profile FROM public.profiles WHERE id=caller FOR UPDATE;
 IF profile.id IS NULL THEN RAISE EXCEPTION 'Perfil indisponível'; END IF;
 IF p_patch?'display_name' THEN
   IF jsonb_typeof(p_patch->'display_name')<>'string' OR length(trim(p_patch->>'display_name')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Nome inválido'; END IF;
   profile.display_name:=trim(p_patch->>'display_name');
 END IF;
 IF p_patch?'avatar_url' THEN
   IF jsonb_typeof(p_patch->'avatar_url') NOT IN ('string','null') OR length(p_patch->>'avatar_url')>250000
     OR (p_patch->>'avatar_url' IS NOT NULL AND p_patch->>'avatar_url' !~ '^(https://|data:image/(jpeg|png|webp);base64,)') THEN RAISE EXCEPTION 'Foto inválida'; END IF;
   profile.avatar_url:=p_patch->>'avatar_url';
 END IF;
 IF p_patch?'school_year' THEN
   IF p_patch->>'school_year' IS NULL OR p_patch->>'school_year' !~ '^(fundamental-[1-9]|medio-[1-3]|cursinho|superior|concluido|outro)$' THEN RAISE EXCEPTION 'Etapa inválida'; END IF;
   profile.school_year:=p_patch->>'school_year'; profile.year_selected_at:=now();
 END IF;
 IF p_patch?'school_days' THEN
   IF jsonb_typeof(p_patch->'school_days')<>'array' OR jsonb_array_length(p_patch->'school_days')>7
     OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_patch->'school_days') day WHERE day IS NULL OR day !~ '^[0-6]$') THEN RAISE EXCEPTION 'Dias inválidos'; END IF;
   SELECT ARRAY(SELECT DISTINCT day::integer FROM jsonb_array_elements_text(p_patch->'school_days') day ORDER BY 1) INTO profile.school_days;
 END IF;
 IF p_patch?'theme' THEN
   IF p_patch->>'theme' IS NULL OR p_patch->>'theme' NOT IN ('light','dark') THEN RAISE EXCEPTION 'Tema inválido'; END IF;
   profile.theme:=p_patch->>'theme';
 END IF;
 UPDATE public.profiles SET display_name=profile.display_name,avatar_url=profile.avatar_url,school_year=profile.school_year,
   year_selected_at=profile.year_selected_at,school_days=profile.school_days,theme=profile.theme,updated_at=now() WHERE id=caller;
 IF p_patch?'school_year' THEN UPDATE public.notifications SET read=true WHERE user_id=caller AND type='year_rollover' AND NOT read; END IF;
 RETURN jsonb_build_object('saved',true);
END $$;
CREATE OR REPLACE FUNCTION public.advance_school_year(p_new_school_year text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT public.save_student_profile(jsonb_build_object('school_year',p_new_school_year));
$$;
REVOKE ALL ON FUNCTION public.advance_school_year(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.advance_school_year(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_social_inbox()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid:=auth.uid(); pending integer; unread jsonb;
BEGIN
 IF caller IS NULL THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE='42501'; END IF;
 SELECT count(*)::integer INTO pending FROM public.friendships WHERE friend_id=caller AND status='pending' AND NOT public.users_blocked(user_id,caller);
 SELECT coalesce(jsonb_object_agg(sender_id,total),'{}'::jsonb) INTO unread FROM (
   SELECT sender_id,count(*)::integer AS total FROM public.direct_messages WHERE recipient_id=caller AND read_at IS NULL
     AND public.is_friend(caller,sender_id) GROUP BY sender_id) counts;
 RETURN jsonb_build_object('pending',pending,'unread',unread);
END $$;
CREATE INDEX IF NOT EXISTS direct_messages_unread_recipient ON public.direct_messages(recipient_id,sender_id) WHERE read_at IS NULL;
CREATE OR REPLACE FUNCTION public.social_topic_allowed(p_topic text,p_user uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE ids text[];
BEGIN
 IF p_user IS NULL THEN RETURN false; END IF;
 IF p_topic ~ '^(social|notifications):[0-9a-f-]{36}$' THEN RETURN split_part(p_topic,':',2)::uuid=p_user; END IF;
 IF p_topic !~ '^dm:[0-9a-f-]{36}:[0-9a-f-]{36}$' THEN RETURN false; END IF;
 ids:=string_to_array(p_topic,':');
 RETURN p_user IN (ids[2]::uuid,ids[3]::uuid) AND public.is_friend(ids[2]::uuid,ids[3]::uuid);
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END $$;
DO $$ BEGIN
 IF to_regclass('realtime.messages') IS NOT NULL AND to_regprocedure('realtime.topic()') IS NOT NULL THEN
   EXECUTE 'DROP POLICY IF EXISTS social_channel_read ON realtime.messages';
   EXECUTE 'CREATE POLICY social_channel_read ON realtime.messages FOR SELECT TO authenticated USING(public.social_topic_allowed(realtime.topic(),(SELECT auth.uid())))';
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.school_year_at(text,timestamptz,timestamptz),public.get_student_rollover(),public.save_student_profile(jsonb),public.get_social_inbox(),public.social_topic_allowed(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.school_year_at(text,timestamptz,timestamptz),public.get_student_rollover(),public.save_student_profile(jsonb),public.get_social_inbox(),public.social_topic_allowed(text,uuid) TO authenticated;
