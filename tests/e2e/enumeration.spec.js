// System / acceptance test (top of the V model): load the real unpacked
// extension in Chromium and confirm, from a real page on an http origin, that
// the MAIN-world defense rewrites extension-enumeration probes — and that the
// toggle in storage actually turns it off.
//
// Requires a Chromium that can load extensions: run headed locally, or under
// `xvfb-run` in CI. `npm run test:e2e` after `npx playwright install chromium`.
import { test, expect, chromium } from '@playwright/test';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(HERE, '../..'); // project root holds manifest.json
const FAKE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const PROBE_PAGE = `<!doctype html><meta charset="utf-8"><title>probe</title>
<script>
  window.__probe = {
    imgSrcAfter(url) {
      const img = document.createElement('img');
      img.src = url;
      return img.getAttribute('src');
    },
    async fetchProbe(url) {
      try { await fetch(url); return 'resolved'; }
      catch (e) { return 'rejected:' + e.name; }
    }
  };
</script>
<body>probe fixture</body>`;

let server;
let baseURL;
let context;
let userDataDir;

test.beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(PROBE_PAGE);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseURL = `http://127.0.0.1:${server.address().port}/`;

  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hmef-e2e-'));
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium', // full build's new headless mode supports extensions
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
    ],
  });
  // Ensure the service worker is up before driving storage.
  if (!context.serviceWorkers().length) {
    await context.waitForEvent('serviceworker');
  }
});

test.afterAll(async () => {
  await context?.close();
  await new Promise((r) => server?.close(r));
  if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
});

async function setEnabled(enabled) {
  const [sw] = context.serviceWorkers();
  await sw.evaluate(async (v) => {
    await chrome.storage.local.set({ enabled: v, deception: false });
  }, enabled);
}

test('rewrites a chrome-extension img probe when protection is on', async () => {
  await setEnabled(true);
  const page = await context.newPage();
  await page.goto(baseURL);

  const url = `chrome-extension://${FAKE_ID}/probe.png`;
  const after = await page.evaluate((u) => window.__probe.imgSrcAfter(u), url);

  expect(after).not.toContain('chrome-extension');
  await page.close();
});

test('lets the probe through when protection is off', async () => {
  await setEnabled(false);
  const page = await context.newPage(); // fresh load picks up the new config
  await page.goto(baseURL);

  const url = `chrome-extension://${FAKE_ID}/probe.png`;
  const after = await page.evaluate((u) => window.__probe.imgSrcAfter(u), url);

  expect(after).toContain('chrome-extension');
  await page.close();
  await setEnabled(true);
});

test('rejects a chrome-extension fetch probe when protection is on', async () => {
  await setEnabled(true);
  const page = await context.newPage();
  await page.goto(baseURL);

  const result = await page.evaluate(
    (u) => window.__probe.fetchProbe(u),
    `chrome-extension://${FAKE_ID}/x.js`
  );
  expect(result).toContain('rejected');
  await page.close();
});
