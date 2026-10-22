-- Migration 0009: Gamificação Social, Rankings e Conquistas em Grupo
-- Como aplicar: Execute no SQL Editor do Supabase Dashboard (Projeto de teste ou staging).
-- Requisitos: RLS estrita, privacidade por padrão (visibilidade pública/anônima/oculta), agregações semanais e conquistas.

-- 1. Coluna de visibilidade de ranking no perfil
alter table public.profiles
  add column if not exists ranking_visibility text not null default 'public'
  check (ranking_visibility in ('public', 'anonymous', 'hidden'));

-- 2. Registro de minutos de foco semanais
create table if not exists public.social_focus_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid references public.study_rooms(id) on delete set null,
  minutes integer not null check (minutes > 0 and minutes <= 300),
  created_at timestamptz not null default now()
);

create index if not exists idx_social_focus_logs_user_date
  on public.social_focus_logs (user_id, created_at desc);

alter table public.social_focus_logs enable row level security;

create policy "users_manage_own_focus_logs"
  on public.social_focus_logs
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 3. Conquistas sociais
create table if not exists public.social_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,
  title text not null,
  description text not null,
  icon text not null default 'trophy',
  unlocked_at timestamptz not null default now(),
  constraint uq_user_achievement unique (user_id, achievement_key)
);

create index if not exists idx_social_achievements_user
  on public.social_achievements (user_id, unlocked_at desc);

alter table public.social_achievements enable row level security;

create policy "users_read_own_or_friends_achievements"
  on public.social_achievements
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
      and ((f.user_id = (select auth.uid()) and f.friend_id = social_achievements.user_id)
        or (f.friend_id = (select auth.uid()) and f.user_id = social_achievements.user_id))
    )
  );

create policy "users_insert_own_achievements"
  on public.social_achievements
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- 4. Função segura de Leaderboard Semanal respeitando privacidade
create or replace function public.get_social_leaderboard(
  p_scope text,
  p_group_id uuid default null
)
returns table (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  weekly_focus_minutes bigint,
  rank_position bigint,
  is_current_user boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_week_start timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Não autenticado.';
  end if;

  v_week_start := date_trunc('week', now());

  return query
  with candidate_users as (
    -- Escopo de amigos aceitos + o próprio usuário
    select v_uid as uid
    union
    select
      case when f.user_id = v_uid then f.friend_id else f.user_id end as uid
    from public.friendships f
    where p_scope = 'friends'
      and f.status = 'accepted'
      and (f.user_id = v_uid or f.friend_id = v_uid)
    union
    -- Escopo de grupo
    select gm.user_id as uid
    from public.group_members gm
    where p_scope = 'group'
      and gm.group_id = p_group_id
      and exists (
        select 1 from public.group_members my_gm
        where my_gm.group_id = p_group_id and my_gm.user_id = v_uid
      )
  ),
  aggregated_focus as (
    select
      cu.uid,
      coalesce(sum(fl.minutes), 0) as focus_minutes
    from candidate_users cu
    left join public.social_focus_logs fl
      on fl.user_id = cu.uid
      and fl.created_at >= v_week_start
    group by cu.uid
  ),
  ranked as (
    select
      p.id as r_user_id,
      case
        when p.ranking_visibility = 'anonymous' and p.id <> v_uid then 'Estudante Anônimo'
        else p.display_name
      end as r_display_name,
      case
        when p.ranking_visibility = 'anonymous' and p.id <> v_uid then 'anonimo'
        else p.username
      end as r_username,
      case
        when p.ranking_visibility = 'anonymous' and p.id <> v_uid then null
        else p.avatar_url
      end as r_avatar_url,
      af.focus_minutes as r_weekly_focus_minutes,
      row_number() over (order by af.focus_minutes desc, p.created_at asc) as r_rank,
      (p.id = v_uid) as r_is_me,
      p.ranking_visibility
    from aggregated_focus af
    join public.profiles p on p.id = af.uid
    where p.ranking_visibility <> 'hidden' or p.id = v_uid
  )
  select
    r.r_user_id,
    r.r_display_name,
    r.r_username,
    r.r_avatar_url,
    r.r_weekly_focus_minutes,
    r.r_rank,
    r.r_is_me
  from ranked r
  order by r.r_rank asc
  limit 50;
end;
$$;

-- 5. RPC para registrar conclusão de sessão de foco em sala com concessão de conquista
create or replace function public.record_room_focus_session(
  p_room_id uuid,
  p_minutes integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_total_sessions int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Não autenticado.';
  end if;

  if p_minutes <= 0 or p_minutes > 300 then
    raise exception 'Minutos inválidos para registro.';
  end if;

  insert into public.social_focus_logs (user_id, room_id, minutes, created_at)
  values (v_uid, p_room_id, p_minutes, now());

  -- Checagem de conquista: Primeira sessão em grupo
  select count(*) into v_total_sessions
  from public.social_focus_logs
  where user_id = v_uid and room_id is not null;

  if v_total_sessions >= 1 then
    insert into public.social_achievements (user_id, achievement_key, title, description, icon)
    values (
      v_uid,
      'first_group_session',
      'Primeiro Foco Coletivo',
      'Participou e concluiu seu primeiro bloco de foco em uma sala de estudo.',
      'users'
    )
    on conflict (user_id, achievement_key) do nothing;
  end if;
end;
$$;

-- Grants mínimos
grant select, insert, update, delete on public.social_focus_logs to authenticated;
grant select, insert on public.social_achievements to authenticated;
grant execute on function public.get_social_leaderboard to authenticated;
grant execute on function public.record_room_focus_session to authenticated;
