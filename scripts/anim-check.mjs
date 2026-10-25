import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
const output = process.env.QA_OUTPUT || "/tmp/gstudy-animation-check";
mkdirSync(output, { recursive: true });
const projects = [
  { name: "pixel-7", device: "Pixel 7", width: 393 },
  { name: "iphone-14", device: "iPhone 14", width: 390 },
  { name: "desktop", device: "", width: 1440 },
];
const completeSuites = (process.env.QA_SUITES || "ui,quiz-sync,stream,games,voice,board").split(
  ",",
);
const runs = projects.flatMap((project) => {
  if (process.env.QA_PROJECT && project.name !== process.env.QA_PROJECT) return [];
  const normalSuites = project.name === "iphone-14" ? ["ui"] : completeSuites;
  return [
    ...normalSuites.map((suite) => ({ project, reduced: "no-preference", suite })),
    { project, reduced: "reduce", suite: "ui" },
  ];
});
const statuses = [];
async function run(script, env, log) {
  const { createWriteStream } = await import("node:fs");
  const file = createWriteStream(log);
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(file);
    child.stderr.pipe(file);
    child.on("error", reject);
    child.on("exit", (code) => {
      file.end();
      done(code);
    });
  });
}
for (const { project, reduced, suite } of runs) {
  const directory = resolve(output, project.name, reduced, suite);
  mkdirSync(directory, { recursive: true });
  const env = {
    QA_ANIMATION: "1",
    QA_ANIMATION_OUTPUT: directory + "/metrics",
    QA_OUTPUT: directory,
    QA_WIDTHS: String(project.width),
    QA_DEVICE: project.device,
    QA_REDUCED_MOTION: reduced,
  };
  const script =
    suite === "ui"
      ? "scripts/anim-ui-check.mjs"
      : suite === "board"
        ? "scripts/board-check.mjs"
        : `scripts/${suite}-check.mjs`;
  const exit = await run(script, env, directory + "/browser.log");
  const metricsDir = directory + "/metrics";
  const metrics = existsSync(metricsDir)
    ? readdirSync(metricsDir)
        .filter((file) => file.endsWith(".json"))
        .map((file) => ({
          file: resolve(metricsDir, file),
          ...JSON.parse(readFileSync(resolve(metricsDir, file), "utf8")),
        }))
    : [];
  statuses.push({
    project: project.name,
    reduced,
    suite,
    exit,
    measurements: metrics.length,
    passed: exit === 0 && metrics.length > 0 && metrics.every((record) => record.passed),
    metrics,
  });
  writeFileSync(output + "/report.json", JSON.stringify(statuses, null, 2));
  console.log(project.name, reduced, suite, statuses.at(-1).passed ? "PASS" : "FAIL");
}
const rows = statuses
  .map(
    (status) =>
      `| ${status.project} | ${status.reduced} | ${status.suite} | ${status.passed ? "passou" : "falhou"} | ${status.measurements} |`,
  )
  .join("\n");
writeFileSync(
  output + "/report.md",
  `# Animações — medição de navegador\n\nEmulação Chromium; mobile com CPU 4×. Não equivale a teste em aparelhos físicos ou Safari. Vídeos, capturas, traces e medidas ficam em cada pasta.\n\n| Projeto | Movimento | Fluxo | Resultado | Páginas medidas |\n|---|---|---|---|---|\n${rows}\n`,
);
if (statuses.some((status) => !status.passed)) process.exitCode = 1;
