-- Explicit invitations and server-authored signaling. Never apply remotely from an agent.
CREATE TABLE IF NOT EXISTS public.voice_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.study_groups(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CHECK (room_id IS NULL OR group_id IS NULL)
);
CREATE TABLE IF NOT EXISTS public.call_members (
  call_id uuid NOT NULL REFERENCES public.voice_calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  muted boolean NOT NULL DEFAULT true,
  force_muted boolean NOT NULL DEFAULT false,
  sharing boolean NOT NULL DEFAULT false,
  kicked boolean NOT NULL DEFAULT false,
  PRIMARY KEY (call_id, user_id)
);
CREATE INDEX IF NOT EXISTS voice_calls_creator_time ON public.voice_calls(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS call_members_user_active ON public.call_members(user_id, last_seen_at) WHERE left_at IS NULL;
CREATE TABLE IF NOT EXISTS public.call_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dnd_until timestamptz,
  dnd_manual boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.call_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.voice_calls(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','missed','silent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 seconds',
  responded_at timestamptz,
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS call_invites_inbox ON public.call_invites(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS call_invites_cooldown ON public.call_invites(sender_id, recipient_id, responded_at DESC);
CREATE TABLE IF NOT EXISTS public.call_signals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  call_id uuid NOT NULL REFERENCES public.voice_calls(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('offer','answer','ice')),
  payload jsonb NOT NULL CHECK (octet_length(payload::text) <= 16000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_signals_recipient ON public.call_signals(recipient_id, call_id, id);
CREATE INDEX IF NOT EXISTS call_signals_sender_time ON public.call_signals(sender_id, created_at);
CREATE INDEX IF NOT EXISTS call_signals_expiration ON public.call_signals(created_at);

CREATE OR REPLACE FUNCTION public.is_call_member(p_call uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.call_members m JOIN public.voice_calls c ON c.id=m.call_id
   WHERE m.call_id=p_call AND m.user_id=p_user AND m.left_at IS NULL AND NOT m.kicked
   AND m.last_seen_at > now()-interval '3 minutes' AND c.ended_at IS NULL
   AND c.created_at > now()-interval '8 hours'
   AND NOT EXISTS(SELECT 1 FROM public.call_members other WHERE other.call_id=p_call
     AND other.left_at IS NULL AND NOT other.kicked AND public.users_blocked(other.user_id,p_user)));
$$;
CREATE OR REPLACE FUNCTION public.can_invite_to_call(p_call uuid,p_sender uuid,p_recipient uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT p_sender<>p_recipient AND public.is_call_member(p_call,p_sender)
   AND NOT EXISTS(SELECT 1 FROM public.call_members m WHERE m.call_id=p_call AND m.user_id=p_recipient AND m.kicked)
   AND NOT EXISTS(SELECT 1 FROM public.call_members m WHERE m.call_id=p_call AND m.left_at IS NULL
     AND NOT m.kicked AND public.users_blocked(m.user_id,p_recipient))
   AND EXISTS(SELECT 1 FROM public.voice_calls c WHERE c.id=p_call AND (
     public.is_friend(p_sender,p_recipient)
     OR (c.group_id IS NOT NULL AND public.is_group_member(c.group_id,p_sender) AND public.is_group_member(c.group_id,p_recipient))
     OR (c.room_id IS NOT NULL AND public.is_study_room_participant(c.room_id,p_sender)
       AND public.is_study_room_participant(c.room_id,p_recipient))));
$$;
CREATE OR REPLACE FUNCTION public.can_moderate_call(p_call uuid,p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT public.is_call_member(p_call,p_user) AND EXISTS(SELECT 1 FROM public.voice_calls c
   WHERE c.id=p_call AND (c.created_by=p_user
     OR EXISTS(SELECT 1 FROM public.study_rooms r WHERE r.id=c.room_id AND r.created_by=p_user)
     OR EXISTS(SELECT 1 FROM public.group_members g WHERE g.group_id=c.group_id AND g.user_id=p_user AND g.role='admin')));
$$;
ALTER TABLE public.voice_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['voice_calls','call_members','call_preferences','call_invites','call_signals'] LOOP
   EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
   EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 END LOOP;
END $$;
DROP POLICY IF EXISTS voice_calls_read ON public.voice_calls;
CREATE POLICY voice_calls_read ON public.voice_calls FOR SELECT TO authenticated
 USING(public.is_call_member(id,(SELECT auth.uid())));
DROP POLICY IF EXISTS call_members_read ON public.call_members;
CREATE POLICY call_members_read ON public.call_members FOR SELECT TO authenticated
 USING(public.is_call_member(call_id,(SELECT auth.uid())) AND NOT public.users_blocked(user_id,(SELECT auth.uid())));
DROP POLICY IF EXISTS call_preferences_read ON public.call_preferences;
CREATE POLICY call_preferences_read ON public.call_preferences FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS call_invites_read ON public.call_invites;
CREATE POLICY call_invites_read ON public.call_invites FOR SELECT TO authenticated
 USING((SELECT auth.uid()) IN (sender_id,recipient_id) AND NOT public.users_blocked(sender_id,recipient_id));
DROP POLICY IF EXISTS call_signals_read ON public.call_signals;
CREATE POLICY call_signals_read ON public.call_signals FOR SELECT TO authenticated
 USING(recipient_id=(SELECT auth.uid()) AND created_at>now()-interval '90 seconds'
   AND public.is_call_member(call_id,(SELECT auth.uid())) AND public.is_call_member(call_id,sender_id));

CREATE OR REPLACE FUNCTION public.invite_voice_peer(p_call uuid,p_recipient uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid:=auth.uid(); i public.call_invites; next_at timestamptz; silent boolean;
BEGIN
 IF caller IS NULL OR NOT public.can_invite_to_call(p_call,caller,p_recipient) THEN
   RAISE EXCEPTION 'Convite indisponível' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('voice-invite:'||caller::text||p_recipient::text));
 SELECT max(responded_at)+interval '30 seconds' INTO next_at FROM public.call_invites
   WHERE sender_id=caller AND recipient_id=p_recipient AND status='declined';
 IF next_at>now() THEN RETURN jsonb_build_object('status','cooldown','next_at',next_at,'server_now',now()); END IF;
 SELECT * INTO i FROM public.call_invites WHERE call_id=p_call AND sender_id=caller
   AND recipient_id=p_recipient AND status='pending' AND expires_at>now() ORDER BY created_at DESC LIMIT 1;
 IF i.id IS NOT NULL THEN RETURN jsonb_build_object('id',i.id,'status',i.status,'expires_at',i.expires_at,'server_now',now()); END IF;
 IF (SELECT count(*) FROM public.call_invites WHERE sender_id=caller AND created_at>now()-interval '1 minute')>=20 THEN
   RAISE EXCEPTION 'Aguarde antes de chamar novamente'; END IF;
 SELECT coalesce(bool_or(dnd_manual OR dnd_until>now()),false) INTO silent
   FROM public.call_preferences WHERE user_id=p_recipient;
 INSERT INTO public.call_invites(call_id,sender_id,recipient_id,status)
   VALUES(p_call,caller,p_recipient,CASE WHEN silent THEN 'silent' ELSE 'pending' END) RETURNING * INTO i;
 IF silent THEN INSERT INTO public.notifications(user_id,sender_id,type,title,body,data)
   VALUES(p_recipient,caller,'missed_call','Ligação perdida','Você recebeu uma ligação durante Não perturbar.',jsonb_build_object('call_id',p_call,'sender_id',caller)); END IF;
 RETURN jsonb_build_object('id',i.id,'status',CASE WHEN silent THEN 'sent' ELSE i.status END,'expires_at',i.expires_at,'server_now',now());
END $$;

CREATE OR REPLACE FUNCTION public.start_voice_call(p_room uuid DEFAULT NULL,p_group uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid:=auth.uid(); call_id uuid; title text; peer record;
BEGIN
 IF caller IS NULL OR (p_room IS NOT NULL AND p_group IS NOT NULL) THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('voice-start:'||caller::text));
 IF EXISTS(SELECT 1 FROM public.call_members m WHERE m.user_id=caller AND public.is_call_member(m.call_id,caller)) THEN
   RAISE EXCEPTION 'Saia da chamada atual antes de iniciar outra'; END IF;
 IF (SELECT count(*) FROM public.voice_calls WHERE created_by=caller AND created_at>now()-interval '1 minute')>=5 THEN
   RAISE EXCEPTION 'Aguarde antes de iniciar outra chamada'; END IF;
 IF p_room IS NOT NULL THEN
   IF NOT public.is_study_room_participant(p_room,caller) OR NOT public.is_study_room_accessible(p_room,caller) THEN
     RAISE EXCEPTION 'Sem acesso' USING ERRCODE='42501'; END IF;
   SELECT name INTO title FROM public.study_rooms WHERE id=p_room;
 ELSIF p_group IS NOT NULL THEN
   IF NOT public.is_group_member(p_group,caller) THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE='42501'; END IF;
   SELECT name INTO title FROM public.study_groups WHERE id=p_group;
 ELSE title:='Chamada entre amigos'; END IF;
 INSERT INTO public.voice_calls(created_by,room_id,group_id,title) VALUES(caller,p_room,p_group,left(title,120)) RETURNING id INTO call_id;
 INSERT INTO public.call_members(call_id,user_id) VALUES(call_id,caller);
 -- Explicit action by the caller; receiving an invitation never joins or opens media.
 FOR peer IN SELECT p.id FROM (
   SELECT m.user_id FROM public.study_room_participants m WHERE m.room_id=p_room AND m.last_seen_at>now()-interval '3 minutes'
   UNION SELECT g.user_id FROM public.group_members g WHERE g.group_id=p_group) eligible
   JOIN public.profiles p ON p.id=eligible.user_id
   WHERE p.id<>caller AND p.status IN ('online','studying') LOOP
   IF public.can_invite_to_call(call_id,caller,peer.id) THEN PERFORM public.invite_voice_peer(call_id,peer.id); END IF;
 END LOOP;
 RETURN call_id;
END $$;

CREATE OR REPLACE FUNCTION public.set_call_dnd(p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid:=auth.uid(); until_at timestamptz;
BEGIN
 IF caller IS NULL OR p_mode NOT IN ('off','hour','today','manual') THEN RAISE EXCEPTION 'Opção inválida'; END IF;
 until_at:=CASE p_mode WHEN 'hour' THEN now()+interval '1 hour'
   WHEN 'today' THEN (date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo')+interval '1 day') AT TIME ZONE 'America/Sao_Paulo' ELSE NULL END;
 INSERT INTO public.call_preferences(user_id,dnd_until,dnd_manual) VALUES(caller,until_at,p_mode='manual')
 ON CONFLICT(user_id) DO UPDATE SET dnd_until=excluded.dnd_until,dnd_manual=excluded.dnd_manual;
 -- Existing ringing invitations also become silent, exactly once.
 IF p_mode<>'off' THEN
   WITH moved AS (UPDATE public.call_invites SET status='silent',responded_at=now()
     WHERE recipient_id=caller AND status='pending' RETURNING *)
   INSERT INTO public.notifications(user_id,sender_id,type,title,body,data) SELECT caller,sender_id,'missed_call','Ligação perdida','Você recebeu uma ligação durante Não perturbar.',
     jsonb_build_object('call_id',call_id,'sender_id',sender_id) FROM moved;
 END IF;
 RETURN jsonb_build_object('dnd_until',until_at,'dnd_manual',p_mode='manual','server_now',now());
END $$;

CREATE OR REPLACE FUNCTION public.voice_inbox()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid:=auth.uid(); incoming jsonb; preference jsonb;
BEGIN
 IF caller IS NULL THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE='42501'; END IF;
 WITH expired AS (UPDATE public.call_invites SET status='missed',responded_at=now()
   WHERE recipient_id=caller AND status='pending' AND expires_at<=now() RETURNING *)
 INSERT INTO public.notifications(user_id,sender_id,type,title,body,data) SELECT caller,sender_id,'missed_call','Ligação perdida','Uma ligação ficou sem resposta.',
   jsonb_build_object('call_id',call_id,'sender_id',sender_id) FROM expired
   WHERE NOT public.users_blocked(sender_id,caller);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'call_id',i.call_id,'sender_id',i.sender_id,
   'name',coalesce(p.display_name,p.username),'avatar_url',p.avatar_url,'title',c.title,'expires_at',i.expires_at)
   ORDER BY i.created_at),'[]'::jsonb) INTO incoming
   FROM public.call_invites i JOIN public.profiles p ON p.id=i.sender_id JOIN public.voice_calls c ON c.id=i.call_id
   WHERE i.recipient_id=caller AND i.status='pending' AND i.expires_at>now() AND public.can_invite_to_call(i.call_id,i.sender_id,caller)
   AND NOT EXISTS(SELECT 1 FROM public.call_preferences d WHERE d.user_id=caller AND (d.dnd_manual OR d.dnd_until>now()));
 SELECT to_jsonb(d) INTO preference FROM public.call_preferences d WHERE d.user_id=caller;
 RETURN jsonb_build_object('invites',incoming,'preferences',coalesce(preference,'{}'::jsonb),'server_now',now());
END $$;

CREATE OR REPLACE FUNCTION public.respond_voice_invite(p_invite uuid,p_accept boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid:=auth.uid(); i public.call_invites;
BEGIN
 SELECT * INTO i FROM public.call_invites WHERE id=p_invite AND recipient_id=caller;
 IF i.id IS NULL THEN RAISE EXCEPTION 'Convite indisponível' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('voice-invite:'||i.sender_id::text||i.recipient_id::text));
 SELECT * INTO i FROM public.call_invites WHERE id=p_invite AND recipient_id=caller FOR UPDATE;
 IF caller IS NULL OR i.id IS NULL OR i.status<>'pending' OR i.expires_at<=now()
   OR NOT public.can_invite_to_call(i.call_id,i.sender_id,caller) THEN RAISE EXCEPTION 'Convite indisponível' USING ERRCODE='42501'; END IF;
 IF p_accept THEN
   PERFORM 1 FROM public.voice_calls WHERE id=i.call_id FOR UPDATE;
   PERFORM pg_advisory_xact_lock(hashtext('voice-start:'||caller::text));
   IF EXISTS(SELECT 1 FROM public.call_members m WHERE m.user_id=caller AND m.call_id<>i.call_id AND public.is_call_member(m.call_id,caller)) THEN
     RAISE EXCEPTION 'Saia da chamada atual antes de atender'; END IF;
   IF (SELECT count(*) FROM public.call_members WHERE call_id=i.call_id AND public.is_call_member(call_id,user_id))>=6 THEN RAISE EXCEPTION 'A chamada está completa'; END IF;
   INSERT INTO public.call_members(call_id,user_id) VALUES(i.call_id,caller) ON CONFLICT(call_id,user_id)
     DO UPDATE SET left_at=NULL,last_seen_at=now(),muted=true,sharing=false,force_muted=false;
 END IF;
 UPDATE public.call_invites SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,responded_at=now() WHERE id=i.id;
 RETURN CASE WHEN p_accept THEN i.call_id ELSE NULL END;
END $$;

CREATE OR REPLACE FUNCTION public.voice_snapshot(p_call uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid:=auth.uid(); result jsonb;
BEGIN
 IF NOT public.is_call_member(p_call,caller) THEN RAISE EXCEPTION 'Chamada indisponível' USING ERRCODE='42501'; END IF;
 UPDATE public.call_members SET last_seen_at=now() WHERE call_id=p_call AND user_id=caller;
 SELECT jsonb_build_object('id',c.id,'title',c.title,'created_by',c.created_by,'room_id',c.room_id,'group_id',c.group_id,
   'can_moderate',public.can_moderate_call(p_call,caller),'server_now',now(),
   'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(p.display_name,p.username),
     'avatar_url',p.avatar_url,'muted',m.muted,'force_muted',m.force_muted,'sharing',m.sharing)),'[]'::jsonb)
     FROM public.call_members m JOIN public.profiles p ON p.id=m.user_id WHERE m.call_id=p_call AND public.is_call_member(p_call,m.user_id)),
   'candidates',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',p.id,'name',coalesce(p.display_name,p.username),'avatar_url',p.avatar_url,
     'online',p.status IN ('online','studying'),'friend',public.is_friend(caller,p.id),
     'source_member',(c.group_id IS NOT NULL AND public.is_group_member(c.group_id,p.id)) OR (c.room_id IS NOT NULL AND public.is_study_room_participant(c.room_id,p.id)),
     'next_at',(SELECT max(i.responded_at)+interval '30 seconds' FROM public.call_invites i WHERE i.sender_id=caller AND i.recipient_id=p.id AND i.status='declined'))),'[]'::jsonb)
     FROM (SELECT CASE WHEN f.user_id=caller THEN f.friend_id ELSE f.user_id END AS user_id
       FROM public.friendships f WHERE f.status='accepted' AND caller IN (f.user_id,f.friend_id)
       UNION SELECT g.user_id FROM public.group_members g WHERE g.group_id=c.group_id
       UNION SELECT r.user_id FROM public.study_room_participants r WHERE r.room_id=c.room_id) eligible
     JOIN public.profiles p ON p.id=eligible.user_id
     WHERE public.can_invite_to_call(p_call,caller,p.id))) INTO result FROM public.voice_calls c WHERE c.id=p_call;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.update_voice_member(p_call uuid,p_muted boolean,p_sharing boolean,p_leave boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid:=auth.uid();
BEGIN
 IF p_leave THEN UPDATE public.call_members SET left_at=now(),muted=true,sharing=false WHERE call_id=p_call AND user_id=caller;
 ELSIF public.is_call_member(p_call,caller) THEN
   UPDATE public.call_members SET muted=(p_muted OR force_muted),sharing=p_sharing,last_seen_at=now() WHERE call_id=p_call AND user_id=caller;
 ELSE RAISE EXCEPTION 'Chamada indisponível' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.call_members WHERE call_id=p_call AND public.is_call_member(call_id,user_id)) THEN
   UPDATE public.voice_calls SET ended_at=now() WHERE id=p_call; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.moderate_voice_member(p_call uuid,p_user uuid,p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_moderate_call(p_call,auth.uid()) OR p_action NOT IN ('mute','allow','remove') OR p_user=auth.uid() THEN
   RAISE EXCEPTION 'Sem acesso' USING ERRCODE='42501'; END IF;
 UPDATE public.call_members SET force_muted=(p_action='mute'),muted=CASE WHEN p_action='mute' THEN true ELSE muted END,
   kicked=(p_action='remove'),left_at=CASE WHEN p_action='remove' THEN now() ELSE left_at END,
   sharing=CASE WHEN p_action='remove' THEN false ELSE sharing END WHERE call_id=p_call AND user_id=p_user;
END $$;
CREATE OR REPLACE FUNCTION public.send_voice_signal(p_call uuid,p_recipient uuid,p_kind text,p_payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid:=auth.uid();
BEGIN
 IF caller IS NULL OR caller=p_recipient OR NOT public.is_call_member(p_call,caller)
   OR NOT public.is_call_member(p_call,p_recipient) OR p_kind NOT IN ('offer','answer','ice')
   OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>16000 THEN
   RAISE EXCEPTION 'Sinalização indisponível' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('voice-signal:'||caller::text));
 IF (SELECT count(*) FROM public.call_signals WHERE sender_id=caller AND created_at>now()-interval '1 minute')>=240 THEN
   RAISE EXCEPTION 'Aguarde para reconectar'; END IF;
 DELETE FROM public.call_signals WHERE created_at<now()-interval '90 seconds';
 INSERT INTO public.call_signals(call_id,sender_id,recipient_id,kind,payload) VALUES(p_call,caller,p_recipient,p_kind,p_payload);
END $$;

-- Private Realtime channel authorization. Signals themselves are trusted database rows,
-- never arbitrary broadcast payloads with a client-supplied sender identity.
CREATE OR REPLACE FUNCTION public.voice_topic_allowed(p_topic text,p_user uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF p_topic !~ '^voice:[0-9a-f-]{36}$' THEN RETURN false; END IF;
 RETURN public.is_call_member(substring(p_topic FROM 7)::uuid,p_user);
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END $$;
DO $$ BEGIN
 IF to_regclass('realtime.messages') IS NOT NULL AND to_regprocedure('realtime.topic()') IS NOT NULL THEN
   EXECUTE 'DROP POLICY IF EXISTS voice_channel_read ON realtime.messages';
   EXECUTE 'CREATE POLICY voice_channel_read ON realtime.messages FOR SELECT TO authenticated USING (public.voice_topic_allowed(realtime.topic(),(SELECT auth.uid())))';
 END IF;
END $$;
-- Minimal explicit grants, including helpers used by policies; no direct mutation grants.
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname=ANY(ARRAY['is_call_member','can_invite_to_call','can_moderate_call','invite_voice_peer',
     'start_voice_call','set_call_dnd','voice_inbox','respond_voice_invite','voice_snapshot','update_voice_member','moderate_voice_member','send_voice_signal','voice_topic_allowed']) LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon',f);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f);
 END LOOP;
END $$;
