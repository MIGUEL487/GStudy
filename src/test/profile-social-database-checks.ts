import { expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
export async function checkProfileSocialDatabase(db: PGlite, a: string, b: string) {
  const as = (id: string) =>
    db.exec(`reset role; set role authenticated;set request.jwt.claim.sub='${id}'`);
  const value = async <T>(sql: string) =>
    (await db.query<{ value: T }>(`select ${sql} as value`)).rows[0]!.value;
  await db.exec(
    `reset role;delete from public.user_blocks;update public.profiles set school_year='fundamental-9',year_selected_at=now()-interval '2 years' where id='${b}'`,
  );
  await as(b);
  expect(
    await value(
      `public.school_year_at('fundamental-9','2026-12-31T23:00:00-03','2027-01-01T00:00:00-03')`,
    ),
  ).toBe("medio-1");
  expect(await value(`public.school_year_at('medio-3','2020-01-01','2030-01-01')`)).toBe(
    "cursinho",
  );
  expect(await value(`public.school_year_at('superior','2020-01-01','2030-01-01')`)).toBe(
    "superior",
  );
  expect(await value(`public.get_student_rollover()`)).toMatchObject({
    needsPrompt: true,
    suggestedNextYear: "medio-2",
  });
  await value(`public.get_student_rollover()`);
  expect(
    (await db.query(`select id from public.notifications where type='year_rollover'`)).rows,
  ).toHaveLength(1);
  await expect(
    db.exec(
      `insert into public.student_rollover_notices(user_id,calendar_year) values('${a}',2030)`,
    ),
  ).rejects.toThrow();
  await expect(
    db.exec(`update public.student_rollover_notices set calendar_year=2031`),
  ).rejects.toThrow();
  await expect(db.exec(`delete from public.student_rollover_notices`)).rejects.toThrow();
  for (const patch of [
    '{"user_id":"' + a + '"}',
    '{"school_days":[9]}',
    '{"school_days":[null]}',
    '{"avatar_url":"javascript:alert(1)"}',
    '{"school_year":"faculdade-inventada"}',
  ])
    await expect(value(`public.save_student_profile('${patch}')`)).rejects.toThrow();
  expect(
    await value(
      `public.save_student_profile('{"display_name":"Bruno atualizado","school_year":"medio-2","school_days":[1,3,3],"theme":"dark"}')`,
    ),
  ).toEqual({ saved: true });
  expect(
    (await db.query(`select display_name,school_days from public.profiles where id='${b}'`))
      .rows[0],
  ).toMatchObject({ display_name: "Bruno atualizado", school_days: [1, 3] });
  expect(await value(`public.get_student_rollover()`)).toMatchObject({ needsPrompt: false });
  await as(a);
  expect(
    (await db.query(`select * from public.student_rollover_notices where user_id='${b}'`)).rows,
  ).toHaveLength(0);
  await db.exec(
    `insert into public.direct_messages(sender_id,recipient_id,content) values('${a}','${b}','Mensagem nova de QA')`,
  );
  expect(await value(`public.social_topic_allowed('dm:${a}:${b}','${a}')`)).toBe(true);
  expect(await value(`public.social_topic_allowed('social:${a}','${b}')`)).toBe(false);
  await as(b);
  const inbox = await value<{ unread: Record<string, number> }>(`public.get_social_inbox()`);
  expect(inbox.unread[a]).toBeGreaterThan(0);
  await db.exec(
    `update public.direct_messages set read_at=now() where sender_id='${a}' and recipient_id='${b}'`,
  );
  expect(
    (await value<{ unread: Record<string, number> }>(`public.get_social_inbox()`)).unread[a],
  ).toBeUndefined();
  await db.exec(
    `reset role;insert into public.user_blocks(blocker_id,blocked_id) values('${a}','${b}')`,
  );
  await as(b);
  expect(await value(`public.social_topic_allowed('dm:${a}:${b}','${b}')`)).toBe(false);
  await db.exec(`set role anon;set request.jwt.claim.sub=''`);
  await expect(value(`public.get_social_inbox()`)).rejects.toThrow();
  await expect(value(`public.get_student_rollover()`)).rejects.toThrow();
  await db.exec(`reset role`);
}
