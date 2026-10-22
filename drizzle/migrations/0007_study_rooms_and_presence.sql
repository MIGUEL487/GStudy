-- Migração 0007: Salas de Estudo Ao Vivo e Presença Compartilhada
-- Suporta o módulo de salas de estudo sob a feature flag VITE_FEATURE_SOCIAL

-- 1. Tabela study_rooms
CREATE TABLE IF NOT EXISTS public.study_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  topic text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.study_groups(id) ON DELETE CASCADE,
  is_private boolean NOT NULL DEFAULT false,
  max_participants int NOT NULL DEFAULT 8 CHECK (max_participants BETWEEN 2 AND 16),
  pomodoro_state jsonb NOT NULL DEFAULT '{"mode": "work", "remaining_seconds": 1500, "is_running": false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_study_rooms_active
  ON public.study_rooms (closed_at) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_study_rooms_creator
  ON public.study_rooms (created_by);
CREATE INDEX IF NOT EXISTS idx_study_rooms_group
  ON public.study_rooms (group_id);

-- 2. Tabela study_room_participants
CREATE TABLE IF NOT EXISTS public.study_room_participants (
  room_id uuid NOT NULL REFERENCES public.study_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  current_goal text,
  is_goal_completed boolean NOT NULL DEFAULT false,
  is_muted boolean NOT NULL DEFAULT true,
  is_camera_on boolean NOT NULL DEFAULT false,
  is_screen_sharing boolean NOT NULL DEFAULT false,
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_study_room_participants_user
  ON public.study_room_participants (user_id);

-- 3. Grants mínimos
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_room_participants TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- 4. Row-Level Security (RLS)
ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_room_participants ENABLE ROW LEVEL SECURITY;

-- Políticas de study_rooms
CREATE POLICY "study_rooms_select" ON public.study_rooms
  FOR SELECT TO authenticated
  USING (
    -- Salas abertas e acessíveis
    closed_at IS NULL AND (
      is_private = false
      OR created_by = auth.uid()
      OR (
        group_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = study_rooms.group_id AND gm.user_id = auth.uid()
        )
      )
      OR EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'accepted'
          AND ((f.user_id = study_rooms.created_by AND f.friend_id = auth.uid())
            OR (f.friend_id = study_rooms.created_by AND f.user_id = auth.uid()))
      )
    )
  );

CREATE POLICY "study_rooms_insert" ON public.study_rooms
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "study_rooms_update" ON public.study_rooms
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.study_room_participants p
      WHERE p.room_id = study_rooms.id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "study_rooms_delete" ON public.study_rooms
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- Políticas de study_room_participants:
-- Ninguém fora da sala vê participantes!
CREATE POLICY "study_room_participants_select" ON public.study_room_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.study_room_participants me
      WHERE me.room_id = study_room_participants.room_id AND me.user_id = auth.uid()
    )
  );

CREATE POLICY "study_room_participants_insert" ON public.study_room_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.study_rooms r
      WHERE r.id = study_room_participants.room_id AND r.closed_at IS NULL
    )
  );

CREATE POLICY "study_room_participants_update" ON public.study_room_participants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "study_room_participants_delete" ON public.study_room_participants
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.study_rooms r
      WHERE r.id = study_room_participants.room_id AND r.created_by = auth.uid()
    )
  );
