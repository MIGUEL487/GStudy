import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { qaContext, qaUser, launchQaBrowser } from "./qa-browser.mjs";
import { qaDatabase } from "./qa-database.mjs";
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3003";
const output = process.env.QA_OUTPUT || "/tmp/gstudy-ui-check";
mkdirSync(output, { recursive: true });
const browser = await launchQaBrowser(),
  results = [];
// Let the 1.5 s measurement window finish before starting another user flow.
const pause = (p) => p.waitForTimeout(1600);
try {
  for (const width of (process.env.QA_WIDTHS || "390,1440").split(",").map(Number))
    for (const theme of (process.env.QA_THEMES || "light,dark").split(",")) {
      const { db, attach } = await qaDatabase([qaUser]);
      const context = await qaContext(browser, { width, theme });
      await attach(context, qaUser);
      await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.setDefaultTimeout(20000);
      try {
        await page.goto(base + "/");
        await page.getByRole("button", { name: /^Abrir amigos de estudo/ }).waitFor();
        await pause(page);
        for (const name of ["Sessões", "Aprender", "Início"]) {
          await page.getByRole("link", { name, exact: true }).first().click();
          await pause(page);
        }
        await page.getByRole("button", { name: /^Abrir amigos de estudo/ }).click();
        await pause(page);
        await page.getByRole("button", { name: "Fechar painel de amigos" }).click();
        await pause(page);
        await page.getByRole("button", { name: /Mudar para tema/ }).click();
        await pause(page);
        await page.getByRole("button", { name: /Mudar para tema/ }).click();
        await pause(page);
        await page.getByRole("button", { name: "Abrir notificações" }).click();
        await pause(page);
        await page.keyboard.press("Escape");
        await pause(page);
        // New-user flow is isolated from the returning account and saved through real SQL.
        await db.query(`update public.profiles set onboarding_completed=false where id=$1`, [
          qaUser.id,
        ]);
        await page.reload();
        await page.getByRole("dialog", { name: "Configuração inicial do estudante" }).waitFor();
        await page.getByPlaceholder("Ex: Clara Mendes").fill("Ana Silva");
        await page.getByPlaceholder("Ex: clara_mendes").fill("ana_anim_qa");
        await page.getByText(/está disponível/).waitFor();
        await pause(page);
        await page.getByRole("button", { name: /Avançar/ }).click();
        await pause(page);
        await page.getByRole("radio", { name: /3º ano · Ensino Médio/ }).click();
        await pause(page);
        await page.getByRole("button", { name: /Avançar/ }).click();
        await pause(page);
        await page.getByRole("radio", { name: "Física", exact: true }).click();
        await pause(page);
        await page.getByRole("button", { name: /Avançar/ }).click();
        await pause(page);
        await page.getByRole("button", { name: /Avançar/ }).click();
        await pause(page);
        await page.getByRole("button", { name: /Avançar/ }).click();
        await pause(page);
        await page.getByRole("button", { name: /Entrar no GStudy/ }).click();
        await pause(page);
        await page.getByRole("button", { name: /^Abrir amigos de estudo/ }).waitFor();
        assert.deepEqual(errors, []);
        results.push({ width, theme, passed: true });
      } catch (error) {
        results.push({ width, theme, passed: false, error: String(error), errors });
        writeFileSync(
          `${output}/${width}-${theme}-failure.txt`,
          await page.locator("body").innerText(),
        );
        await page.screenshot({ path: `${output}/${width}-${theme}-failure.png`, fullPage: true });
      } finally {
        await context.tracing.stop({ path: `${output}/${width}-${theme}.zip` });
        await context.close();
        await db.close();
      }
    }
} finally {
  await browser.close();
  writeFileSync(`${output}/report.json`, JSON.stringify(results, null, 2));
}
console.log(JSON.stringify(results));
if (results.some((r) => !r.passed)) process.exitCode = 1;
