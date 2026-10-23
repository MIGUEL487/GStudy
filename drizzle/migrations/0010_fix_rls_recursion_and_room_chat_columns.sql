-- Migration 0010: Correção de recursão infinita de RLS e validação de acessibilidade em salas, grupos e chat
-- Como aplicar: Execute no SQL Editor do Supabase Dashboard após as migrações 0006, 0007, 0008 e 0009.
-- Requisitos: Idempotente (drop policy if exists, create or replace), funções SECURITY DEFINER com search_path = ''.

-- 1. Funções auxiliares SECURITY DEFINER para evitar recursão infinita em policies
CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_friend(p_user_a uuid, p_user_b uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((user_id = p_user_a AND friend_id = p_user_b)
        OR (friend_id = p_user_a AND user_id = p_user_b))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_study_room_participant(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_room_participants
    WHERE room_id = p_room_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_study_room_accessible(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.study_rooms r
    WHERE r.id = p_room_id
      AND r.closed_at IS NULL
      AND (
        r.is_private = false
        OR r.created_by = p_user_id
        OR (r.group_id IS NOT NULL AND public.is_group_member(r.group_id, p_user_id))
        OR public.is_friend(r.created_by, p_user_id)
        OR public.is_study_room_participant(p_room_id, p_user_id)
      )
  );
$$;

-- 2. Grants das funções auxiliares
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_friend(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_study_room_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_study_room_accessible(uuid, uuid) TO authenticated;

-- 3. Atualizar políticas de group_members e study_groups (elimina recursão de grupos)
DROP POLICY IF EXISTS "group_members_select" ON public.group_members;
CREATE POLICY "group_members_select" ON public.group_members
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_group_member(group_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "groups_select" ON public.study_groups;
CREATE POLICY "groups_select" ON public.study_groups
  FOR SELECT TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR public.is_group_member(id, (SELECT auth.uid()))
  );

-- 4. Atualizar políticas de profiles (elimina recursão de amizades e grupos)
DROP POLICY IF EXISTS "profiles_select_friends_or_groups" ON public.profiles;
CREATE POLICY "profiles_select_friends_or_groups" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_friend((SELECT auth.uid()), id)
    OR EXISTS (
      SELECT 1 FROM public.group_members gm_them
      WHERE gm_them.user_id = profiles.id
        AND public.is_group_member(gm_them.group_id, (SELECT auth.uid()))
    )
  );

-- 5. Atualizar políticas de study_rooms e study_room_participants (elimina recursão de salas)
DROP POLICY IF EXISTS "study_rooms_select" ON public.study_rooms;
CREATE POLICY "study_rooms_select" ON public.study_rooms
  FOR SELECT TO authenticated
  USING (
    closed_at IS NULL AND (
      is_private = false
      OR created_by = (SELECT auth.uid())
      OR (group_id IS NOT NULL AND public.is_group_member(group_id, (SELECT auth.uid())))
      OR public.is_friend(created_by, (SELECT auth.uid()))
      OR public.is_study_room_participant(id, (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "study_rooms_update" ON public.study_rooms;
CREATE POLICY "study_rooms_update" ON public.study_rooms
  FOR UPDATE TO authenticated
  USING (
    created_by = (SELECT auth.uid())
    OR public.is_study_room_participant(id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "study_room_participants_select" ON public.study_room_participants;
CREATE POLICY "study_room_participants_select" ON public.study_room_participants
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_study_room_participant(study_room_participants.room_id, (SELECT auth.uid()))
    OR public.is_study_room_accessible(study_room_participants.room_id, (SELECT auth.uid()))
  );

-- 6. Atualizar políticas de mensagens de chat em study_room_messages (compatibilidade de colunas e sem recursão)
DROP POLICY IF EXISTS "participants_can_read_room_messages" ON public.study_room_messages;
CREATE POLICY "participants_can_read_room_messages" ON public.study_room_messages
  FOR SELECT TO authenticated
  USING (
    public.is_study_room_accessible(study_room_messages.room_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "participants_can_send_messages" ON public.study_room_messages;
CREATE POLICY "participants_can_send_messages" ON public.study_room_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.is_study_room_accessible(study_room_messages.room_id, (SELECT auth.uid()))
  );
