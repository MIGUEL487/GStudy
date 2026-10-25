import { createServer } from "node:http";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { launchQaBrowser, qaContext } from "./qa-browser.mjs";

// Run Vite in e2e mode with dummy public Supabase settings; all app RPCs are intercepted.
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3002";
const output = process.env.QA_OUTPUT || "/tmp/gstudy-stream-check";
mkdirSync(output, { recursive: true });
const quota = {
  limit: 50000,
  used: 500,
  remaining: 49500,
  day: "2026-10-23",
  resetsAt: "2026-10-24T03:00:00Z",
};
const first = "A energia passa entre os seres vivos. ";
const last = "Por que essa passagem depende do ambiente?";
let cancellations = 0;
const questions = Array.from({ length: 6 }, (_, i) => ({
  question: `Pergunta recebida ${i + 1}?`,
  options: ["Resposta A", "Resposta B", "Resposta C", "Resposta D"],
  answer: 0,
  why: "Uma explicação didática.",
}));
const cards = Array.from({ length: 10 }, (_, i) => ({
  front: `Conceito recebido ${i + 1}?`,
  back: "Uma explicação para o conceito.",
}));
const topics = Array.from({ length: 4 }, (_, i) => ({
  title: `Ideia recebida ${i + 1}`,
  explanation: "Uma explicação didática e simples sobre energia e suas relações.",
  example: "Uma planta recebe energia do Sol.",
}));
const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", new URL(base).origin);
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url, "http://localhost");
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson",
    "x-tss-raw": "true",
    "Cache-Control": "no-store",
  });
  const emit = (event) => res.write(JSON.stringify(event) + "\n");
  let complete = false;
  const mode = url.searchParams.get("mode"),
    behavior = url.searchParams.get("behavior");
  const structured = ["quiz", "flashcards", "explain"].includes(mode);
  const items = mode === "quiz" ? questions : mode === "flashcards" ? cards : topics;
  emit(structured ? { type: "item", index: 0, value: items[0] } : { type: "text", delta: first });
  const timer = setTimeout(() => {
    if (behavior === "error") emit({ type: "error", message: "Conexão de teste interrompida" });
    else if (structured) {
      items.slice(1).forEach((value, i) => emit({ type: "item", index: i + 1, value }));
      emit({
        type: "done",
        value:
          mode === "quiz"
            ? { mode, quiz: { questions } }
            : mode === "flashcards"
              ? { mode, cards: { cards } }
              : { mode, explain: { topics } },
      });
    } else {
      emit({ type: "text", delta: last });
      emit({
        type: "done",
        value: mode === "socrates" ? { explanation: first, question: last, quota } : null,
      });
    }
    complete = true;
    res.end();
  }, 1200);
  res.on("close", () => {
    clearTimeout(timer);
    if (!complete) cancellations++;
  });
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const proxy = `http://127.0.0.1:${server.address().port}`;
const browser = await launchQaBrowser();
const results = [];
try {
  for (const width of (process.env.QA_WIDTHS || "390,1440").split(",").map(Number)) {
    for (const theme of (process.env.QA_THEMES || "light,dark").split(","))
      for (const mode of ["feynman", "socrates", "quiz", "flashcards", "explain"]) {
        const context = await qaContext(browser, { width, theme });
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        let behavior = "normal";
        await context.route(`${base}/_serverFn/**`, async (route) => {
          const path = new URL(route.request().url()).pathname.split("/").at(-1);
          const handler = Buffer.from(path, "base64url").toString();
          if (handler.includes("getSocratesQuota"))
            await route.fulfill({
              contentType: "application/json",
              body: JSON.stringify({ result: { ok: true, quota } }),
            });
          else if (/socratesReply|feynmanReply|generateActivity/.test(handler))
            await route.continue({ url: `${proxy}/stream?mode=${mode}&behavior=${behavior}` });
          else await route.fulfill({ status: 503, body: "RPC not included in visual QA" });
        });
        await context.tracing.start({ screenshots: true, snapshots: true });
        try {
          const path =
            mode === "socrates"
              ? "/socrates"
              : `/aprender/${mode === "explain" ? "explicacoes" : mode}`;
          await page.goto(base + path);
          if (mode === "feynman") {
            await page.getByPlaceholder("Qual é o tema da aula? Ex.: Fotossíntese").fill("Energia");
            await page.getByRole("button", { name: "Começar a aula" }).click();
            await page.getByLabel("Agora é a sua vez").fill("Energia passa entre os seres vivos.");
            await page.getByRole("button", { name: "Enviar explicação" }).click();
          } else if (mode === "socrates") {
            await page
              .getByLabel("Sua pergunta ou explicação")
              .fill("Como a energia passa entre os seres vivos?");
            await page.getByRole("button", { name: "Enviar para Sócrates" }).click();
          }
          if (["quiz", "flashcards", "explain"].includes(mode)) {
            await page.getByRole("region", { name: "Conteúdo recebido" }).waitFor();
            assert.equal(
              await page
                .getByText(
                  mode === "quiz"
                    ? "Pergunta recebida 2?"
                    : mode === "flashcards"
                      ? "Conceito recebido 2?"
                      : "Ideia recebida 2",
                  { exact: true },
                )
                .count(),
              0,
            );
            await page.getByRole("button", { name: "Parar geração" }).click();
            await page.getByText(/Geração interrompida/).waitFor();
            await page.screenshot({
              path: `${output}/${width}-${theme}-${mode}-partial.png`,
              fullPage: true,
            });
            await page.getByRole("button", { name: "Tentar novamente" }).click();
            if (mode === "quiz")
              await page.getByRole("button", { name: "Conferir resposta" }).waitFor();
            else if (mode === "flashcards")
              await page.getByText("Conceito recebido 1?", { exact: true }).waitFor();
            else await page.getByText("Ideia recebida 1", { exact: true }).waitFor();
            await page.getByRole("button", { name: "Parar geração" }).waitFor({ state: "hidden" });
          } else {
            await page.getByText(first.trim(), { exact: true }).first().waitFor();
            assert.equal(await page.getByText(last, { exact: true }).count(), 0);
            const before = cancellations;
            await page.getByRole("button", { name: "Interromper resposta da IA" }).first().click();
            await page
              .getByText(/Geração interrompida/)
              .first()
              .waitFor();
            await page.waitForFunction(() => !document.querySelector('[aria-label="Digitando…"]'));
            assert(cancellations > before);
            await page.screenshot({
              path: `${output}/${width}-${theme}-${mode}-stopped.png`,
              fullPage: true,
            });
            if (mode === "feynman") {
              behavior = "error";
              await page.getByRole("button", { name: "Continuar resposta" }).click();
              await page.getByText("Conexão de teste interrompida", { exact: true }).waitFor();
              await page.getByText(first.trim(), { exact: true }).first().waitFor();
              behavior = "normal";
              await page.getByRole("button", { name: "Tentar de novo" }).click();
              await page
                .getByText(first + last, { exact: true })
                .first()
                .waitFor();
            }
            if (mode === "socrates") {
              await page
                .locator(".socrates-message.is-assistant")
                .filter({ hasText: first.trim() })
                .waitFor();
              await page.reload();
              const picker = page.getByLabel("Suas conversas");
              await picker.locator('option:not([value=""])').first().waitFor({ state: "attached" });
              const id = await picker
                .locator("option")
                .evaluateAll((options) => options.find((o) => o.value)?.value);
              await picker.selectOption(id);
              await page.getByText(first.trim(), { exact: true }).waitFor();
            }
          }
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
          );
          assert.deepEqual(pageErrors, []);
          results.push({ width, theme, mode, passed: true });
        } catch (error) {
          results.push({ width, theme, mode, passed: false, error: String(error), pageErrors });
          console.log(results.at(-1));
          await page.screenshot({
            path: `${output}/${width}-${theme}-${mode}-failure.png`,
            fullPage: true,
          });
        }
        await context.tracing.stop({ path: `${output}/${width}-${theme}-${mode}.zip` });
        await context.close();
      }
  }
} finally {
  await browser.close();
  server.close();
}
writeFileSync(`${output}/report.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
if (results.some((result) => !result.passed)) process.exitCode = 1;
