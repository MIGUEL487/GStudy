-- Execute completo no SQL Editor do mesmo Supabase do GStudy.
-- Aditivo: preserva notas, materiais, avaliações e históricos existentes.
begin;
alter table public.account_documents drop constraint if exists account_documents_namespace_check;
alter table public.account_documents add constraint account_documents_namespace_check
  check (namespace in ('workspace','learning','recall','attempts','socrates','quizzes'));

-- O novo namespace usa a mesma revisão atômica e as mesmas permissões da conta.
create or replace function public.sync_account_document(p_namespace text, p_revision bigint, p_document jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); current_row public.account_documents; begin
  if owner_id is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_namespace is null or p_namespace not in ('workspace','learning','recall','attempts','socrates','quizzes') or p_revision is null or p_revision < 0
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


commit;
