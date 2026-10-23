-- Migração 0012: Sessões, Mensagens Diretas (DM), Notificações e Correção de Adicionar Amigo
-- Bloco 3: Centralização de Sessões, Amigos, DMs e Notificações (GStudy)
-- Como aplicar: Execute via Supabase SQL Editor ou migrations CLI no projeto de desenvolvimento/teste.

-- 1. Função auxiliar para verificar qualquer relação de amizade (inclusive pendente) sem recursão
CREATE OR REPLACE FUNCTION public.has_friendship_relation(p_user_a uuid, p_user_b uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE (user_id = p_user_a AND friend_id = p_user_b)
       OR (friend_id = p_user_a AND user_id = p_user_b)
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_friendship_relation(uuid, uuid) TO authenticated;

-- 2. Atualizar política de profiles para permitir que parceiros de pedido de amizade (pending) visualizem o perfil mútuo
DROP POLICY IF EXISTS "profiles_select_friends_or_groups" ON public.profiles;
CREATE POLICY "profiles_select_friends_or_groups" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_friend((SELECT auth.uid()), id)
    OR public.has_friendship_relation((SELECT auth.uid()), id)
    OR EXISTS (
      SELECT 1 FROM public.group_members gm_them
      WHERE gm_them.user_id = profiles.id
        AND public.is_group_member(gm_them.group_id, (SELECT auth.uid()))
    )
  );

-- 3. Tabela direct_messages (chat 1:1 seguro entre amigos)
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dm_not_self CHECK (sender_id != recipient_id),
  CONSTRAINT dm_content_length CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_dm_pair_created
  ON public.direct_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_recipient_unread
  ON public.direct_messages (recipient_id, read_at) WHERE read_at IS NULL;

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dm_select_participants" ON public.direct_messages
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) IN (sender_id, recipient_id)
  );

CREATE POLICY "dm_insert_friends_only" ON public.direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = sender_id
    AND public.is_friend(sender_id, recipient_id)
  );

CREATE POLICY "dm_update_recipient_read" ON public.direct_messages
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = recipient_id)
  WITH CHECK ((SELECT auth.uid()) = recipient_id);

GRANT SELECT, INSERT, UPDATE ON public.direct_messages TO authenticated;

-- 4. Tabela notifications (central de alertas)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('friend_request', 'friend_accepted', 'room_invite', 'year_rollover', 'system')),
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON public.notifications (user_id, read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "notifications_insert_sender" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id IS NULL OR sender_id = (SELECT auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;

-- 5. RPC para envio confiável de pedido de amizade com criação automática de notificação
CREATE OR REPLACE FUNCTION public.send_friend_request_v2(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  sender_prof record;
  target_prof record;
  existing_f record;
  f_id uuid;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF caller_id = p_target_user_id THEN
    RAISE EXCEPTION 'Você não pode adicionar a si mesmo.';
  END IF;

  -- Checa bloqueios
  IF EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = caller_id AND blocked_id = p_target_user_id)
       OR (blocker_id = p_target_user_id AND blocked_id = caller_id)
  ) THEN
    RAISE EXCEPTION 'Não é possível enviar pedido de amizade para este usuário.';
  END IF;

  -- Busca perfil do remetente
  SELECT username, display_name INTO sender_prof
  FROM public.profiles WHERE id = caller_id;

  -- Busca perfil do destinatário
  SELECT username, display_name INTO target_prof
  FROM public.profiles WHERE id = p_target_user_id;

  IF target_prof.username IS NULL THEN
    RAISE EXCEPTION 'Usuário destinatário não encontrado.';
  END IF;

  -- Checa se já existe amizade ou pedido
  SELECT id, status INTO existing_f
  FROM public.friendships
  WHERE (user_id = caller_id AND friend_id = p_target_user_id)
     OR (user_id = p_target_user_id AND friend_id = caller_id);

  IF existing_f.id IS NOT NULL THEN
    IF existing_f.status = 'accepted' THEN
      RETURN jsonb_build_object('success', true, 'status', 'accepted', 'message', 'Vocês já são amigos.');
    ELSIF existing_f.status = 'pending' THEN
      RETURN jsonb_build_object('success', true, 'status', 'pending', 'message', 'Pedido já existente.');
    END IF;
  END IF;

  -- Insere o pedido de amizade
  INSERT INTO public.friendships (user_id, friend_id, status)
  VALUES (caller_id, p_target_user_id, 'pending')
  RETURNING id INTO f_id;

  -- Cria notificação para o destinatário
  INSERT INTO public.notifications (
    user_id,
    sender_id,
    type,
    title,
    body,
    data
  ) VALUES (
    p_target_user_id,
    caller_id,
    'friend_request',
    'Novo pedido de amizade',
    coalesce(sender_prof.display_name, sender_prof.username, 'Um estudante') || ' (@' || sender_prof.username || ') enviou um pedido de amizade.',
    jsonb_build_object('friendship_id', f_id, 'sender_id', caller_id, 'username', sender_prof.username)
  );

  RETURN jsonb_build_object('success', true, 'friendship_id', f_id, 'status', 'pending');
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_friend_request_v2(uuid) TO authenticated;

-- 6. RPC para responder pedido de amizade (aceitar ou recusar)
CREATE OR REPLACE FUNCTION public.respond_friend_request(p_friendship_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  f_row record;
  caller_prof record;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO f_row FROM public.friendships WHERE id = p_friendship_id;

  IF f_row.id IS NULL THEN
    RAISE EXCEPTION 'Pedido de amizade não encontrado.';
  END IF;

  -- Apenas o destinatário do pedido pode aceitar ou recusar
  IF f_row.friend_id != caller_id THEN
    RAISE EXCEPTION 'Não autorizado a responder este pedido.';
  END IF;

  IF p_accept THEN
    UPDATE public.friendships
    SET status = 'accepted', updated_at = now()
    WHERE id = p_friendship_id;

    SELECT username, display_name INTO caller_prof FROM public.profiles WHERE id = caller_id;

    -- Notifica quem enviou o pedido original
    INSERT INTO public.notifications (
      user_id,
      sender_id,
      type,
      title,
      body,
      data
    ) VALUES (
      f_row.user_id,
      caller_id,
      'friend_accepted',
      'Pedido aceito!',
      coalesce(caller_prof.display_name, caller_prof.username, 'Seu colega') || ' aceitou seu pedido de amizade.',
      jsonb_build_object('friendship_id', p_friendship_id, 'friend_id', caller_id)
    );

    RETURN jsonb_build_object('success', true, 'status', 'accepted');
  ELSE
    DELETE FROM public.friendships WHERE id = p_friendship_id;
    RETURN jsonb_build_object('success', true, 'status', 'rejected');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_friend_request(uuid, boolean) TO authenticated;
