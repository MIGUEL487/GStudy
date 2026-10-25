import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { qaContext, qaUser, launchQaBrowser } from "./qa-browser.mjs";
import { qaDatabase } from "./qa-database.mjs";
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3002",
  output = process.env.QA_OUTPUT || "/tmp/gstudy-social-check";
mkdirSync(output, { recursive: true });
const users = [
  qaUser,
  {
    ...qaUser,
    id: "22222222-2222-4222-8222-222222222222",
    email: "bruno@example.test",
    user_metadata: { full_name: "Bruno Lima" },
  },
  {
    ...qaUser,
    id: "33333333-3333-4333-8333-333333333333",
    email: "carlos@example.test",
    user_metadata: { full_name: "Carlos Souza" },
  },
];
const browser = await launchQaBrowser(),
  results = [];
const until = async (check, timeout = 15000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Condição de perfil ou amigos não foi confirmada.");
};
try {
  for (const width of (process.env.QA_WIDTHS || "390,1440").split(",").map(Number))
    for (const theme of (process.env.QA_THEMES || "light,dark").split(",")) {
      const { db, attach, as } = await qaDatabase(users),
        a = users[0],
        b = users[1],
        c = users[2];
      await db.query(`update public.profiles set username='carlos_qa' where id=$1`, [c.id]);
      await db.query(
        `insert into public.friendships(user_id,friend_id,status) values($1,$2,'accepted')`,
        [a.id, b.id],
      );
      await as(b.id, (tx) =>
        tx.query(
          `insert into public.direct_messages(sender_id,recipient_id,content) values($1,$2,'2 < 3 e 4 > 1')`,
          [b.id, a.id],
        ),
      );
      await as(c.id, (tx) => tx.query(`select public.send_friend_request_v2($1)`, [a.id]));
      const contexts = await Promise.all([
        qaContext(browser, { width, theme, user: a, hasTouch: width < 768 }),
        qaContext(browser, { width, theme, user: c, hasTouch: width < 768 }),
      ]);
      for (const [i, context] of contexts.entries()) {
        await attach(context, i === 0 ? a : c);
        await context.route(`${base}/_serverFn/**`, (route) =>
          route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
        );
        await context.tracing.start({ screenshots: true, snapshots: true });
      }
      const [pa, pc] = await Promise.all(contexts.map((context) => context.newPage())),
        errors = [];
      for (const page of [pa, pc]) {
        page.setDefaultTimeout(15000);
        page.on("pageerror", (error) => errors.push(error.message));
      }
      try {
        await Promise.all([pa.goto(base + "/sessoes"), pc.goto(base + "/sessoes")]);
        await pa
          .getByRole("button", { name: "Abrir amigos de estudo, 2 pendências", exact: true })
          .click();
        await pa.getByText("Bruno Lima", { exact: true }).waitFor();
        await pa.screenshot({ path: `${output}/${width}-${theme}-friends.png`, fullPage: true });
        await pa.getByRole("button", { name: /Conversar com Bruno Lima/ }).click();
        await pa.getByRole("dialog", { name: "Conversa com Bruno Lima", exact: true }).waitFor();
        await pa.getByText("2 < 3 e 4 > 1", { exact: true }).waitFor();
        await until(
          async () =>
            Number(
              (
                await as(a.id, (tx) =>
                  tx.query(
                    `select count(*)::int as n from public.direct_messages where recipient_id=$1 and read_at is null`,
                    [a.id],
                  ),
                )
              ).rows[0].n,
            ) === 0,
        );
        await pa.getByPlaceholder("Mensagem para Bruno Lima...").fill("x < 5 e y > 2");
        await pa.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
        await until(
          async () =>
            (
              await as(a.id, (tx) =>
                tx.query(
                  `select content from public.direct_messages where sender_id=$1 and recipient_id=$2 and content=$3`,
                  [a.id, b.id, "x < 5 e y > 2"],
                ),
              )
            ).rows.length === 1,
        );
        await pa.getByLabel("Opções da conversa", { exact: true }).click();
        await pa.getByRole("button", { name: "Denunciar pessoa", exact: true }).click();
        await pa.getByLabel("Motivo da denúncia").fill("Mensagem ofensiva no estudo");
        await pa.getByRole("button", { name: "Enviar denúncia", exact: true }).click();
        await until(
          async () =>
            (
              await db.query(
                `select id from public.user_reports where reporter_id=$1 and reported_id=$2`,
                [a.id, b.id],
              )
            ).rows.length === 1,
        );
        await pa.getByRole("button", { name: "Fechar conversa", exact: true }).click();
        await pa.getByRole("tab", { name: /Pedidos/ }).click();
        await pa.getByRole("button", { name: "Recusar pedido", exact: true }).click();
        await until(
          async () =>
            (
              await as(a.id, (tx) =>
                tx.query(
                  `select id from public.friendships where (user_id=$1 and friend_id=$2) or (user_id=$2 and friend_id=$1)`,
                  [a.id, c.id],
                ),
              )
            ).rows.length === 0,
        );
        await pa.getByRole("tab", { name: "+ Adicionar", exact: true }).click();
        const search = pa.getByLabel("Username ou e-mail");
        for (const query of ["@carlos_qa", "carlos@example.test"]) {
          await search.fill(query);
          await pa.getByRole("button", { name: "Buscar usuário", exact: true }).click();
          await pa.getByText("Carlos Souza", { exact: true }).waitFor();
        }
        await pa.getByRole("button", { name: "Adicionar Amigo", exact: true }).click();
        await until(
          async () =>
            (
              await as(a.id, (tx) =>
                tx.query(
                  `select id from public.friendships where user_id=$1 and friend_id=$2 and status='pending'`,
                  [a.id, c.id],
                ),
              )
            ).rows.length === 1,
        );
        await pa.getByRole("button", { name: "Cancelar pedido", exact: true }).click();
        await until(
          async () =>
            (
              await as(a.id, (tx) =>
                tx.query(`select id from public.friendships where user_id=$1 and friend_id=$2`, [
                  a.id,
                  c.id,
                ]),
              )
            ).rows.length === 0,
        );
        await pa.getByRole("tab", { name: "+ Adicionar", exact: true }).click();
        await search.fill("@carlos_qa");
        await pa.getByRole("button", { name: "Buscar usuário", exact: true }).click();
        await pa.getByRole("button", { name: "Adicionar Amigo", exact: true }).click();
        await pc.getByRole("button", { name: /Abrir amigos de estudo/ }).click();
        await pc.getByRole("tab", { name: /Pedidos/ }).click();
        await pc.getByRole("button", { name: "Aceitar pedido", exact: true }).click();
        await until(
          async () =>
            (
              await as(a.id, (tx) =>
                tx.query(`select public.is_friend($1,$2) as value`, [a.id, c.id]),
              )
            ).rows[0].value === true,
        );
        await pa.getByRole("tab", { name: /Amigos \(/ }).click();
        await pa.getByRole("button", { name: /Conversar com Bruno Lima/ }).click();
        await pa.getByLabel("Opções da conversa", { exact: true }).click();
        pa.once("dialog", (dialog) => dialog.accept());
        await pa.getByRole("button", { name: "Bloquear pessoa", exact: true }).click();
        await until(
          async () =>
            (
              await as(a.id, (tx) =>
                tx.query(
                  `select public.is_friend($1,$2) as blocked,public.is_friend($1,$3) as retained`,
                  [a.id, b.id, c.id],
                ),
              )
            ).rows[0].blocked === false,
        );
        assert.equal(
          (
            await as(a.id, (tx) =>
              tx.query(`select public.is_friend($1,$2) as value`, [a.id, c.id]),
            )
          ).rows[0].value,
          true,
        );
        await pa.goto(base + "/configuracoes?tab=profile");
        await pa.getByLabel("Como podemos chamar você?").fill("Ana Atualizada");
        await pa.getByRole("button", { name: "Salvar perfil", exact: true }).click();
        await until(
          async () =>
            (
              await as(a.id, (tx) =>
                tx.query(`select display_name from public.profiles where id=$1`, [a.id]),
              )
            ).rows[0].display_name === "Ana Atualizada",
        );
        await pa.getByLabel("Ano escolar", { exact: true }).selectOption("medio-3");
        await until(
          async () =>
            (
              await as(a.id, (tx) =>
                tx.query(`select school_year from public.profiles where id=$1`, [a.id]),
              )
            ).rows[0].school_year === "medio-3",
        );
        await pa.screenshot({ path: `${output}/${width}-${theme}-profile.png`, fullPage: true });
        await as(a.id, (tx) =>
          tx.query(
            `update public.profiles set school_year='fundamental-9',year_selected_at=now()-interval '1 year' where id=$1`,
            [a.id],
          ),
        );
        await pa.reload();
        await pa.getByRole("dialog", { name: "Novo ano letivo", exact: true }).waitFor();
        await pa.getByRole("button", { name: "Fechar", exact: true }).click();
        await pa.getByRole("button", { name: "Abrir notificações", exact: true }).click();
        await pa.getByText(/Novo ano letivo: agora/).waitFor();
        await pa.getByRole("button", { name: "Confirmar", exact: true }).click();
        await until(
          async () =>
            (
              await as(a.id, (tx) =>
                tx.query(`select school_year from public.profiles where id=$1`, [a.id]),
              )
            ).rows[0].school_year === "medio-1",
        );
        assert.equal(
          (
            await as(a.id, (tx) =>
              tx.query(
                `select count(*)::int as n from public.notifications where user_id=$1 and type='year_rollover'`,
                [a.id],
              ),
            )
          ).rows[0].n,
          1,
        );
        for (const page of [pa, pc])
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
          );
        assert.deepEqual(errors, []);
        results.push({ width, theme, passed: true });
      } catch (error) {
        results.push({
          width,
          theme,
          passed: false,
          error: error.stack ?? String(error),
          pageErrors: errors,
        });
        await pa.screenshot({ path: `${output}/${width}-${theme}-failure.png`, fullPage: true });
      }
      console.log(results.at(-1));
      writeFileSync(`${output}/report.json`, JSON.stringify(results, null, 2));
      for (const [i, context] of contexts.entries()) {
        await context.tracing.stop({ path: `${output}/${width}-${theme}-${i}.zip` });
        await context.close();
      }
      await db.close();
    }
} finally {
  await browser.close();
}
if (results.some((result) => !result.passed)) process.exitCode = 1;
