// Optional integration check against real PostgreSQL via PGlite, installed outside the repo.
// GSTUDY_PGLITE_MODULE=/tmp/gstudy-socrates-sql/node_modules/@electric-sql/pglite/dist/index.js node scripts/check-socrates-quota.mjs
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const { PGlite } = await import(process.env.GSTUDY_PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
const alice = "11111111-1111-4111-8111-111111111111",
  bob = "22222222-2222-4222-8222-222222222222";
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
const asUser = async (user) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
};
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to authenticated,anon;
    insert into auth.users(id) values('${alice}'),('${bob}');`);
  await db.exec(
    await readFile(
      new URL("../drizzle/migrations/0002_account_sync_reviews.sql", import.meta.url),
      "utf8",
    ),
  );
  const migration = await readFile(
    new URL("../drizzle/migrations/0003_socrates.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);
  await asUser(alice);
  const quota = await scalar("select public.get_socrates_quota() as value");
  assert.equal(quota.remaining, 50000);
  assert.match(quota.resetsAt, /T03:00:00Z$/);
  const ticket = randomUUID();
  await scalar("select public.reserve_socrates_tokens($1,40000) as value", [ticket]);
  assert.equal((await scalar("select public.get_socrates_quota() as value")).remaining, 10000);
  await assert.rejects(
    db.query("select public.reserve_socrates_tokens($1,10001)", [randomUUID()]),
    /cota/,
  );
  await assert.rejects(db.query("select * from public.socrates_token_ledger"), /permission denied/);
  await asUser(bob);
  assert.equal((await scalar("select public.get_socrates_quota() as value")).remaining, 50000);
  await assert.rejects(
    db.query("select public.settle_socrates_tokens($1,0)", [ticket]),
    /Reserva não encontrada/,
  );
  await asUser(alice);
  await assert.rejects(
    db.query("select public.settle_socrates_tokens($1,40001)", [ticket]),
    /Consumo inválido/,
  );
  await scalar("select public.settle_socrates_tokens($1,1200) as value", [ticket]);
  await scalar("select public.settle_socrates_tokens($1,0) as value", [ticket]);
  assert.equal(
    (await scalar("select public.get_socrates_quota() as value")).used,
    1200,
    "Settlement cannot be replayed as a refund",
  );
  const failed = randomUUID();
  await scalar("select public.reserve_socrates_tokens($1,5000) as value", [failed]);
  await scalar("select public.settle_socrates_tokens($1,0) as value", [failed]);
  assert.equal((await scalar("select public.get_socrates_quota() as value")).used, 1200);
  await scalar("select public.reserve_socrates_tokens($1,48800) as value", [randomUUID()]);
  await assert.rejects(
    db.query("select public.reserve_socrates_tokens($1,1)", [randomUUID()]),
    /cota/,
  );
  const doc = { version: 1, conversations: [] };
  const synced = await scalar(
    "select public.sync_account_document('socrates',0,$1::jsonb) as value",
    [JSON.stringify(doc)],
  );
  assert.equal(synced.applied, true);
  assert.deepEqual(synced.document, doc);
  await db.exec("reset role");
  await db.query(
    "insert into public.socrates_token_ledger(ticket_hash,user_id,day,reserved,charged,settled) values($1,$2,((now() at time zone 'America/Sao_Paulo')::date)-1,50000,50000,true)",
    [randomUUID(), alice],
  );
  await db.exec(migration); // Safe to repeat; existing usage and conversations survive.
  await asUser(alice);
  assert.equal((await scalar("select public.get_socrates_quota() as value")).used, 50000);
  await asUser(bob);
  const results = await Promise.allSettled(
    [1, 2].map(() => db.query("select public.reserve_socrates_tokens($1,30000)", [randomUUID()])),
  );
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  await db.exec("reset role; set role anon");
  await assert.rejects(db.query("select public.get_socrates_quota()"), /permission denied/);
  console.log(
    "Sócrates SQL: limite, reservas concorrentes, estorno, replay, isolamento de contas, renovação diária e sincronização verificados.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
