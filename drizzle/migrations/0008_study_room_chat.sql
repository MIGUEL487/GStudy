-- Migration 0008: Chat em tempo real para salas de estudo (Study Room Chat)
-- Como aplicar: Execute no SQL Editor do Supabase Dashboard (Projeto de teste ou staging).
-- Requisitos: RLS estrita, sanitização de texto, rate limit de 20 msgs/minuto e retenção efêmera (24h).

create table if not exists public.study_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.study_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sender_username text not null,
  sender_display_name text not null,
  content text not null check (char_length(trim(content)) > 0 and char_length(content) <= 500),
  created_at timestamptz not null default now()
);

-- Índices de consulta rápida por sala e por autor para rate limit
create index if not exists idx_study_room_messages_room_created
  on public.study_room_messages (room_id, created_at desc);

create index if not exists idx_study_room_messages_user_created
  on public.study_room_messages (user_id, created_at desc);

-- RLS
alter table public.study_room_messages enable row level security;

-- Política de leitura: somente participantes da sala ou salas públicas
create policy "participants_can_read_room_messages"
  on public.study_room_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.study_rooms r
      where r.id = study_room_messages.room_id
      and (
        r.is_private = false
        or r.created_by = (select auth.uid())
        or exists (
          select 1 from public.study_room_participants p
          where p.room_id = r.id and p.user_id = (select auth.uid())
        )
      )
    )
  );

-- Política de inserção direta com validação de autoria
create policy "participants_can_send_messages"
  on public.study_room_messages
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.study_rooms r
      where r.id = study_room_messages.room_id
      and (
        r.is_private = false
        or r.created_by = (select auth.uid())
        or exists (
          select 1 from public.study_room_participants p
          where p.room_id = r.id and p.user_id = (select auth.uid())
        )
      )
    )
  );

-- RPC segura de envio com rate limiting (20 msgs/minuto)
create or replace function public.send_room_message(
  p_room_id uuid,
  p_content text,
  p_sender_username text,
  p_sender_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_recent_count int;
  v_clean_text text;
  v_new_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Não autenticado.';
  end if;

  v_clean_text := trim(p_content);
  if char_length(v_clean_text) = 0 or char_length(v_clean_text) > 500 then
    raise exception 'A mensagem deve ter entre 1 e 500 caracteres.';
  end if;

  -- Rate limit: máx 20 msgs por minuto por usuário
  select count(*) into v_recent_count
  from public.study_room_messages
  where user_id = v_uid and created_at > (now() - interval '1 minute');

  if v_recent_count >= 20 then
    raise exception 'Limite de mensagens atingido. Aguarde alguns segundos antes de enviar novamente.';
  end if;

  insert into public.study_room_messages (
    room_id,
    user_id,
    sender_username,
    sender_display_name,
    content,
    created_at
  ) values (
    p_room_id,
    v_uid,
    coalesce(nullif(trim(p_sender_username), ''), 'estudante'),
    coalesce(nullif(trim(p_sender_display_name), ''), 'Estudante'),
    v_clean_text,
    now()
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

-- Função de limpeza de mensagens efêmeras com mais de 24 horas
create or replace function public.cleanup_old_room_messages()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  delete from public.study_room_messages
  where created_at < (now() - interval '24 hours');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Grants mínimos
grant select, insert on public.study_room_messages to authenticated;
grant execute on function public.send_room_message to authenticated;
grant execute on function public.cleanup_old_room_messages to authenticated;
