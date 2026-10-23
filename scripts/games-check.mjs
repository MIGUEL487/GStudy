import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { launchQaBrowser, qaContext } from "./qa-browser.mjs";
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3002";
const output = process.env.QA_OUTPUT || "/tmp/gstudy-games-check";
mkdirSync(output, { recursive: true });
const browser = await launchQaBrowser();
const results =
  process.env.QA_RESUME === "1"
    ? JSON.parse(readFileSync(`${output}/report.json`, "utf8")).filter((result) => result.passed)
    : [];
const ids = [
  "math-balanca",
  "math-tabuada",
  "geo-mapa-mundi",
  "geo-bandeiras",
  "history-timeline",
  "port-forca",
  "physics-units",
  "math-primos",
];
const targets = (process.env.QA_WIDTHS || "360,390,430,768,1440").split(",").map(Number);
try {
  for (const width of targets)
    for (const theme of ["light", "dark"]) {
      const context = await qaContext(browser, { width, theme });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      let totalXp = 0;
      const recorded = new Map();
      await context.route(
        "https://gstudy-test.supabase.co/rest/v1/rpc/record_game_result",
        async (route) => {
          const input = route.request().postDataJSON();
          if (!recorded.has(input.p_event_id)) {
            const awarded = Math.min(input.p_hits ? 20 : 0, 100 - totalXp);
            totalXp += awarded;
            recorded.set(input.p_event_id, {
              awarded,
              score: input.p_score,
              hits: input.p_hits,
              seed: input.p_seed,
            });
          }
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(recorded.get(input.p_event_id)),
          });
        },
      );
      await context.route(`${base}/_serverFn/**`, async (route) => {
        const handler = Buffer.from(
          new URL(route.request().url()).pathname.split("/").at(-1),
          "base64url",
        ).toString();
        if (handler.includes("explainGameMistake"))
          await route.fulfill({
            headers: { "Content-Type": "application/x-ndjson", "x-tss-raw": "true" },
            body: '{"type":"text","delta":"Uma explicação didática para revisar o conceito."}\n{"type":"done","value":null}\n',
          });
        else
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error: { message: "Função não incluída nesta verificação visual" },
            }),
          });
      });
      for (const id of ids) {
        if (
          results.some(
            (result) => result.width === width && result.theme === theme && result.id === id,
          )
        )
          continue;
        await context.tracing.start({ screenshots: true, snapshots: true });
        pageErrors.length = 0;
        try {
          const seed = "qa-shared-seed";
          await page.goto(`${base}/sessoes?tab=games&game=${id}&seed=${seed}&difficulty=facil`);
          const dialog = page.getByRole("dialog");
          await dialog.waitFor();
          const plan = await page.evaluate(
            async ({ id, seed }) => {
              const { getGameById } = await import("/src/lib/games/catalog.ts");
              const { gameSequence, shuffled, seededRandom } =
                await import("/src/lib/games/engine.ts");
              const game = getGameById(id);
              const questions = gameSequence(game, "facil", seed);
              return {
                type: game.type,
                questions: questions.map((q) => ({
                  ...q,
                  cards: q.pairs
                    ? shuffled(
                        q.pairs.flatMap((pair, i) => [
                          { pair: i, value: pair.left },
                          { pair: i, value: pair.right },
                        ]),
                        seededRandom(seed + q.id),
                      )
                    : [],
                })),
              };
            },
            { id, seed },
          );
          await page.getByRole("button", { name: "Começar desafio" }).click();
          let expectedHits = 0;
          for (const q of plan.questions) {
            await page.getByRole("heading", { name: q.prompt, exact: true }).waitFor();
            if (expectedHits === 0)
              await dialog.screenshot({ path: `${output}/${width}-${theme}-${id}-playing.png` });
            if (plan.type === "memory-pairs") {
              for (let pair = 0; pair < q.pairs.length; pair++) {
                const indexes = q.cards.flatMap((card, i) => (card.pair === pair ? [i] : []));
                for (const i of indexes)
                  await page.getByRole("button", { name: `Carta ${i + 1}`, exact: true }).click();
                if (pair === 0 && expectedHits === 0)
                  await dialog.screenshot({ path: `${output}/${width}-${theme}-${id}-pair.png` });
              }
            } else if (plan.type === "sequence-order") {
              for (let i = 0; i < q.sequence.length; i++) {
                let position = await page.locator(".game-sequence li span").allTextContents();
                while (position.indexOf(q.sequence[i]) > i) {
                  await page
                    .getByRole("button", { name: `Subir ${q.sequence[i]}`, exact: true })
                    .click();
                  position = await page.locator(".game-sequence li span").allTextContents();
                }
              }
              await page.getByRole("button", { name: "Conferir sequência" }).click();
            } else if (plan.type === "word-hangman") {
              const letters = [
                ...new Set(
                  q.correctAnswer
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLowerCase()
                    .replace(/[^a-z]/g, ""),
                ),
              ];
              for (const letter of letters)
                await page.getByRole("button", { name: letter.toUpperCase(), exact: true }).click();
            } else if (plan.type === "typing-fast") {
              await page.getByLabel("Sua resposta").fill(String(q.correctAnswer));
              await page.getByRole("button", { name: "Conferir resposta" }).click();
            } else if (plan.type === "drag-classify") {
              for (const item of q.items) {
                await page.getByRole("button", { name: item.label, exact: true }).click();
                await page.getByRole("button", { name: item.category, exact: true }).click();
              }
              await page.getByRole("button", { name: "Conferir classificação" }).click();
            } else if (plan.type === "map-click") {
              if (expectedHits === 0) {
                await page.getByRole("button", { name: "Aumentar zoom" }).click();
                await page.getByRole("button", { name: "Diminuir zoom" }).click();
              }
              await page.getByLabel("País pelo teclado").selectOption(q.targetKey);
              await page.getByRole("button", { name: "Marcar país" }).click();
            } else {
              await page
                .getByRole("button", { name: q.options[q.correctIndex], exact: true })
                .click();
            }
            expectedHits++;
          }
          await page.getByRole("heading", { name: "Desafio concluído!" }).waitFor();
          await page.getByText(/XP registrado:/).waitFor();
          const last = [...recorded.values()].at(-1);
          assert.equal(last.hits, expectedHits);
          assert.equal(last.seed, seed);
          assert(last.score > 0);
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
          );
          assert.deepEqual(pageErrors, []);
          await dialog.screenshot({ path: `${output}/${width}-${theme}-${id}.png` });
          results.push({ width, theme, id, passed: true, hits: last.hits, score: last.score });
          console.log(results.at(-1));
        } catch (error) {
          results.push({ width, theme, id, passed: false, error: String(error), pageErrors });
          console.log(results.at(-1));
          await page.screenshot({
            path: `${output}/${width}-${theme}-${id}-failure.png`,
            fullPage: true,
          });
        }
        await context.tracing.stop({ path: `${output}/${width}-${theme}-${id}.zip` });
        writeFileSync(`${output}/report.json`, JSON.stringify(results, null, 2));
        await page
          .getByRole("button", { name: "Fechar", exact: true })
          .last()
          .click()
          .catch(() => {});
      }
      await context.close();
    }
} finally {
  await browser.close();
}
writeFileSync(`${output}/report.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
if (results.some((result) => !result.passed)) process.exitCode = 1;
