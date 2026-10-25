import { launchQaBrowser, qaContext } from "./qa-browser.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const out = process.env.QA_OUTPUT || "/tmp/gstudy-board-check";
mkdirSync(out, { recursive: true });
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3003";
const browser = await launchQaBrowser(),
  results = [];
for (const width of (process.env.QA_WIDTHS || "360,390,430,768,1440").split(",").map(Number))
  for (const theme of ["light", "dark"]) {
    const context = await qaContext(browser, { width, theme });
    await context.addInitScript(() => {
      const native = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const image = native.apply(this, args);
        window.__export = image;
        return image;
      };
    });
    // Do not call a real AI provider during visual QA.
    await context.route(`${base}/**`, async (route) => {
      if (route.request().method() === "POST")
        await route.fulfill({ status: 503, body: "QA: provider offline" });
      else await route.continue();
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    try {
      await page.goto(base + "/aprender/feynman");
      await page.getByPlaceholder("Qual é o tema da aula? Ex.: Fotossíntese").fill("Geometria");
      await page.getByRole("button", { name: "Começar a aula" }).click();
      const canvas = page.getByLabel("Lousa para desenhar, inserir texto e formas");
      await canvas.waitFor();
      assert.equal(await page.getByRole("group", { name: "Escolher aluno" }).count(), 0);
      await page.getByRole("slider", { name: "Espessura em pixels" }).fill("12");
      await page.getByRole("button", { name: "Linha", exact: true }).click();
      let r = await canvas.boundingBox();
      await page.mouse.move(r.x + r.width * 0.15, r.y + r.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(r.x + r.width * 0.8, r.y + r.height * 0.65, { steps: 20 });
      await page.mouse.up();
      const before = await canvas.evaluate((c) => c.toDataURL());
      await page.getByRole("button", { name: "Desfazer", exact: true }).click();
      assert.notEqual(await canvas.evaluate((c) => c.toDataURL()), before);
      await page.getByRole("button", { name: "Refazer", exact: true }).click();
      assert.equal(await canvas.evaluate((c) => c.toDataURL()), before);
      const geometry = await canvas.evaluate((c) => ({
        dpr: devicePixelRatio,
        width: c.width,
        height: c.height,
        display: c.getBoundingClientRect().width,
        ratio: c.getBoundingClientRect().width / c.getBoundingClientRect().height,
      }));
      assert(Math.abs(geometry.width - geometry.display * geometry.dpr) <= 1);
      assert(Math.abs(geometry.ratio - 5 / 3) < 0.01);
      await page.screenshot({ path: `${out}/${width}-${theme}.png`, fullPage: true });
      await page.getByRole("button", { name: "Enviar explicação" }).click();
      const exported = await page.evaluate(async () => {
        const img = new Image();
        img.src = window.__export;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        const data = g.getImageData(0, 0, c.width, c.height).data;
        let ink = 0;
        for (let i = 0; i < data.length; i += 4)
          if (data[i] < 150 && data[i + 1] < 150 && data[i + 2] < 150) ink++;
        return { width: c.width, height: c.height, background: [...data.slice(0, 3)], ink };
      });
      assert.equal(exported.width, 1200);
      assert.equal(exported.height, 720);
      assert(exported.background.every((v) => v > 220));
      assert(exported.ink > 3000);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      assert.deepEqual(pageErrors, []);
      results.push({ width, theme, passed: true, geometry, exported });
    } catch (e) {
      results.push({ width, theme, passed: false, error: String(e), pageErrors });
      await page.screenshot({ path: `${out}/${width}-${theme}-failed.png`, fullPage: true });
    }
    await context.close();
  }
writeFileSync(`${out}/report.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
await browser.close();
if (results.some((r) => !r.passed)) process.exitCode = 1;
