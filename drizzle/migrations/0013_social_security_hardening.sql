-- Additive repair of 0006–0012. Do not run against production from an agent.
-- Reapplying this migration is safe. No recursive membership policies.
CREATE OR REPLACE FUNCTION public.users_blocked(p_a uuid, p_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id = p_a AND b.blocked_id = p_b)
       OR (b.blocker_id = p_b AND b.blocked_id = p_a));
$$;
REVOKE ALL ON FUNCTION public.users_blocked(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.users_blocked(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_friend(p_user_a uuid, p_user_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT public.users_blocked(p_user_a, p_user_b) AND EXISTS (
    SELECT 1 FROM public.friendships WHERE status = 'accepted'
      AND ((user_id = p_user_a AND friend_id = p_user_b)
        OR (friend_id = p_user_a AND user_id = p_user_b)));
$$;
REVOKE ALL ON FUNCTION public.is_friend(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_friend(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS profiles_select_friends_or_groups ON public.profiles;
CREATE POLICY profiles_select_friends_or_groups ON public.profiles FOR SELECT TO authenticated
USING (NOT public.users_blocked((SELECT auth.uid()), id) AND (
  public.has_friendship_relation((SELECT auth.uid()), id)
  OR EXISTS (SELECT 1 FROM public.group_members g WHERE g.user_id = profiles.id
    AND public.is_group_member(g.group_id, (SELECT auth.uid())))
));

-- An accepted code is an explicit invitation, never a public SELECT of private groups.
CREATE TABLE IF NOT EXISTS public.group_invitations (
  group_id uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
ALTER TABLE public.group_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invitations_read_own ON public.group_invitations;
CREATE POLICY invitations_read_own ON public.group_invitations FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
GRANT SELECT ON public.group_invitations TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.group_invitations FROM authenticated;
DROP POLICY IF EXISTS group_members_insert ON public.group_members;
CREATE POLICY group_members_insert ON public.group_members FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND role = 'admin' AND EXISTS (
  SELECT 1 FROM public.study_groups g WHERE g.id = group_id AND g.created_by = (SELECT auth.uid())
));

CREATE OR REPLACE FUNCTION public.join_study_group(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE g public.study_groups; caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501'; END IF;
  IF length(trim(p_code)) NOT BETWEEN 6 AND 32 THEN RAISE EXCEPTION 'Convite inválido'; END IF;
  SELECT * INTO g FROM public.study_groups WHERE invite_code = upper(trim(p_code)) FOR UPDATE;
  IF g.id IS NULL OR public.users_blocked(caller, g.created_by) THEN
    RAISE EXCEPTION 'Convite inválido';
  END IF;
  INSERT INTO public.group_invitations(group_id, user_id) VALUES(g.id, caller) ON CONFLICT DO NOTHING;
  INSERT INTO public.group_members(group_id, user_id, role)
    VALUES(g.id, caller, CASE WHEN g.created_by = caller THEN 'admin' ELSE 'member' END)
    ON CONFLICT DO NOTHING;
  RETURN to_jsonb(g);
END;
$$;
REVOKE ALL ON FUNCTION public.join_study_group(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_study_group(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_study_room_accessible(p_room_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.study_rooms r WHERE r.id = p_room_id AND r.closed_at IS NULL
    AND NOT public.users_blocked(r.created_by, p_user_id)
    AND (NOT r.is_private OR r.created_by = p_user_id
      OR (r.group_id IS NOT NULL AND public.is_group_member(r.group_id, p_user_id))
      OR public.is_friend(r.created_by, p_user_id)
      OR public.is_study_room_participant(r.id, p_user_id)));
$$;
ALTER TABLE public.study_rooms ALTER COLUMN is_private SET DEFAULT true;
DROP POLICY IF EXISTS study_rooms_select ON public.study_rooms;
CREATE POLICY study_rooms_select ON public.study_rooms FOR SELECT TO authenticated
USING (public.is_study_room_accessible(id, (SELECT auth.uid())));
DROP POLICY IF EXISTS study_room_participants_select ON public.study_room_participants;
CREATE POLICY study_room_participants_select ON public.study_room_participants FOR SELECT TO authenticated
USING (public.is_study_room_accessible(room_id, (SELECT auth.uid()))
  AND NOT public.users_blocked(user_id, (SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.guard_room_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION 'A identidade da sala não pode mudar' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS DISTINCT FROM OLD.created_by AND (
    NEW.is_private IS DISTINCT FROM OLD.is_private OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
    OR NEW.name IS DISTINCT FROM OLD.name OR NEW.max_participants IS DISTINCT FROM OLD.max_participants
    OR NEW.topic IS DISTINCT FROM OLD.topic) THEN
    RAISE EXCEPTION 'Somente o dono pode alterar a sala' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_room_update ON public.study_rooms;
CREATE TRIGGER guard_room_update BEFORE UPDATE ON public.study_rooms
FOR EACH ROW EXECUTE FUNCTION public.guard_room_update();

CREATE OR REPLACE FUNCTION public.guard_participant_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.room_id IS DISTINCT FROM OLD.room_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'A participação não pode ser transferida' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_participant_update ON public.study_room_participants;
CREATE TRIGGER guard_participant_update BEFORE UPDATE ON public.study_room_participants
FOR EACH ROW EXECUTE FUNCTION public.guard_participant_update();

-- Invites may only become accepted through the recipient's atomic RPC.
REVOKE UPDATE ON public.friendships FROM authenticated;
DROP POLICY IF EXISTS friendships_insert ON public.friendships;
CREATE POLICY friendships_insert ON public.friendships FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'pending'
  AND NOT public.users_blocked(user_id, friend_id));
DROP POLICY IF EXISTS friendships_select ON public.friendships;
CREATE POLICY friendships_select ON public.friendships FOR SELECT TO authenticated
USING ((SELECT auth.uid()) IN (user_id, friend_id) AND NOT public.users_blocked(user_id, friend_id));

-- The sender's name and timestamp are server-owned, even with a direct INSERT.
CREATE OR REPLACE FUNCTION public.guard_room_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid();
BEGIN
  IF caller IS NULL OR NEW.user_id IS DISTINCT FROM caller
    OR NOT public.is_study_room_accessible(NEW.room_id, caller) THEN
    RAISE EXCEPTION 'Sem acesso à sala' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('room-message:' || caller::text));
  IF (SELECT count(*) FROM public.study_room_messages WHERE user_id = caller
    AND created_at > now() - interval '1 minute') >= 20 THEN
    RAISE EXCEPTION 'Aguarde um minuto antes de enviar mais mensagens' USING ERRCODE = 'P0001';
  END IF;
  SELECT username, coalesce(display_name, username) INTO NEW.sender_username, NEW.sender_display_name
    FROM public.profiles WHERE id = caller;
  IF NEW.sender_username IS NULL THEN RAISE EXCEPTION 'Complete seu perfil'; END IF;
  NEW.content := trim(NEW.content);
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_room_message ON public.study_room_messages;
CREATE TRIGGER guard_room_message BEFORE INSERT ON public.study_room_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_room_message();
DROP POLICY IF EXISTS participants_can_read_room_messages ON public.study_room_messages;
CREATE POLICY participants_can_read_room_messages ON public.study_room_messages FOR SELECT TO authenticated
USING (public.is_study_room_accessible(room_id, (SELECT auth.uid()))
  AND NOT public.users_blocked(user_id, (SELECT auth.uid())) AND created_at > now() - interval '24 hours');

-- The old RPC used SECURITY DEFINER without checking room access. The trigger now
-- validates all writes, including calls to that backwards-compatible signature.
REVOKE ALL ON FUNCTION public.send_room_message(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_room_message(uuid, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.cleanup_old_room_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_room_messages() TO service_role;

CREATE INDEX IF NOT EXISTS idx_dm_sender_rate ON public.direct_messages(sender_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.guard_direct_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caller uuid := auth.uid(); sender_name text;
BEGIN
  IF caller IS NULL OR caller IS DISTINCT FROM NEW.sender_id
    OR NOT public.is_friend(caller, NEW.recipient_id) THEN
    RAISE EXCEPTION 'Mensagens só estão disponíveis entre amigos' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('direct-message:' || caller::text));
  IF (SELECT count(*) FROM public.direct_messages WHERE sender_id = caller
    AND created_at > now() - interval '1 minute') >= 20 THEN
    RAISE EXCEPTION 'Aguarde um minuto antes de enviar mais mensagens';
  END IF;
  NEW.created_at := now(); NEW.read_at := NULL; NEW.content := trim(NEW.content);
  SELECT coalesce(display_name, username) INTO sender_name FROM public.profiles WHERE id = caller;
  INSERT INTO public.notifications(user_id, sender_id, type, title, body, data)
    VALUES(NEW.recipient_id, caller, 'direct_message', 'Nova mensagem',
      coalesce(sender_name, 'Seu amigo') || ' enviou uma mensagem.', jsonb_build_object('friend_id', caller));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_direct_message ON public.direct_messages;
CREATE TRIGGER guard_direct_message BEFORE INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_direct_message();
DROP POLICY IF EXISTS dm_select_participants ON public.direct_messages;
CREATE POLICY dm_select_participants ON public.direct_messages FOR SELECT TO authenticated
USING ((SELECT auth.uid()) IN (sender_id, recipient_id) AND public.is_friend(sender_id, recipient_id));
DROP POLICY IF EXISTS dm_update_recipient_read ON public.direct_messages;
CREATE POLICY dm_update_recipient_read ON public.direct_messages FOR UPDATE TO authenticated
USING (recipient_id = (SELECT auth.uid()) AND public.is_friend(sender_id, recipient_id))
WITH CHECK (recipient_id = (SELECT auth.uid()) AND public.is_friend(sender_id, recipient_id));
REVOKE UPDATE ON public.direct_messages FROM authenticated;
GRANT UPDATE(read_at) ON public.direct_messages TO authenticated;
REVOKE INSERT, UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE(read) ON public.notifications TO authenticated;
DROP POLICY IF EXISTS notifications_insert_sender ON public.notifications;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN ('friend_request', 'friend_accepted', 'room_invite', 'year_rollover', 'system',
    'direct_message', 'missed_call', 'game_challenge')
);

-- Avoid granting new SECURITY DEFINER entry points to PUBLIC implicitly.
REVOKE ALL ON FUNCTION public.guard_room_update(), public.guard_room_message(),
  public.guard_direct_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_user_exact(text), public.check_username_available(text),
  public.save_student_onboarding(text,text,text,text,integer[],text[]),
  public.advance_school_year(text), public.respond_friend_request(uuid,boolean),
  public.send_friend_request_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_user_exact(text), public.check_username_available(text),
  public.save_student_onboarding(text,text,text,text,integer[],text[]),
  public.advance_school_year(text), public.respond_friend_request(uuid,boolean),
  public.send_friend_request_v2(uuid) TO authenticated;

-- pg_cron is optional; do not install extensions or configure a production scheduler.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gstudy-chat-retention') THEN
      PERFORM cron.schedule('gstudy-chat-retention', '0 * * * *', 'select public.cleanup_old_room_messages()');
    END IF;
  END IF;
END $$;
