// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "node:fs";
import * as path from "node:path";

describe("PostgreSQL Migrations & RLS Harness (PGlite)", () => {
  it("executa bootstrap do auth, aplica todas as migrações e valida RLS sem recursão", async () => {
    const db = new PGlite();

    // 1. Setup Auth Schema & Stub
    await db.exec(`
      create schema if not exists auth;

      create table if not exists auth.users (
        id uuid primary key,
        email text,
        raw_user_meta_data jsonb default '{}'::jsonb,
        email_confirmed_at timestamptz default now(),
        created_at timestamptz default now(),
        updated_at timestamptz default now(),
        role text default 'authenticated',
        is_anonymous boolean default false
      );

      create or replace function auth.uid() returns uuid as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ language sql stable;

      create or replace function auth.role() returns text as $$
        select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
      $$ language sql stable;

      do $$
      begin
        if not exists (select from pg_roles where rolname = 'anon') then
          create role anon;
        end if;
        if not exists (select from pg_roles where rolname = 'authenticated') then
          create role authenticated;
        end if;
        if not exists (select from pg_roles where rolname = 'service_role') then
          create role service_role;
        end if;
      end
      $$;

      grant usage on schema public to anon, authenticated, service_role;
      grant usage on schema auth to anon, authenticated, service_role;
      grant select on auth.users to anon, authenticated, service_role;
    `);

    // 2. Read all migrations
    const migrationsDir = path.resolve(process.cwd(), "drizzle/migrations");
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    console.log("Migrations detectadas:", migrationFiles);

    // Apply each migration in order
    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      try {
        await db.exec(sql);
      } catch (err: unknown) {
        console.error(`Falha ao aplicar migration ${file}:`, err);
        throw err;
      }
    }

    expect(migrationFiles.length).toBeGreaterThanOrEqual(10);

    // 3. Setup Test Users
    const userA = "11111111-1111-1111-1111-111111111111";
    const userB = "22222222-2222-2222-2222-222222222222";

    await db.exec(`
      insert into auth.users (id, email, raw_user_meta_data)
      values
        ('${userA}', 'usera@example.com', '{"full_name": "Usuário A"}'),
        ('${userB}', 'userb@example.com', '{"full_name": "Usuário B"}')
      on conflict (id) do nothing;
    `);

    // 4. Test RLS as User A: Create a public room and a private room
    await db.exec(`
      set role authenticated;
      set request.jwt.claim.sub = '${userA}';
      set request.jwt.claim.role = 'authenticated';
    `);

    const publicRoomId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const privateRoomId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    await db.exec(`
      insert into public.study_rooms (id, name, topic, created_by, is_private)
      values
        ('${publicRoomId}', 'Sala Pública A', 'Cálculo', '${userA}', false),
        ('${privateRoomId}', 'Sala Privada A', 'Segredo', '${userA}', true);

      insert into public.study_room_participants (room_id, user_id, current_goal)
      values
        ('${publicRoomId}', '${userA}', 'Resolver lista 1'),
        ('${privateRoomId}', '${userA}', 'Estudar prova');

      insert into public.study_room_messages (room_id, user_id, sender_username, sender_display_name, content)
      values
        ('${publicRoomId}', '${userA}', 'usera', 'Usuário A', 'Bem vindos à sala pública!'),
        ('${privateRoomId}', '${userA}', 'usera', 'Usuário A', 'Mensagem confidencial da sala privada.');
    `);

    // Verify User A can select their rooms and messages without infinite recursion
    const userARooms = await db.query(`select id, name from public.study_rooms order by name;`);
    expect(userARooms.rows.length).toBe(2);

    const userAParticipants = await db.query(
      `select room_id, user_id from public.study_room_participants;`,
    );
    expect(userAParticipants.rows.length).toBe(2);

    // 5. Test RLS as User B:
    await db.exec(`
      set role authenticated;
      set request.jwt.claim.sub = '${userB}';
      set request.jwt.claim.role = 'authenticated';
    `);

    // User B should ONLY see the public room, NOT the private room
    const userBRooms = await db.query(`select id, name, is_private from public.study_rooms;`);
    expect(userBRooms.rows.length).toBe(1);
    expect(userBRooms.rows[0].id).toBe(publicRoomId);

    // User B should only see messages from the public room
    const userBMessages = await db.query(
      `select id, room_id, content from public.study_room_messages;`,
    );
    expect(userBMessages.rows.length).toBe(1);
    expect(userBMessages.rows[0].room_id).toBe(publicRoomId);
    expect(userBMessages.rows[0].content).toContain("pública");

    // User B should only see participants from the public room
    const userBParticipants = await db.query(
      `select room_id, user_id from public.study_room_participants;`,
    );
    expect(userBParticipants.rows.length).toBe(1);
    expect(userBParticipants.rows[0].room_id).toBe(publicRoomId);

    // 6. User B joins the public room and posts a message
    await db.exec(`
      insert into public.study_room_participants (room_id, user_id, current_goal)
      values ('${publicRoomId}', '${userB}', 'Estudar junto');

      insert into public.study_room_messages (room_id, user_id, sender_username, sender_display_name, content)
      values ('${publicRoomId}', '${userB}', 'userb', 'Usuário B', 'Olá Usuário A, cheguei!');
    `);

    const publicMsgsCount = await db.query(
      `select count(*) as total from public.study_room_messages where room_id = '${publicRoomId}';`,
    );
    expect(Number(publicMsgsCount.rows[0].total)).toBe(2);

    console.log("PGlite harness concluído com sucesso: RLS e isolamento validados sem recursão!");
  }, 60000);
});
