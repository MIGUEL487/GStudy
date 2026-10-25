import { chromium } from "playwright";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { qaContext, qaUser } from "./qa-browser.mjs";
import { qaDatabase } from "./qa-database.mjs";
const modulePath = process.env.QA_LIGHTHOUSE_MODULE;
if (!modulePath)
  throw new Error(
    "Informe QA_LIGHTHOUSE_MODULE com o caminho de lighthouse/core/index.js instalado fora do app.",
  );
const require = createRequire(modulePath);
const { default: puppeteer } = await import(pathToFileURL(require.resolve("puppeteer-core")));
const { default: lighthouse } = await import(pathToFileURL(modulePath));
const output = process.env.QA_OUTPUT || "/tmp/gstudy-lighthouse-check";
mkdirSync(output, { recursive: true });
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3005";
const port = Number(process.env.QA_CDP_PORT || 9333);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", `--remote-debugging-port=${port}`],
});
const { db, attach } = await qaDatabase([qaUser]);
let connection;
try {
  const context = await qaContext(browser, { width: 390, theme: "light", hasTouch: true });
  await attach(context, qaUser);
  const page = await context.newPage();
  await page.goto(base + "/");
  await page.getByRole("button", { name: "Abrir amigos de estudo", exact: true }).waitFor();
  connection = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${port}`,
    defaultViewport: null,
  });
  const fixturePage = (await connection.pages()).find(
    (candidate) => candidate.url() === base + "/",
  );
  if (!fixturePage) throw new Error("Não foi encontrada a página autenticada de teste.");
  const auditContext = fixturePage.browserContext();
  await fixturePage.close();
  const results = [];
  for (let run = 1; run <= 3; run++) {
    // A new page has no previous LCP entries, while the browser context keeps the
    // authenticated local fixtures and request interception.
    const target = await auditContext.newPage();
    const result = await lighthouse(
      base + "/",
      {
        port,
        logLevel: "error",
        output: ["html", "json"],
        onlyCategories: ["performance"],
        disableStorageReset: true,
      },
      undefined,
      target,
    );
    writeFileSync(`${output}/run-${run}.html`, result.report[0]);
    writeFileSync(`${output}/run-${run}.json`, result.report[1]);
    const audit = result.lhr.audits;
    results.push({
      run,
      performance: result.lhr.categories.performance.score,
      lcp: audit["largest-contentful-paint"].numericValue,
      tbt: audit["total-blocking-time"].numericValue,
      cls: audit["cumulative-layout-shift"].numericValue,
      warnings: result.lhr.runWarnings,
    });
    await target.close();
  }
  writeFileSync(
    `${output}/report.json`,
    JSON.stringify(
      {
        lighthouse: require("lighthouse/package.json").version,
        fixture:
          "Supabase local PGlite interceptado; compilação de produção com adaptador Node; Lighthouse mobile simulado",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
} finally {
  await connection?.disconnect();
  await browser.close();
  await db.close();
}
