// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import { checkVoiceDatabase } from "./voice-database-checks";
import { checkProfileSocialDatabase } from "./profile-social-database-checks";

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
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${userA}'`);
    const hearts = async () =>
      (
        await db.query<{ state: { hearts: number; max: number; next_at: string | null } }>(
          `select public.get_learning_hearts() as state`,
        )
      ).rows[0]!.state;
    expect(await hearts()).toMatchObject({ hearts: 3, max: 3, next_at: null });
    await expect(
      db.exec(`update public.learning_hearts set hearts = 100 where user_id = '${userA}'`),
    ).rejects.toThrow();
    await expect(db.exec(`update public.learning_rules set hearts_max = 100`)).rejects.toThrow();
    const eventId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await db.query(`select public.lose_learning_heart('${eventId}')`);
    await db.query(`select public.lose_learning_heart('${eventId}')`);
    expect((await hearts()).hearts).toBe(2);
    await db.exec(
      `reset role; update public.learning_hearts set hearts_updated_at = now() - interval '119 minutes' where user_id = '${userA}'; set role authenticated`,
    );
    expect((await hearts()).hearts).toBe(2);
    await db.exec(
      `reset role; update public.learning_hearts set hearts_updated_at = now() - interval '121 minutes' where user_id = '${userA}'; set role authenticated`,
    );
    expect(await hearts()).toMatchObject({ hearts: 3, next_at: null });
    await db.query(`select public.lose_learning_heart(gen_random_uuid())`);
    await db.query(`select public.lose_learning_heart(gen_random_uuid())`);
    expect((await hearts()).hearts).toBe(1);
    await db.exec(
      `reset role; update public.learning_hearts set hearts_updated_at = now() - interval '241 minutes' where user_id = '${userA}'; set role authenticated`,
    );
    expect(await hearts()).toMatchObject({ hearts: 3, next_at: null });
    await db.query(`select public.lose_learning_heart(gen_random_uuid())`);
    const refreshed = await hearts();
    expect(refreshed.hearts).toBe(2);
    expect(Date.parse(refreshed.next_at!) - Date.now()).toBeGreaterThan(119 * 60000);
    await db.exec(`set request.jwt.claim.sub = '${userB}'`);
    expect((await hearts()).hearts).toBe(3);
    expect(
      (await db.query(`select * from public.learning_hearts where user_id = '${userA}'`)).rows,
    ).toHaveLength(0);

    await db.exec(`set request.jwt.claim.sub = '${userA}'`);
    const reward = await db.query<{ state: { xp: number; awarded: number } }>(
      `select public.record_learning_reward('quiz', '${eventId}', 100000) as state`,
    );
    expect(reward.rows[0]!.state).toMatchObject({ xp: 100, awarded: 100 });
    const repeated = await db.query<{ state: { xp: number; awarded: number } }>(
      `select public.record_learning_reward('quiz', '${eventId}', 100000) as state`,
    );
    expect(repeated.rows[0]!.state).toMatchObject({ xp: 100, awarded: 0 });
    for (let i = 0; i < 10; i++)
      await db.query(`select public.record_learning_reward('quiz', gen_random_uuid(), 100)`);
    expect(
      (await db.query<{ xp: number }>(`select xp from public.learner_stats`)).rows[0]!.xp,
    ).toBe(500);
    await expect(db.exec(`update public.learner_stats set xp = 999999`)).rejects.toThrow();
    expect(
      (await db.query(`select * from public.get_learning_leaderboard('xp', 'week')`)).rows,
    ).toHaveLength(1);
    await db.exec(`reset role`);
    await db.exec(
      fs.readFileSync(path.join(migrationsDir, "0014_learning_hearts_and_rewards.sql"), "utf8"),
    );
    await db.exec(
      `insert into public.user_daily_ai_usage(user_id,action,day,count) values('${userA}','game',(now() at time zone 'America/Sao_Paulo')::date,49); set role authenticated`,
    );
    const lastAllowed = await db.query<{
      state: { allowed: boolean; count: number; limit: number };
    }>(`select public.check_and_consume_ai_quota('game', 999999) as state`);
    expect(lastAllowed.rows[0]!.state).toMatchObject({ allowed: true, count: 50, limit: 50 });
    const blockedQuota = await db.query<{
      state: { allowed: boolean; count: number; limit: number };
    }>(`select public.check_and_consume_ai_quota('game', 999999) as state`);
    expect(blockedQuota.rows[0]!.state).toMatchObject({ allowed: false, count: 50, limit: 50 });
    // Games: own immutable results, true retry idempotency, friend privacy and shared-cache privileges.
    await db.exec(
      `reset role; delete from public.user_blocks; update public.profiles set ranking_visibility = 'public'; set role authenticated; set request.jwt.claim.sub = '${userA}'`,
    );
    const invitation = await db.query<{ value: { id: string } }>(
      `select public.create_game_challenge('${userB}','math-balanca','medio','shared-seed') as value`,
    );
    const challengeId = invitation.rows[0]!.value.id;
    expect(
      (
        await db.query(
          `select id from public.notifications where user_id = '${userB}' and type = 'game_challenge'`,
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.exec(
        `insert into public.game_content_cache(cache_key,content) values(repeat('a',64),'{}')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.exec(
        `insert into public.game_runs(event_id,user_id,game_id,difficulty,seed,score,hits,mistakes,total,max_combo) values(gen_random_uuid(),'${userA}','math-balanca','medio','s',100,1,0,3,2)`,
      ),
    ).rejects.toThrow();
    await db.exec(`set request.jwt.claim.sub = '${userB}'`);
    expect(
      (await db.query(`select id from public.notifications where type = 'game_challenge'`)).rows,
    ).toHaveLength(1);
    const gameEvent = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const callGame = `select public.record_game_result('${gameEvent}','math-balanca','medio','shared-seed',100,1,0,3,2,'${challengeId}') as value`;
    const gameReward = await db.query<{ value: { awarded: number } }>(callGame);
    expect(gameReward.rows[0]!.value.awarded).toBe(20);
    expect((await db.query(`select * from public.get_game_records()`)).rows).toHaveLength(1);
    expect((await db.query<{ value: { awarded: number } }>(callGame)).rows[0]!.value.awarded).toBe(
      20,
    );
    expect(
      (
        await db.query<{ xp: number }>(
          `select xp from public.learner_stats where user_id = '${userB}'`,
        )
      ).rows[0]!.xp,
    ).toBe(20);
    await expect(db.exec(`update public.game_runs set score = 9999`)).rejects.toThrow();
    await expect(db.exec(`delete from public.game_runs`)).rejects.toThrow();
    await expect(
      db.query(
        `select public.record_game_result(gen_random_uuid(),'math-balanca','medio','different-seed',100,1,0,3,2,'${challengeId}')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `select public.record_game_result(gen_random_uuid(),'math-balanca','medio','s',9999,1,0,3,2)`,
      ),
    ).rejects.toThrow();
    const comparison = await db.query<{ value: { results: { score: number }[] } }>(
      `select public.get_game_challenge('${challengeId}') as value`,
    );
    expect(comparison.rows[0]!.value.results).toMatchObject([{ score: 100 }]);
    for (let i = 0; i < 10; i++)
      await db.query(
        `select public.record_game_result(gen_random_uuid(),'math-balanca','medio','s',1000,5,0,6,4)`,
      );
    expect(
      (
        await db.query<{ total: number }>(
          `select sum(awarded)::int as total from public.game_runs where user_id = '${userB}'`,
        )
      ).rows[0]!.total,
    ).toBe(100);
    await db.exec(`set request.jwt.claim.sub = '${userA}'`);
    await expect(db.query(callGame)).rejects.toThrow();
    await db.query(
      `select public.record_game_result(gen_random_uuid(),'math-balanca','medio','shared-seed',300,2,0,3,3,'${challengeId}')`,
    );
    expect(
      (await db.query(`select * from public.get_game_leaderboard('math-balanca','medio','week')`))
        .rows,
    ).toHaveLength(2);
    await db.exec(
      `reset role; update public.profiles set ranking_visibility = 'hidden' where id = '${userA}'; set role authenticated; set request.jwt.claim.sub = '${userB}'`,
    );
    expect(
      (await db.query(`select event_id from public.game_runs where user_id = '${userA}'`)).rows,
    ).toHaveLength(0);
    expect(
      (await db.query(`select * from public.get_game_leaderboard('math-balanca','medio','week')`))
        .rows,
    ).toHaveLength(1);
    await db.exec(
      `reset role; set role service_role; insert into public.game_content_cache(cache_key,content) values(repeat('a',64),'{"questions":[]}'); reset role; set role authenticated`,
    );
    expect((await db.query(`select cache_key from public.game_content_cache`)).rows).toHaveLength(
      1,
    );
    await expect(db.exec(`update public.game_content_cache set content = '{}'`)).rejects.toThrow();
    await expect(db.exec(`delete from public.game_content_cache`)).rejects.toThrow();
    await db.exec(
      `reset role; update public.game_content_cache set expires_at = now() - interval '1 day'; set role authenticated`,
    );
    expect((await db.query(`select cache_key from public.game_content_cache`)).rows).toHaveLength(
      0,
    );
    await db.exec(
      `reset role; insert into public.user_blocks(blocker_id,blocked_id) values('${userA}','${userB}'); set role authenticated`,
    );
    await expect(db.query(`select public.get_game_challenge('${challengeId}')`)).rejects.toThrow();
    await expect(
      db.query(`select public.create_game_challenge('${userA}','math-balanca','medio','s')`),
    ).rejects.toThrow();
    await db.exec(`set role anon; set request.jwt.claim.sub = ''`);
    await expect(db.query(`select * from public.game_runs`)).rejects.toThrow();
    await expect(db.query(`select public.get_game_challenge('${challengeId}')`)).rejects.toThrow();
    await db.exec(`reset role`);
    await db.exec(fs.readFileSync(path.join(migrationsDir, "0015_games.sql"), "utf8"));
    await checkVoiceDatabase(db, userA, userB);
    await db.exec(fs.readFileSync(path.join(migrationsDir, "0016_voice_calls.sql"), "utf8"));
    await checkProfileSocialDatabase(db, userA, userB);
    await db.exec(
      fs.readFileSync(path.join(migrationsDir, "0017_student_social_completion.sql"), "utf8"),
    );
    await db.close();

    console.log("PGlite harness concluído com sucesso: RLS e isolamento validados sem recursão!");
  }, 60000);
});
