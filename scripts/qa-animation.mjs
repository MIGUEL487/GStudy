import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

/** Optional browser instrumentation; never imported by the application. */
export async function instrumentAnimations(context, { output, mobile }) {
  mkdirSync(output, { recursive: true });
  await context.addInitScript(() => {
    const measurements = [];
    const mounts = {};
    const seen = new WeakSet();
    const renderers = new Map();
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers,
      inject: (internals) => {
        renderers.set(1, internals);
        return 1;
      },
      onCommitFiberRoot(_id, root) {
        // Identify the layout and its persistent ancestors by their host anchor,
        // including in minified production bundles where function names change.
        const identify = (fiber) => {
          if (!fiber) return;
          if (
            fiber.type === "div" &&
            fiber.memoizedProps?.className?.split(" ").includes("app-shell")
          ) {
            let ancestor = fiber.return,
              index = 0;
            while (ancestor) {
              if ([0, 11, 14, 15].includes(ancestor.tag)) {
                const name = `layout-ancestor-${index++}`;
                if (!seen.has(ancestor) && !seen.has(ancestor.alternate))
                  mounts[name] = (mounts[name] ?? 0) + 1;
                seen.add(ancestor);
                if (ancestor.alternate) seen.add(ancestor.alternate);
              }
              ancestor = ancestor.return;
            }
          }
          identify(fiber.child);
          identify(fiber.sibling);
        };
        identify(root.current);
      },
      onCommitFiberUnmount() {},
    };
    let current = null,
      previous = 0;
    const start = (label) => {
      const now = performance.now();
      if (current && current.label !== "carregamento inicial" && now - current.lastAction < 250) {
        current.actions.push(label);
        current.lastAction = now;
        current.until = now + 1500;
        return;
      }
      current = {
        label,
        actions: [label],
        at: now,
        lastAction: now,
        until: now + 1500,
        cls: 0,
        frames: [],
        loafs: [],
        opacityDrops: [],
      };
      measurements.push(current);
      previous = 0;
    };
    window.__qaAnimation = {
      measurements,
      mounts,
      start,
      supported: PerformanceObserver.supportedEntryTypes,
    };
    const observe = (type, callback) => {
      if (PerformanceObserver.supportedEntryTypes.includes(type))
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (current && entry.startTime >= current.at && entry.startTime <= current.until)
              callback(entry, current);
        }).observe({ type, buffered: true });
    };
    observe("layout-shift", (entry, flow) => {
      if (!entry.hadRecentInput) flow.cls += entry.value;
    });
    observe("long-animation-frame", (entry, flow) =>
      flow.loafs.push({
        duration: entry.duration,
        scripts: entry.scripts.map((script) => ({
          source: script.sourceURL,
          function: script.sourceFunctionName,
          duration: script.duration,
        })),
      }),
    );
    let lastOpacity = 1;
    const findPanel = new MutationObserver(() => {
      const panel = document.querySelector(".page-transition");
      if (!panel) return;
      findPanel.disconnect();
      new MutationObserver(() => {
        const opacity = Number(panel.style.opacity || "1");
        if (current && lastOpacity > 0.5 && opacity < 0.1)
          current.opacityDrops.push({ at: performance.now(), value: opacity });
        lastOpacity = opacity;
      }).observe(panel, { attributes: true, attributeFilter: ["style"] });
    });
    findPanel.observe(document, { childList: true, subtree: true });
    const frame = (now) => {
      if (current && now <= current.until && document.visibilityState === "visible") {
        if (previous) current.frames.push(now - previous);
        previous = now;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    document.addEventListener(
      "click",
      (event) => {
        const control = event.target.closest("button,a,summary,[role=tab]");
        if (control)
          start(
            (control.getAttribute("aria-label") || control.textContent || control.tagName)
              .trim()
              .slice(0, 100),
          );
      },
      true,
    );
    start("carregamento inicial");
  });
  const pages = [];
  const createPage = context.newPage.bind(context);
  context.newPage = async (...args) => {
    const page = await createPage(...args);
    const segments = [];
    const snapshot = async () => {
      const data = await page.evaluate(() =>
        window.__qaAnimation
          ? {
              measurements: window.__qaAnimation.measurements,
              mounts: window.__qaAnimation.mounts,
              supported: window.__qaAnimation.supported,
            }
          : null,
      );
      if (data) segments.push(data);
    };
    for (const method of ["goto", "reload"]) {
      const original = page[method].bind(page);
      page[method] = async (...args) => {
        await snapshot();
        return original(...args);
      };
    }
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: mobile ? 4 : 1 });
    pages.push({ page, cdp, segments, snapshot });
    return page;
  };
  const close = context.close.bind(context);
  context.close = async (...args) => {
    const records = [];
    for (const { page, segments, snapshot } of pages) {
      if (page.isClosed()) continue;
      await page.waitForTimeout(1550);
      await snapshot();
      if (!segments.length) throw new Error("A instrumentação não foi carregada.");
      const data = {
        measurements: segments.flatMap((segment) => segment.measurements),
        supported: segments.at(-1).supported,
        mounts: Object.fromEntries(
          [...new Set(segments.flatMap((segment) => Object.keys(segment.mounts)))].map((name) => [
            name,
            Math.max(...segments.map((segment) => segment.mounts[name] ?? 0)),
          ]),
        ),
      };
      // CDP slows JavaScript by 4x on the mobile profiles. Scale the 50 ms
      // desktop budget by the same factor so both assertions represent the
      // same amount of main-thread work. Reduced motion swaps the full palette
      // in one paint, so it gets one 100 ms desktop-equivalent frame.
      const cpu = mobile ? 4 : 1;
      const reducedMotion = process.env.QA_REDUCED_MOTION === "reduce";
      const frameBudget = (reducedMotion ? 100 : 50) * cpu;
      const measured = data.measurements.map((flow) => {
        const ordered = flow.frames.toSorted((a, b) => a - b);
        const value = ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)];
        const p95 = value === undefined ? null : Number(value.toFixed(2));
        return {
          ...flow,
          frames: ordered.length,
          p95,
          slowFrames: flow.frames.filter((v) => v > 50).length,
          passed:
            flow.cls <= 0.05 && (p95 === null || p95 <= frameBudget) && !flow.opacityDrops.length,
        };
      });
      const startup = measured.filter((flow) => flow.label === "carregamento inicial");
      const flows = measured.filter((flow) => flow.label !== "carregamento inicial");
      const unexpectedMounts = Object.entries(data.mounts).filter(([, count]) => count > 1);
      const record = {
        url: page.url(),
        mobile,
        cpu,
        frameBudget,
        supported: data.supported,
        mounts: data.mounts,
        unexpectedMounts,
        flows,
        startup,
        passed:
          !unexpectedMounts.length &&
          Object.keys(data.mounts).length > 0 &&
          data.supported.includes("layout-shift") &&
          data.supported.includes("long-animation-frame") &&
          flows.some((flow) => flow.frames > 5) &&
          flows.every((flow) => flow.passed),
      };
      const id = randomUUID();
      await page.screenshot({ path: `${output}/${id}.png`, fullPage: true });
      records.push({ id, record, video: page.video() });
    }
    await close(...args);
    for (const { id, record, video } of records) {
      if (video) {
        const path = await video.path();
        const stats = spawnSync(
          "ffmpeg",
          [
            "-v",
            "error",
            "-i",
            path,
            "-vf",
            "fps=30,scale=160:-1,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-",
            "-f",
            "null",
            "-",
          ],
          { encoding: "utf8", maxBuffer: 20_000_000 },
        );
        if (stats.status !== 0)
          throw new Error("Não foi possível analisar o vídeo: " + stats.stderr);
        const luma = [...stats.stdout.matchAll(/lavfi.signalstats.YAVG=([\d.]+)/g)].map((match) =>
          Number(match[1]),
        );
        const flashes = [];
        // Transient global dimming followed by recovery within 1–2 frames. A persistent
        // theme change is not classified as a flash; videos remain available for review.
        for (let i = 1; i < luma.length - 2; i++)
          if (
            luma[i - 1] - luma[i] > 25 &&
            luma[i] < luma[i - 1] * 0.5 &&
            Math.max(luma[i + 1], luma[i + 2]) > luma[i - 1] - 10
          )
            flashes.push(i);
        record.video = { path, frames: luma.length, flashFrames: flashes };
        record.passed &&= flashes.length === 0 && luma.length > 0;
      } else {
        record.passed = false;
        record.video = { error: "Vídeo ausente" };
      }
      writeFileSync(`${output}/${id}.json`, JSON.stringify(record, null, 2));
    }
  };
}
