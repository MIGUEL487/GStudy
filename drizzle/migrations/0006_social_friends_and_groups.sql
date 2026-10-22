-- Migração 0006: Perfis, Amigos, Grupos de Estudo, Bloqueios e Denúncias
-- Suporta o módulo social sob a feature flag VITE_FEATURE_SOCIAL
-- Como aplicar: Execute via Supabase SQL Editor ou migrations CLI no projeto de desenvolvimento/teste.

-- 1. Tabela profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'studying', 'busy')),
  bio text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT username_format CHECK (username = lower(username) AND username ~ '^[a-z0-9_]{3,20}$')
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (username);

-- 2. Tabela friendships (amizades bilaterais)
CREATE TABLE IF NOT EXISTS public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendships_not_self CHECK (user_id != friend_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_unique_pair
  ON public.friendships (least(user_id, friend_id), greatest(user_id, friend_id));

CREATE INDEX IF NOT EXISTS idx_friendships_user_status ON public.friendships (user_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_status ON public.friendships (friend_id, status);

-- 3. Tabela study_groups (grupos de estudo)
CREATE TABLE IF NOT EXISTS public.study_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_private boolean NOT NULL DEFAULT true,
  invite_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_study_groups_invite_code ON public.study_groups (invite_code);
CREATE INDEX IF NOT EXISTS idx_study_groups_created_by ON public.study_groups (created_by);

-- 4. Tabela group_members (membros dos grupos)
CREATE TABLE IF NOT EXISTS public.group_members (
  group_id uuid NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user ON public.group_members (user_id);

-- 5. Tabela user_blocks (bloqueio entre usuários)
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_not_self CHECK (blocker_id != blocked_id),
  CONSTRAINT unique_user_block UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_lookup ON public.user_blocks (blocker_id, blocked_id);

-- 6. Tabela user_reports (denúncia de usuário)
CREATE TABLE IF NOT EXISTS public.user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON public.user_reports (reporter_id);

-- 7. Tabela user_search_audit (rate limit de 10 buscas/minuto por usuário)
CREATE TABLE IF NOT EXISTS public.user_search_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  searched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_search_audit_rate
  ON public.user_search_audit (user_id, searched_at);

-- 8. Trigger para criar profile básico ao registrar usuário em auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  base_username text;
  final_username text;
  idx int := 1;
BEGIN
  -- Tenta pegar username dos metadados ou do e-mail
  base_username := lower(coalesce(
    new.raw_user_meta_data->>'username',
    split_part(coalesce(new.email, 'aluno'), '@', 1)
  ));
  -- Sanitiza para ^[a-z0-9_]{3,20}$
  base_username := regexp_replace(base_username, '[^a-z0-9_]', '_', 'g');
  IF length(base_username) < 3 THEN
    base_username := rpad(base_username, 3, '0');
  ELSIF length(base_username) > 16 THEN
    base_username := substring(base_username from 1 for 16);
  END IF;

  final_username := base_username;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    final_username := base_username || '_' || idx;
    idx := idx + 1;
  END LOOP;

  INSERT INTO public.profiles (id, username, display_name, avatar_url, status)
  VALUES (
    new.id,
    final_username,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', final_username),
    new.raw_user_meta_data->>'avatar_url',
    'online'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- 9. RPC de busca exata com rate limit (10 buscas/min) e proteção de privacidade
CREATE OR REPLACE FUNCTION public.search_user_exact(query_term text)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  recent_count int;
  clean_query text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  -- Checa rate limit: máximo de 10 buscas no último minuto
  SELECT count(*)
  INTO recent_count
  FROM public.user_search_audit
  WHERE user_id = caller_id
    AND searched_at > now() - interval '1 minute';

  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'Limite de buscas excedido. Aguarde um minuto.';
  END IF;

  -- Registra busca no log de auditoria
  INSERT INTO public.user_search_audit (user_id, searched_at)
  VALUES (caller_id, now());

  clean_query := lower(trim(query_term));
  IF starts_with(clean_query, '@') THEN
    clean_query := substring(clean_query from 2);
  END IF;

  IF clean_query = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE (p.username = clean_query OR lower(u.email) = clean_query)
    AND p.id != caller_id
    -- Não retorna se houver bloqueio entre as partes
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_id = caller_id AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = caller_id)
    )
  LIMIT 1;
END;
$$;

-- 10. Grants mínimos
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_blocks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_reports TO authenticated;
GRANT SELECT, INSERT ON public.user_search_audit TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.search_user_exact(text) TO authenticated;

-- 11. Row-Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_search_audit ENABLE ROW LEVEL SECURITY;

-- Políticas de profiles:
-- Próprio perfil
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- Perfil de amigos aceitos ou membros do mesmo grupo (sem bloqueio)
CREATE POLICY "profiles_select_friends_or_groups" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    -- Amigos aceitos
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'accepted'
        AND ((f.user_id = auth.uid() AND f.friend_id = profiles.id)
          OR (f.friend_id = auth.uid() AND f.user_id = profiles.id))
    )
    OR
    -- Membros do mesmo grupo de estudos
    EXISTS (
      SELECT 1 FROM public.group_members gm_me
      JOIN public.group_members gm_them ON gm_them.group_id = gm_me.group_id
      WHERE gm_me.user_id = auth.uid()
        AND gm_them.user_id = profiles.id
    )
  );

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- Políticas de friendships:
CREATE POLICY "friendships_select" ON public.friendships
  FOR SELECT TO authenticated
  USING (
    (auth.uid() = user_id OR auth.uid() = friend_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id IN (friendships.user_id, friendships.friend_id))
         OR (b.blocked_id = auth.uid() AND b.blocker_id IN (friendships.user_id, friendships.friend_id))
    )
  );

CREATE POLICY "friendships_insert" ON public.friendships
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = friendships.friend_id)
         OR (b.blocked_id = auth.uid() AND b.blocker_id = friendships.friend_id)
    )
  );

CREATE POLICY "friendships_update" ON public.friendships
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "friendships_delete" ON public.friendships
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Políticas de study_groups e group_members:
CREATE POLICY "groups_select" ON public.study_groups
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = study_groups.id AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "groups_insert" ON public.study_groups
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "groups_update" ON public.study_groups
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "groups_delete" ON public.study_groups
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "group_members_select" ON public.group_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "group_members_insert" ON public.group_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "group_members_delete" ON public.group_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.study_groups sg
      WHERE sg.id = group_members.group_id AND sg.created_by = auth.uid()
    )
  );

-- Políticas de user_blocks e user_reports:
CREATE POLICY "blocks_manage_own" ON public.user_blocks
  FOR ALL TO authenticated
  USING (blocker_id = auth.uid())
  WITH CHECK (blocker_id = auth.uid());

CREATE POLICY "reports_insert_own" ON public.user_reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "search_audit_own" ON public.user_search_audit
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
