import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/** Isolated in-memory database for browser routes, never a production connection. */
export async function qaDatabase(users) {
  const db = new PGlite();
  await db.exec(`create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz default now(),created_at timestamptz default now(),updated_at timestamptz default now(),role text default 'authenticated',is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'anon')$$;
    create role anon;create role authenticated;create role service_role;
    grant usage on schema public,auth to anon,authenticated,service_role;grant select on auth.users to anon,authenticated,service_role;`);
  const directory = resolve("drizzle/migrations");
  for (const file of readdirSync(directory)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(readFileSync(resolve(directory, file), "utf8"));
  for (const user of users) {
    await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)`, [
      user.id,
      user.email,
      JSON.stringify(user.user_metadata),
    ]);
    await db.query(
      `update public.profiles set onboarding_completed=true,school_year='medio-2',year_selected_at=now(),status='online' where id=$1`,
      [user.id],
    );
  }
  let queue = Promise.resolve();
  const as = (userId, task) => {
    const next = queue.then(() =>
      db.transaction(async (tx) => {
        await tx.exec("set local role authenticated");
        await tx.query(
          `select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)`,
          [userId],
        );
        return task(tx);
      }),
    );
    queue = next.catch(() => {});
    return next;
  };
  const functions = new Set([
    "voice_inbox",
    "start_voice_call",
    "invite_voice_peer",
    "respond_voice_invite",
    "voice_snapshot",
    "set_call_dnd",
    "update_voice_member",
    "moderate_voice_member",
    "send_voice_signal",
  ]);
  const tables = new Set([
    "profiles",
    "study_groups",
    "group_members",
    "study_rooms",
    "study_room_participants",
    "friendships",
    "notifications",
    "call_signals",
    "call_preferences",
  ]);
  const attach = async (context, user) => {
    let failedInitialSnapshot = false;
    await context.route("https://gstudy-test.supabase.co/rest/v1/**", async (route) => {
      const url = new URL(route.request().url()),
        name = url.pathname.split("/").at(-1);
      if (!functions.has(name) && !tables.has(name)) return route.fallback();
      if (
        name === "voice_snapshot" &&
        process.env.QA_RETRY_SNAPSHOT === "1" &&
        !failedInitialSnapshot
      ) {
        failedInitialSnapshot = true;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "NETWORK", message: "Falha de conexão simulada no QA" }),
        });
      }
      try {
        const data = await as(user.id, async (tx) => {
          if (functions.has(name)) {
            const input = route.request().postDataJSON() ?? {},
              entries = Object.entries(input);
            if (entries.some(([key]) => !/^p_[a-z_]+$/.test(key)))
              throw new Error("Invalid QA argument");
            const result = await tx.query(
              `select public.${name}(${entries.map(([key], i) => `${key}=>$${i + 1}`).join(",")}) as value`,
              entries.map(([, value]) =>
                typeof value === "object" && value !== null ? JSON.stringify(value) : value,
              ),
            );
            return result.rows[0].value;
          }
          if (route.request().method() !== "GET") return [];
          const clauses = [],
            args = [];
          for (const [key, filter] of url.searchParams) {
            if (
              !/^[a-z_]+$/.test(key) ||
              ["select", "order", "limit", "offset", "or"].includes(key)
            )
              continue;
            if (filter.startsWith("eq.")) {
              args.push(filter.slice(3));
              clauses.push(`${key}=$${args.length}`);
            } else if (filter === "is.null") clauses.push(`${key} is null`);
            else if (filter.startsWith("in.(")) {
              args.push(filter.slice(4, -1).split(","));
              clauses.push(`${key}=any($${args.length}::uuid[])`);
            }
          }
          const result = await tx.query(
            `select * from public.${name}${clauses.length ? " where " + clauses.join(" and ") : ""}${name === "call_signals" ? " order by id desc limit 1000" : ""}`,
            args,
          );
          return route.request().headers().accept?.includes("vnd.pgrst.object")
            ? (result.rows[0] ?? null)
            : result.rows;
        });
        await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
      } catch (error) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ code: error.code ?? "P0001", message: error.message }),
        });
      }
    });
    // Real Realtime connection is replaced at the browser boundary. The application also
    // exercises its SQL-authorized recovery poll; no public broadcast is used for signaling.
    await context.routeWebSocket("wss://gstudy-test.supabase.co/**", (socket) => {
      socket.onMessage((raw) => {
        try {
          const message = JSON.parse(String(raw));
          if (
            message.event === "heartbeat" ||
            message.event === "phx_join" ||
            message.event === "phx_leave"
          )
            socket.send(
              JSON.stringify({
                topic: message.topic,
                event: "phx_reply",
                ref: message.ref,
                join_ref: message.join_ref,
                payload: {
                  status: "ok",
                  response:
                    message.event === "phx_join"
                      ? {
                          postgres_changes: (message.payload.config?.postgres_changes ?? []).map(
                            (filter, i) => ({ ...filter, id: i + 1 }),
                          ),
                        }
                      : {},
                },
              }),
            );
        } catch {
          /* Other socket formats are not needed by this fixture. */
        }
      });
    });
  };
  return { db, attach };
}
