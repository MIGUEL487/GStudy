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

    // Exercise actual PostgreSQL grants, policies and triggers with two identities.
    await expect(
      db.exec(`update public.study_rooms set created_by = '${userB}' where id = '${publicRoomId}'`),
    ).rejects.toThrow();
    await expect(
      db.exec(`update public.study_rooms set is_private = true where id = '${publicRoomId}'`),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `update public.study_room_participants set room_id = '${privateRoomId}' where user_id = '${userB}'`,
      ),
    ).rejects.toThrow();
    await expect(
      db.query(`select public.send_room_message('${privateRoomId}', 'intrusão', 'falso', 'falso')`),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `insert into public.direct_messages(sender_id, recipient_id, content) values('${userB}', '${userA}', 'sem amizade')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `insert into public.notifications(user_id, type, title, body) values('${userA}', 'system', 'falso', 'falso')`,
      ),
    ).rejects.toThrow();

    await db.exec(`set request.jwt.claim.sub = '${userA}'`);
    await db.query(`select public.send_friend_request_v2('${userB}')`);
    await db.query(`select public.send_friend_request_v2('${userB}')`);
    const friendship = await db.query<{ id: string }>(`select id from public.friendships`);
    expect(friendship.rows).toHaveLength(1);
    const friendshipId = friendship.rows[0]!.id;
    await expect(
      db.exec(`update public.friendships set status = 'accepted' where id = '${friendshipId}'`),
    ).rejects.toThrow();
    await db.exec(`set request.jwt.claim.sub = '${userB}'`);
    await db.query(`select public.respond_friend_request('${friendshipId}', true)`);
    await db.exec(
      `insert into public.direct_messages(sender_id, recipient_id, content) values('${userB}', '${userA}', 'mensagem original')`,
    );
    await db.exec(`set request.jwt.claim.sub = '${userA}'`);
    await expect(
      db.exec(`update public.direct_messages set content = 'adulterada'`),
    ).rejects.toThrow();
    await db.exec(`update public.direct_messages set read_at = now()`);
    expect(
      (await db.query(`select read_at from public.direct_messages`)).rows[0]!.read_at,
    ).not.toBeNull();

    const groupId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    await db.exec(
      `insert into public.study_groups(id,name,created_by,invite_code) values('${groupId}', 'Grupo A', '${userA}', 'SECRET42')`,
    );
    await db.exec(
      `insert into public.group_members(group_id,user_id,role) values('${groupId}', '${userA}', 'admin')`,
    );
    await db.exec(`set request.jwt.claim.sub = '${userB}'`);
    expect((await db.query(`select * from public.study_groups`)).rows).toHaveLength(0);
    await expect(
      db.exec(
        `insert into public.group_members(group_id,user_id,role) values('${groupId}', '${userB}', 'admin')`,
      ),
    ).rejects.toThrow();
    await db.query(`select public.join_study_group('SECRET42')`);
    expect(
      (await db.query(`select * from public.group_members where group_id = '${groupId}'`)).rows,
    ).toHaveLength(2);

    for (let i = 1; i < 20; i++)
      await db.exec(
        `insert into public.direct_messages(sender_id,recipient_id,content) values('${userB}','${userA}','teste de limite')`,
      );
    await expect(
      db.exec(
        `insert into public.direct_messages(sender_id,recipient_id,content) values('${userB}','${userA}','excesso')`,
      ),
    ).rejects.toThrow(/Aguarde/);
    await db.exec(
      `set request.jwt.claim.sub = '${userA}'; insert into public.user_blocks(blocker_id,blocked_id) values('${userA}','${userB}')`,
    );
    await db.exec(`set request.jwt.claim.sub = '${userB}'`);
    expect(
      (await db.query(`select id from public.profiles where id = '${userA}'`)).rows,
    ).toHaveLength(0);
    expect((await db.query(`select id from public.direct_messages`)).rows).toHaveLength(0);
    expect((await db.query(`select id from public.study_rooms`)).rows).toHaveLength(0);
    await expect(
      db.query(`select public.send_room_message('${publicRoomId}', 'bloqueado', 'falso', 'falso')`),
    ).rejects.toThrow();
    await db.exec(`set role anon; set request.jwt.claim.sub = ''`);
    await expect(db.query(`select * from public.direct_messages`)).rejects.toThrow();
    await db.exec(`reset role`);
    await db.exec(
      fs.readFileSync(path.join(migrationsDir, "0013_social_security_hardening.sql"), "utf8"),
    );
    await db.close();

    console.log("PGlite harness concluído com sucesso: RLS e isolamento validados sem recursão!");
  }, 60000);
});
