import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { qaContext, qaUser } from "./qa-browser.mjs";
import { qaDatabase } from "./qa-database.mjs";
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3002",
  output = process.env.QA_OUTPUT || "/tmp/gstudy-voice-check";
mkdirSync(output, { recursive: true });
const userB = {
  ...qaUser,
  id: "22222222-2222-4222-8222-222222222222",
  email: "bruno@example.test",
  user_metadata: { full_name: "Bruno Lima" },
};
const group = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
// A real looping tone lets the Web Audio analyser measure actual received samples.
const samples = 48000 * 4,
  pcm = Buffer.alloc(44 + samples * 2);
pcm.write("RIFF");
pcm.writeUInt32LE(36 + samples * 2, 4);
pcm.write("WAVEfmt ", 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(48000, 24);
pcm.writeUInt32LE(96000, 28);
pcm.writeUInt16LE(2, 32);
pcm.writeUInt16LE(16, 34);
pcm.write("data", 36);
pcm.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++)
  pcm.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 440) / 48000) * 10000), 44 + i * 2);
writeFileSync(`${output}/tone.wav`, pcm);
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: [
    "--no-sandbox",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-audio-capture=${output}/tone.wav`,
    "--auto-select-tab-capture-source-by-title=GStudy",
    "--allow-http-screen-capture",
  ],
});
const results = [];
const until = async (check, timeout = 15000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("A condição não foi atendida antes do prazo");
};
const layouts = (process.env.QA_WIDTHS || "390,1440").split(",").map(Number);
try {
  for (const width of layouts)
    for (const theme of (process.env.QA_THEMES || "light,dark").split(",")) {
      const { db, attach } = await qaDatabase([qaUser, userB]);
      await db.query(
        `insert into public.friendships(user_id,friend_id,status) values($1,$2,'accepted');`,
        [qaUser.id, userB.id],
      );
      await db.query(
        `insert into public.study_groups(id,name,created_by,invite_code) values($1,'Grupo de revisão',$2,'VOICEQA');`,
        [group, qaUser.id],
      );
      await db.query(
        `insert into public.group_members(group_id,user_id,role) values($1,$2,'admin'),($1,$3,'member');`,
        [group, qaUser.id, userB.id],
      );
      const a = await qaContext(browser, { width, theme, user: qaUser, hasTouch: width < 768 }),
        b = await qaContext(browser, { width, theme, user: userB, hasTouch: width < 768 });
      const contexts = [a, b],
        errors = [];
      for (const [i, context] of contexts.entries()) {
        await attach(context, i === 0 ? qaUser : userB);
        await context.route(`${base}/_serverFn/**`, (route) =>
          route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
        );
        await context.addInitScript(() => {
          window.__qaPeers = [];
          window.__qaMedia = [];
          const Native = window.RTCPeerConnection;
          window.RTCPeerConnection = class extends Native {
            constructor(...args) {
              super(...args);
              window.__qaPeers.push(this);
            }
          };
          const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia = async (...args) => {
            const stream = await original(...args);
            window.__qaMedia.push(stream);
            return stream;
          };
        });
        await context.tracing.start({ screenshots: true, snapshots: true });
      }
      const pa = await a.newPage(),
        pb = await b.newPage();
      for (const page of [pa, pb]) {
        page.setDefaultTimeout(15000);
        page.on("pageerror", (error) => errors.push(error.message));
      }
      let sharing = "not-run";
      try {
        await Promise.all([
          pa.goto(`${base}/sessoes?tab=groups`),
          pb.goto(`${base}/sessoes?tab=groups`),
        ]);
        await pa.getByRole("button", { name: "Ligar", exact: true }).click();
        await pb.getByRole("dialog", { name: /Ligação de Ana/ }).waitFor();
        assert.equal(await pb.evaluate(() => window.__qaMedia.length), 0);
        await pb.getByRole("button", { name: "Recusar", exact: true }).click();
        if (width < 900) await pa.getByRole("button", { name: "Pessoas", exact: true }).click();
        await pa.getByRole("tab", { name: "Amigos", exact: true }).click();
        const retry = pa.getByRole("button", { name: /Chamar(?: em \d+s)?$/, exact: false });
        await until(async () => /Chamar em \d+s/.test(await retry.innerText()));
        assert.equal(await retry.isDisabled(), true);
        await pb.goto(`${base}/configuracoes?tab=preferences`);
        await pb.getByLabel("Duração de Não perturbar").selectOption("hour");
        await until(async () => !(await retry.isDisabled()), 35000);
        await retry.click();
        await until(
          async () =>
            Number(
              (
                await db.query(
                  `select count(*)::int as n from public.notifications where type='missed_call'`,
                )
              ).rows[0].n,
            ) > 0,
        );
        assert.equal(await pb.getByRole("dialog", { name: /Ligação/ }).count(), 0);
        await pb.getByLabel("Duração de Não perturbar").selectOption("off");
        await until(async () => !(await retry.isDisabled()));
        await retry.click();
        await pb.getByRole("dialog", { name: /Ligação de Ana/ }).waitFor();
        await pb.getByRole("button", { name: "Atender", exact: true }).click();
        if (width < 900)
          await pa.getByRole("button", { name: "Fechar", exact: true }).last().click();
        await until(
          async () =>
            (await pa.locator(".call-member-tile").count()) === 2 &&
            (await pb.locator(".call-member-tile").count()) === 2,
        );
        await until(
          async () =>
            (await pa.evaluate(() =>
              window.__qaPeers.some((p) => p.connectionState === "connected"),
            )) &&
            (await pb.evaluate(() =>
              window.__qaPeers.some((p) => p.connectionState === "connected"),
            )),
          25000,
        );
        assert.equal(await pa.evaluate(() => window.__qaMedia.length), 0);
        assert.equal(await pb.evaluate(() => window.__qaMedia.length), 0);
        await pa.getByRole("button", { name: "Ativar microfone", exact: true }).click();
        await until(
          async () =>
            await pb
              .locator(`[data-user-id="${qaUser.id}"]`)
              .evaluate((node) => Number(node.style.getPropertyValue("--voice-level")) > 0.05),
        );
        const bytes = await pb.evaluate(async () => {
          let total = 0;
          for (const pc of window.__qaPeers) {
            const stats = await pc.getStats();
            stats.forEach((s) => {
              if (s.type === "inbound-rtp" && s.kind === "audio") total += s.bytesReceived;
            });
          }
          return total;
        });
        assert(bytes > 0);
        await pa.screenshot({ path: `${output}/${width}-${theme}-call.png`, fullPage: true });
        await pb.screenshot({ path: `${output}/${width}-${theme}-remote.png`, fullPage: true });
        await pa.getByRole("button", { name: "Desligar microfone", exact: true }).click();
        assert.equal(
          await pa.evaluate(() => window.__qaMedia[0].getAudioTracks()[0].enabled),
          false,
        );
        await pb.getByRole("button", { name: "Ativar microfone", exact: true }).click();
        if (width < 900) await pa.getByRole("button", { name: "Pessoas", exact: true }).click();
        await pa.getByRole("tab", { name: "Na chamada", exact: true }).click();
        await pa.getByRole("button", { name: "Silenciar", exact: true }).click();
        await until(
          async () =>
            await pb.getByRole("button", { name: "Ativar microfone", exact: true }).isDisabled(),
        );
        assert.equal(
          await pb.evaluate(() => window.__qaMedia[0].getAudioTracks()[0].enabled),
          false,
        );
        if (width < 900)
          await pa.getByRole("button", { name: "Fechar", exact: true }).last().click();
        const share = pa.getByRole("button", { name: "Compartilhar tela", exact: true });
        const supportsShare = await pa.evaluate(
          () => typeof navigator.mediaDevices?.getDisplayMedia === "function",
        );
        if (supportsShare) {
          await share.waitFor();
          await share.click();
          await pa.getByRole("button", { name: "GStudy", exact: true }).click();
          try {
            const video = pb.locator('video[aria-label="Tela compartilhada na chamada"]');
            await video.waitFor({ timeout: 8000 });
            await until(() => video.evaluate((node) => node.readyState >= 2), 8000);
            sharing = "received";
          } catch {
            sharing = "capture-not-granted-in-headless";
          }
          if (await pa.getByRole("button", { name: "Parar compartilhamento", exact: true }).count())
            await pa.getByRole("button", { name: "Parar compartilhamento", exact: true }).click();
        } else sharing = "unsupported";
        for (const page of [pa, pb])
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
          );
        assert.deepEqual(errors, []);
        await pb.getByRole("button", { name: "Sair da chamada", exact: true }).click();
        await until(async () => (await pa.locator(".call-member-tile").count()) === 1);
        await pa.getByRole("button", { name: "Sair da chamada", exact: true }).click();
        await pa.getByRole("heading", { name: "Sua chamada terminou" }).waitFor();
        assert.equal(
          await pa.evaluate(() => window.__qaPeers.every((p) => p.connectionState === "closed")),
          true,
        );
        results.push({
          width,
          theme,
          passed: true,
          audioBytesReceived: bytes,
          sharing,
          initialSnapshotFailure: process.env.QA_RETRY_SNAPSHOT === "1",
        });
      } catch (error) {
        const peers = await Promise.all(
          [pa, pb].map((page) =>
            page.evaluate(() =>
              window.__qaPeers.map((p) => ({
                state: p.connectionState,
                ice: p.iceConnectionState,
                gathering: p.iceGatheringState,
                hasLocalDescription: Boolean(p.localDescription),
                hasRemoteDescription: Boolean(p.remoteDescription),
                candidateTypes: [...(p.localDescription?.sdp.matchAll(/ typ (\w+)/g) ?? [])].map(
                  (match) => match[1],
                ),
              })),
            ),
          ),
        );
        results.push({
          width,
          theme,
          passed: false,
          error: error.stack ?? String(error),
          pageErrors: errors,
          peers,
        });
        await pa.screenshot({ path: `${output}/${width}-${theme}-failure-a.png`, fullPage: true });
        await pb.screenshot({ path: `${output}/${width}-${theme}-failure-b.png`, fullPage: true });
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
