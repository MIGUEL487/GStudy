import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { launchQaBrowser, qaContext, qaUser } from "./qa-browser.mjs";
import { qaDatabase } from "./qa-database.mjs";

const base = process.env.QA_BASE_URL || "http://127.0.0.1:3005";
const output = process.env.QA_OUTPUT || "/tmp/gstudy-theme-check";
mkdirSync(output, { recursive: true });
const browser = await launchQaBrowser();
const results = [];

try {
  for (const width of [390, 1440]) {
    for (const initialTheme of ["light", "dark"]) {
      for (const reducedMotion of ["no-preference", "reduce"]) {
        const { db, attach } = await qaDatabase([qaUser]);
        const context = await qaContext(browser, {
          width,
          theme: initialTheme,
          reducedMotion,
          hasTouch: width < 768,
        });
        await attach(context, qaUser);
        await context.tracing.start({ screenshots: true, snapshots: true });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.setDefaultTimeout(20000);
        const name = `${width}-${initialTheme}-${reducedMotion}`;
        try {
          await page.goto(base + "/");
          const nextTheme = initialTheme === "light" ? "dark" : "light";
          const button = page.getByRole("button", {
            name: `Mudar para tema ${nextTheme === "dark" ? "escuro" : "claro"}`,
          });
          await button.waitFor();
          const before = await page.locator(".study-banner").evaluate((element) => ({
            overlay: getComputedStyle(element, "::after").backgroundImage,
            imageFilter: getComputedStyle(element.querySelector("img")).filter,
          }));
          await button.click();

          let animation = null;
          if (reducedMotion === "no-preference") {
            await page.waitForFunction(() =>
              document
                .getAnimations()
                .some(
                  (item) =>
                    item.effect?.pseudoElement === "::view-transition-new(root)" &&
                    item.effect.getComputedTiming().duration === 720,
                ),
            );
            animation = await page.evaluate(() => {
              const item = document
                .getAnimations()
                .find(
                  (candidate) =>
                    candidate.effect?.pseudoElement === "::view-transition-new(root)" &&
                    candidate.effect.getComputedTiming().duration === 720,
                );
              return item
                ? {
                    duration: item.effect.getComputedTiming().duration,
                    keyframes: item.effect.getKeyframes().map((frame) => frame.clipPath),
                    radius: Math.hypot(innerWidth, innerHeight),
                  }
                : null;
            });
            assert.equal(animation.duration, 720);
            assert.equal(animation.keyframes[0], "circle(0px at 0% 100%)");
            const endRadius = Number(animation.keyframes[1]?.match(/^circle\(([\d.]+)px/)?.[1]);
            assert.ok(Math.abs(endRadius - animation.radius) < 0.01);
            await page.waitForTimeout(300);
            await page.screenshot({ path: `${output}/${name}-midpoint.png`, fullPage: true });
          } else {
            assert.equal(
              await page.evaluate(() =>
                document
                  .getAnimations()
                  .some((item) => item.effect?.pseudoElement === "::view-transition-new(root)"),
              ),
              false,
            );
          }

          await page.waitForFunction(
            (theme) => document.documentElement.dataset.theme === theme,
            nextTheme,
          );
          if (reducedMotion === "no-preference")
            await page.waitForFunction(
              () => !document.documentElement.classList.contains("theme-view-transition"),
            );
          const after = await page.locator(".study-banner").evaluate((element) => ({
            overlay: getComputedStyle(element, "::after").backgroundImage,
            imageFilter: getComputedStyle(element.querySelector("img")).filter,
            color: getComputedStyle(element).color,
          }));
          assert.notEqual(after.overlay, before.overlay);
          assert.notEqual(after.imageFilter, before.imageFilter);
          assert.deepEqual(errors, []);
          await page.screenshot({ path: `${output}/${name}-final.png`, fullPage: true });
          results.push({
            width,
            initialTheme,
            nextTheme,
            reducedMotion,
            animation,
            after,
            passed: true,
          });
        } catch (error) {
          results.push({
            width,
            initialTheme,
            reducedMotion,
            error: String(error),
            errors,
            passed: false,
          });
          await page.screenshot({ path: `${output}/${name}-failure.png`, fullPage: true });
        } finally {
          await context.tracing.stop({ path: `${output}/${name}.zip` });
          await context.close();
          await db.close();
        }
      }
    }
  }
} finally {
  await browser.close();
  writeFileSync(`${output}/report.json`, JSON.stringify(results, null, 2));
}

console.log(
  results.map(({ width, initialTheme, reducedMotion, passed }) => ({
    width,
    initialTheme,
    reducedMotion,
    passed,
  })),
);
if (results.some((result) => !result.passed)) process.exitCode = 1;
