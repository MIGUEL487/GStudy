-- Execute uma vez no SQL Editor do banco do projeto Supabase.
begin;
create table if not exists public.notion_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_token text not null,
  workspace_name text not null default 'Notion',
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz
);
create table if not exists public.notion_pages (
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null,
  material_id uuid references public.study_materials(id) on delete set null,
  title text not null,
  source_url text not null,
  content text not null,
  subject text not null,
  date_events jsonb not null default '[]'::jsonb,
  last_edited_at timestamptz not null,
  imported_at timestamptz not null default now(),
  primary key (user_id, page_id)
);
alter table public.notion_connections enable row level security;
alter table public.notion_pages enable row level security;
revoke all on public.notion_connections, public.notion_pages from anon, public;
grant select, insert, update, delete on public.notion_connections, public.notion_pages to authenticated;
drop policy if exists "own notion connection" on public.notion_connections;
create policy "own notion connection" on public.notion_connections for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own notion pages" on public.notion_pages;
create policy "own notion pages" on public.notion_pages for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.import_notion_page(p_page_id uuid, p_title text, p_url text, p_content text, p_subject text, p_events jsonb, p_last_edited timestamptz)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare actor uuid := auth.uid(); material uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if length(p_content) > 200000 or length(p_title) > 120 or length(p_subject) > 100 or jsonb_typeof(p_events) <> 'array' then raise exception 'Invalid Notion import'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text || ':' || p_page_id::text, 0));
  select material_id into material from public.notion_pages where user_id = actor and page_id = p_page_id for update;
  if material is not null then
    update public.study_materials set title = p_title, memory = p_content, source = p_url, kind = 'notion' where id = material and user_id = actor;
    if not found then material := null; end if;
  end if;
  if material is null then
    insert into public.study_materials(user_id, title, kind, source, memory) values(actor, p_title, 'notion', p_url, p_content) returning id into material;
  end if;
  insert into public.notion_pages(user_id, page_id, material_id, title, source_url, content, subject, date_events, last_edited_at)
  values(actor, p_page_id, material, p_title, p_url, p_content, p_subject, p_events, p_last_edited)
  on conflict(user_id, page_id) do update set material_id = excluded.material_id, title = excluded.title, source_url = excluded.source_url, content = excluded.content, subject = excluded.subject, date_events = excluded.date_events, last_edited_at = excluded.last_edited_at, imported_at = now();
  update public.notion_connections set last_synced_at = now() where user_id = actor;
  return material;
end;
$$;
revoke all on function public.import_notion_page(uuid, text, text, text, text, jsonb, timestamptz) from public, anon;
grant execute on function public.import_notion_page(uuid, text, text, text, text, jsonb, timestamptz) to authenticated;
commit;
