import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { qaContext, qaUser, launchQaBrowser } from "./qa-browser.mjs";
import { qaDatabase } from "./qa-database.mjs";
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3003";
const output = process.env.QA_OUTPUT || "/tmp/gstudy-quiz-sync";
mkdirSync(output, { recursive: true });
const browser = await launchQaBrowser();
const results = [];
try {
  for (const width of (process.env.QA_WIDTHS || "390,1440").split(",").map(Number))
    for (const theme of (process.env.QA_THEMES || "light,dark").split(",")) {
      const { db, as, attach } = await qaDatabase([qaUser]);
      const contexts = [];
      const errors = [];
      const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const progress = {
        sessionId,
        questions: Array.from({ length: 3 }, (_, i) => ({
          question: `Pergunta sincronizada ${i + 1}?`,
          options: ["Correta", "Incorreta"],
          answer: 0,
          why: "A explicação foi preservada.",
        })),
        index: 0,
        pick: null,
        checked: false,
        right: 0,
        done: false,
        mistakes: [],
        pendingHeartId: null,
      };
      await as(qaUser.id, (tx) =>
        tx.query(`select public.sync_account_document('quizzes',0,$1::jsonb)`, [
          JSON.stringify({
            version: 1,
            sessions: [{ id: sessionId, activity: "{}", updatedAt: 1, progress, copies: [] }],
          }),
        ]),
      );
      try {
        for (let i = 0; i < 2; i++) {
          const context = await qaContext(browser, { width, theme });
          contexts.push(context);
          await context.tracing.start({ screenshots: true, snapshots: true });
          await attach(context, qaUser);
        }
        const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
        for (const p of [a, b]) {
          p.on("pageerror", (e) => errors.push(e.message));
          p.setDefaultTimeout(20000);
          await p.goto(base + "/aprender/quiz");
          await p.getByRole("heading", { name: "Pergunta sincronizada 1?" }).waitFor();
        }
        await a.getByRole("button", { name: "Correta", exact: true }).click();
        await a.getByRole("button", { name: "Conferir resposta" }).click();
        await a.getByRole("button", { name: "Próxima pergunta" }).click();
        await a.getByRole("heading", { name: "Pergunta sincronizada 2?" }).waitFor();
        const deadline = Date.now() + 20000;
        while (true) {
          const saved = await as(qaUser.id, (tx) =>
            tx.query(`select document from public.account_documents where namespace='quizzes'`),
          );
          if (saved.rows[0].document.sessions[0].progress.index === 1) break;
          if (Date.now() > deadline) throw new Error("O avanço não chegou ao documento da conta.");
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        await b.evaluate(() => window.dispatchEvent(new Event("focus")));
        await b.getByRole("heading", { name: "Pergunta sincronizada 2?" }).waitFor();
        assert.equal(await b.getByRole("button", { name: "Conferir resposta" }).isDisabled(), true);
        await b.reload();
        await b.getByRole("heading", { name: "Pergunta sincronizada 2?" }).waitFor();
        const cloud = await as(qaUser.id, (tx) =>
          tx.query(`select document from public.account_documents where namespace='quizzes'`),
        );
        assert.equal(cloud.rows[0].document.sessions[0].progress.right, 1);
        // Both devices answer the same question incorrectly: only one server charge.
        for (const page of [a, b]) {
          await page.getByRole("button", { name: "Incorreta", exact: true }).click();
          await page.getByRole("button", { name: "Conferir resposta" }).click();
          await page.getByRole("button", { name: "Próxima pergunta" }).waitFor();
          await page.getByText("A explicação foi preservada.", { exact: true }).waitFor();
        }
        const hearts = await as(qaUser.id, (tx) =>
          tx.query(`select public.get_learning_hearts() as value`),
        );
        assert.equal(hearts.rows[0].value.hearts, 2);
        assert.deepEqual(errors, []);
        await b.screenshot({ path: `${output}/${width}-${theme}.png`, fullPage: true });
        results.push({
          width,
          theme,
          status: "passed",
          restoredAcrossBrowsers: true,
          restoredAfterReload: true,
          sameWrongAnswerChargedOnce: true,
        });
      } catch (error) {
        for (const [i, context] of contexts.entries())
          for (const page of context.pages()) {
            await page.screenshot({
              path: `${output}/${width}-${theme}-${i}-failure.png`,
              fullPage: true,
            });
            writeFileSync(
              `${output}/${width}-${theme}-${i}-failure.txt`,
              await page.locator("body").innerText(),
            );
          }
        results.push({ width, theme, status: "failed", error: String(error), errors });
        throw error;
      } finally {
        for (const [i, context] of contexts.entries()) {
          await context.tracing.stop({ path: `${output}/${width}-${theme}-${i}.zip` });
          await context.close();
        }
        await db.close();
      }
    }
} finally {
  await browser.close();
  writeFileSync(`${output}/report.json`, JSON.stringify(results, null, 2));
}
console.log(JSON.stringify(results));
