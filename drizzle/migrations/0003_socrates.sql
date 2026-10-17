-- Execute completo no SQL Editor do mesmo Supabase do GStudy.
-- Aditivo: preserva notas, materiais, avaliações e históricos existentes.
begin;
alter table public.account_documents drop constraint if exists account_documents_namespace_check;
alter table public.account_documents add constraint account_documents_namespace_check
  check (namespace in ('workspace','learning','recall','attempts','socrates'));

-- O novo namespace usa a mesma revisão atômica e as mesmas permissões da conta.
create or replace function public.sync_account_document(p_namespace text, p_revision bigint, p_document jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); current_row public.account_documents; begin
  if owner_id is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_namespace is null or p_namespace not in ('workspace','learning','recall','attempts','socrates') or p_revision is null or p_revision < 0
    or p_document is null or jsonb_typeof(p_document) <> 'object' or p_document->>'version' is distinct from '1' or octet_length(p_document::text) > 6000000
    then raise exception 'Documento de sincronização inválido.' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text || ':' || p_namespace, 0));
  select * into current_row from public.account_documents where user_id = owner_id and namespace = p_namespace for update;
  if found then
    if current_row.revision <> p_revision then return jsonb_build_object('applied',false,'revision',current_row.revision,'document',current_row.document); end if;
    update public.account_documents set document = p_document, revision = revision + 1, updated_at = now()
      where user_id = owner_id and namespace = p_namespace returning * into current_row;
  else
    if p_revision <> 0 then return jsonb_build_object('applied',false,'revision',0,'document',null); end if;
    insert into public.account_documents(user_id,namespace,document) values(owner_id,p_namespace,p_document) returning * into current_row;
  end if;
  return jsonb_build_object('applied',true,'revision',current_row.revision,'document',current_row.document);
end $$;
revoke all on function public.sync_account_document(text,bigint,jsonb) from public;
grant execute on function public.sync_account_document(text,bigint,jsonb) to authenticated;

create table if not exists public.socrates_token_ledger (
  ticket_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  reserved integer not null check (reserved between 1 and 50000),
  charged integer not null check (charged between 0 and reserved),
  settled boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists socrates_token_ledger_owner_day on public.socrates_token_ledger(user_id,day);
alter table public.socrates_token_ledger enable row level security;
revoke all on public.socrates_token_ledger from public, anon, authenticated;

create or replace function public.get_socrates_quota()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); today date := (now() at time zone 'America/Sao_Paulo')::date; spent integer; begin
  if owner_id is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select coalesce(sum(charged),0)::integer into spent from public.socrates_token_ledger where user_id=owner_id and day=today;
  return jsonb_build_object('limit',50000,'used',spent,'remaining',greatest(0,50000-spent),'day',today,
    'resetsAt',to_char(((today+1)::timestamp at time zone 'America/Sao_Paulo') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'));
end $$;

-- O servidor gera um ticket aleatório novo para cada chamada. Ele nunca vai ao navegador.
-- Sem o ticket original, um cliente não consegue estornar uma chamada feita pelo servidor.
create or replace function public.reserve_socrates_tokens(p_ticket uuid, p_reserved integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); today date := (now() at time zone 'America/Sao_Paulo')::date; spent integer; begin
  if owner_id is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_ticket is null or p_reserved is null or p_reserved not between 1 and 50000 then raise exception 'Reserva inválida.' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text || ':socrates:' || today::text,0));
  select coalesce(sum(charged),0)::integer into spent from public.socrates_token_ledger where user_id=owner_id and day=today;
  if spent+p_reserved>50000 then raise exception 'Sua cota de Sócrates está no fim. Abra uma nova conversa para reduzir o contexto ou aguarde a renovação à meia-noite de Brasília.' using errcode='P0001'; end if;
  insert into public.socrates_token_ledger(ticket_hash,user_id,day,reserved,charged)
    values(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_ticket::text,'UTF8')),'hex'),owner_id,today,p_reserved,p_reserved);
  return public.get_socrates_quota();
end $$;

create or replace function public.settle_socrates_tokens(p_ticket uuid,p_used integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); reservation public.socrates_token_ledger; begin
  if owner_id is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  select * into reservation from public.socrates_token_ledger
    where ticket_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_ticket::text,'UTF8')),'hex') and user_id=owner_id;
  if not found then raise exception 'Reserva não encontrada.' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text || ':socrates:' || reservation.day::text,0));
  select * into reservation from public.socrates_token_ledger where ticket_hash=reservation.ticket_hash for update;
  if p_used is null or p_used<0 or p_used>reservation.reserved then raise exception 'Consumo inválido.' using errcode='22023'; end if;
  if not reservation.settled then update public.socrates_token_ledger set charged=p_used,settled=true where ticket_hash=reservation.ticket_hash; end if;
  return public.get_socrates_quota();
end $$;
revoke all on function public.get_socrates_quota(),public.reserve_socrates_tokens(uuid,integer),public.settle_socrates_tokens(uuid,integer) from public;
grant execute on function public.get_socrates_quota(),public.reserve_socrates_tokens(uuid,integer),public.settle_socrates_tokens(uuid,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
