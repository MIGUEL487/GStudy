-- Execute este arquivo completo no SQL Editor do MESMO projeto Supabase do GStudy.
-- Aditivo: preserva os materiais, Notion, XP e dados existentes.
begin;

create table if not exists public.account_documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  namespace text not null check (namespace in ('workspace','learning','recall','attempts')),
  revision bigint not null default 1 check (revision > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, namespace)
);
alter table public.account_documents enable row level security;
drop policy if exists "read own account documents" on public.account_documents;
create policy "read own account documents" on public.account_documents for select to authenticated using (user_id = auth.uid());
revoke all on public.account_documents from anon, authenticated;
grant select on public.account_documents to authenticated;

create or replace function public.sync_account_document(p_namespace text, p_revision bigint, p_document jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); current_row public.account_documents; begin
  if owner_id is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_namespace is null or p_namespace not in ('workspace','learning','recall','attempts') or p_revision is null or p_revision < 0
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

create table if not exists public.app_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('review','suggestion')),
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 10 and 3000),
  is_anonymous boolean not null default true,
  display_name text not null check (char_length(display_name) between 1 and 100),
  owner_reply text check (char_length(owner_reply) between 1 and 3000),
  replied_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.review_votes (
  review_id uuid not null references public.app_reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value smallint not null check (value in (-1,1)),
  primary key (review_id,user_id)
);
create index if not exists app_reviews_created_idx on public.app_reviews(created_at desc);
create index if not exists app_reviews_user_idx on public.app_reviews(user_id,created_at desc);
alter table public.app_reviews enable row level security;
alter table public.review_votes enable row level security;
-- Não conceder SELECT direto: mesmo uma avaliação anônima tem um proprietário
-- interno. As funções abaixo retornam só os campos públicos e ocultam seu UUID.
revoke all on public.app_reviews, public.review_votes from anon, authenticated;

create or replace function public.is_gstudy_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users where id = auth.uid()
    and lower(email) = 'mi.c.openheimer@gmail.com' and email_confirmed_at is not null);
$$;
revoke all on function public.is_gstudy_owner() from public;
grant execute on function public.is_gstudy_owner() to authenticated;

create or replace function public.create_app_review(p_category text,p_rating integer,p_body text,p_anonymous boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); review_id uuid; profile_name text; begin
  if owner_id is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_category is null or p_category not in ('review','suggestion') or p_rating is null or p_rating not between 1 and 5
    or p_body is null or char_length(btrim(p_body)) not between 10 and 3000 or p_anonymous is null
    then raise exception 'Confira sua avaliação antes de enviar.' using errcode = '22023'; end if;
  select coalesce(nullif(btrim(d.document->>'name'),''),nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),'Estudante')
    into profile_name from auth.users u left join public.account_documents d on d.user_id=u.id and d.namespace='workspace' where u.id=owner_id;
  insert into public.app_reviews(user_id,category,rating,body,is_anonymous,display_name)
    values(owner_id,p_category,p_rating,btrim(p_body),p_anonymous,left(coalesce(profile_name,'Estudante'),100)) returning id into review_id;
  return review_id;
end $$;

create or replace function public.get_review_board(p_tab text default 'reviews',p_sort text default 'recent',p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); admin boolean := public.is_gstudy_owner(); rows jsonb; begin
  if owner_id is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_tab is null or p_tab not in ('reviews','mine','suggestions') or p_sort is null or p_sort not in ('recent','helpful') or p_offset is null or p_offset < 0 or p_offset > 100000
    then raise exception 'Filtro de avaliações inválido.' using errcode = '22023'; end if;
  if p_tab='suggestions' and not admin then raise exception 'Somente o responsável pode ver as sugestões recebidas.' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(item order by rank), '[]'::jsonb) into rows from (
    select jsonb_build_object('id',id,'category',category,'rating',rating,'body',body,'anonymous',is_anonymous,
      'author',case when is_anonymous then 'Anônimo' else display_name end,'isMine',user_id=owner_id,
      'createdAt',created_at,'reply',owner_reply,'repliedAt',replied_at,'up',up,'down',down,'myVote',my_vote) as item,
      row_number() over(order by case when p_sort='helpful' then up-down else 0 end desc,case when p_sort='helpful' then up else 0 end desc,created_at desc,id) as rank
    from (
      select r.*,count(v.user_id) filter(where v.value=1)::integer as up,count(v.user_id) filter(where v.value=-1)::integer as down,
        coalesce(max(v.value) filter(where v.user_id=owner_id),0)::integer as my_vote
      from public.app_reviews r left join public.review_votes v on v.review_id=r.id
      where (p_tab='reviews' and r.category='review') or (p_tab='mine' and r.user_id=owner_id) or (p_tab='suggestions' and admin and r.category='suggestion')
      group by r.id
    ) scored
    order by case when p_sort='helpful' then up-down else 0 end desc,case when p_sort='helpful' then up else 0 end desc,created_at desc,id
    limit 21 offset p_offset
  ) items;
  return jsonb_build_object('isAdmin',admin,'items',rows);
end $$;

create or replace function public.vote_app_review(p_review_id uuid,p_value integer)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); review public.app_reviews; begin
  if owner_id is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_value is null or p_value not in (-1,0,1) then raise exception 'Voto inválido.' using errcode = '22023'; end if;
  select * into review from public.app_reviews where id=p_review_id and category='review';
  if not found then raise exception 'Avaliação não encontrada.' using errcode = '22023'; end if;
  if review.user_id=owner_id then raise exception 'Você não pode votar na própria avaliação.' using errcode = '42501'; end if;
  if p_value=0 then delete from public.review_votes where review_id=p_review_id and user_id=owner_id;
  else insert into public.review_votes(review_id,user_id,value) values(p_review_id,owner_id,p_value)
    on conflict(review_id,user_id) do update set value=excluded.value; end if;
end $$;

create or replace function public.reply_app_review(p_review_id uuid,p_reply text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_gstudy_owner() then raise exception 'Somente o responsável pode responder.' using errcode = '42501'; end if;
  if p_reply is null or char_length(btrim(p_reply)) not between 1 and 3000 then raise exception 'Escreva uma resposta de até 3000 caracteres.' using errcode = '22023'; end if;
  update public.app_reviews set owner_reply=btrim(p_reply),replied_at=now() where id=p_review_id;
  if not found then raise exception 'Avaliação não encontrada.' using errcode = '22023'; end if;
end $$;

create or replace function public.delete_app_review(p_review_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  delete from public.app_reviews where id=p_review_id and user_id=auth.uid();
  if not found then raise exception 'Avaliação não encontrada na sua conta.' using errcode = '42501'; end if;
end $$;

revoke all on function public.create_app_review(text,integer,text,boolean),public.get_review_board(text,text,integer),public.vote_app_review(uuid,integer),public.reply_app_review(uuid,text),public.delete_app_review(uuid) from public;
grant execute on function public.create_app_review(text,integer,text,boolean),public.get_review_board(text,text,integer),public.vote_app_review(uuid,integer),public.reply_app_review(uuid,text),public.delete_app_review(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
