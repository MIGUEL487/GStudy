import { expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

/** Real role changes exercise grants, RLS and SECURITY DEFINER code together. */
export async function checkVoiceDatabase(db: PGlite, a: string, b: string) {
  const as = (id: string) =>
    db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}'`);
  const value = async <T>(sql: string) =>
    (await db.query<{ value: T }>(`select ${sql} as value`)).rows[0]!.value;
  await db.exec(`reset role; delete from public.user_blocks`);
  await as(a);
  await expect(
    db.exec(`insert into public.voice_calls(created_by,title) values('${a}','forjada')`),
  ).rejects.toThrow();
  await expect(
    db.exec(`insert into public.call_preferences(user_id,dnd_manual) values('${b}',true)`),
  ).rejects.toThrow();
  const call = await value<string>(`public.start_voice_call()`);
  await expect(value(`public.start_voice_call()`)).rejects.toThrow();
  const invite = await value<{ id: string }>(`public.invite_voice_peer('${call}','${b}')`);
  await as(b);
  expect((await db.query(`select * from public.call_members`)).rows).toHaveLength(0);
  await expect(value(`public.voice_snapshot('${call}')`)).rejects.toThrow();
  const inbox = await value<{ invites: { id: string }[] }>(`public.voice_inbox()`);
  expect(inbox.invites.map((i) => i.id)).toContain(invite.id);
  await value(`public.respond_voice_invite('${invite.id}',false)`);
  await as(a);
  const cooldown = await value<{ status: string; next_at: string }>(
    `public.invite_voice_peer('${call}','${b}')`,
  );
  expect(cooldown.status).toBe("cooldown");
  expect(Date.parse(cooldown.next_at)).toBeGreaterThan(Date.now());
  await db.exec(
    `reset role; update public.call_invites set responded_at=now()-interval '31 seconds' where id='${invite.id}'`,
  );
  await as(b);
  await value(`public.set_call_dnd('hour')`);
  await as(a);
  await value(`public.invite_voice_peer('${call}','${b}')`);
  await as(b);
  expect((await value<{ invites: unknown[] }>(`public.voice_inbox()`)).invites).toHaveLength(0);
  expect(
    (await db.query(`select * from public.notifications where type='missed_call'`)).rows,
  ).toHaveLength(1);
  await value(`public.set_call_dnd('off')`);
  await as(a);
  const accepted = await value<{ id: string }>(`public.invite_voice_peer('${call}','${b}')`);
  await expect(value(`public.respond_voice_invite('${accepted.id}',true)`)).rejects.toThrow();
  await as(b);
  expect(await value(`public.respond_voice_invite('${accepted.id}',true)`)).toBe(call);
  expect(
    (
      await value<{ members: { muted: boolean }[] }>(`public.voice_snapshot('${call}')`)
    ).members.every((m) => m.muted),
  ).toBe(true);
  await expect(db.exec(`update public.call_members set force_muted=false`)).rejects.toThrow();
  await expect(db.exec(`delete from public.call_members`)).rejects.toThrow();
  await expect(
    db.exec(
      `insert into public.call_signals(call_id,sender_id,recipient_id,kind,payload) values('${call}','${a}','${b}','offer','{}')`,
    ),
  ).rejects.toThrow();
  await value(`public.send_voice_signal('${call}','${a}','offer','{"type":"offer","sdp":"mock"}')`);
  expect((await db.query(`select * from public.call_signals`)).rows).toHaveLength(0);
  await as(a);
  expect(
    (await db.query<{ sender_id: string }>(`select sender_id from public.call_signals`)).rows,
  ).toEqual([{ sender_id: b }]);
  await expect(value(`public.send_voice_signal('${call}','${a}','offer','{}')`)).rejects.toThrow();
  await value(`public.moderate_voice_member('${call}','${b}','mute')`);
  await as(b);
  await value(`public.update_voice_member('${call}',false,false)`);
  expect(
    (
      await db.query<{ muted: boolean }>(
        `select muted from public.call_members where user_id='${b}'`,
      )
    ).rows[0]!.muted,
  ).toBe(true);
  await expect(value(`public.moderate_voice_member('${call}','${a}','remove')`)).rejects.toThrow();
  const strangers = Array.from({ length: 5 }, (_, i) => `33333333-3333-4333-8333-33333333333${i}`);
  await db.exec(`reset role`);
  for (let i = 0; i < strangers.length; i++) {
    await db.exec(
      `insert into auth.users(id,email) values('${strangers[i]}','voice${i}@example.test'); insert into public.friendships(user_id,friend_id,status) values('${a}','${strangers[i]}','accepted')`,
    );
  }
  for (let i = 0; i < strangers.length; i++) {
    await as(a);
    const invited = await value<{ id: string }>(
      `public.invite_voice_peer('${call}','${strangers[i]}')`,
    );
    await as(strangers[i]!);
    expect((await db.query(`select * from public.call_signals`)).rows).toHaveLength(0);
    if (i < 4) await value(`public.respond_voice_invite('${invited.id}',true)`);
    else await expect(value(`public.respond_voice_invite('${invited.id}',true)`)).rejects.toThrow();
  }
  await as(a);
  expect(
    (await value<{ members: unknown[] }>(`public.voice_snapshot('${call}')`)).members,
  ).toHaveLength(6);
  await value(`public.moderate_voice_member('${call}','${b}','remove')`);
  await as(b);
  await expect(value(`public.voice_snapshot('${call}')`)).rejects.toThrow();
  await expect(value(`public.send_voice_signal('${call}','${a}','ice','{}')`)).rejects.toThrow();
  await as(a);
  await expect(value(`public.invite_voice_peer('${call}','${b}')`)).rejects.toThrow();
  await db.exec(
    `reset role; insert into public.user_blocks(blocker_id,blocked_id) values('${a}','${strangers[0]}')`,
  );
  await as(strangers[0]!);
  await expect(value(`public.voice_snapshot('${call}')`)).rejects.toThrow();
  await db.exec(`reset role; set role anon; set request.jwt.claim.sub=''`);
  await expect(value(`public.voice_inbox()`)).rejects.toThrow();
  await expect(db.query(`select * from public.call_invites`)).rejects.toThrow();
  await db.exec(`reset role`);
}
