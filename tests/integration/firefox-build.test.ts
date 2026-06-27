// Integration / seam test: the Firefox manifest the build actually ships.
// Drives the real CLI (tools/firefox-manifest.ts, via tsx) against the real, shipped
// manifest.json and writes a file to a temp dir, then asserts the on-disk result
// would be accepted by Firefox MV3. This is the layer the unit test can't cover:
// it guards that the *current* Chrome manifest stays transformable and that the
// generator wires up as a real subprocess writing real bytes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let dir: string;
let ff: any;

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'hmef-ff-'));
  const out = path.join(dir, 'manifest.json');
  // The CLI is TypeScript; run it through tsx exactly as tools/pack.sh does.
  const tsx = path.join(ROOT, 'node_modules', '.bin', 'tsx');
  execFileSync(tsx, ['tools/firefox-manifest.ts', 'manifest.json', out], { cwd: ROOT });
  ff = JSON.parse(readFileSync(out, 'utf8'));
});

afterAll(() => dir && rmSync(dir, { recursive: true, force: true }));

describe('shipped Firefox manifest', () => {
  it('is MV3 with a non-persistent event-page background (no service worker)', () => {
    expect(ff.manifest_version).toBe(3);
    expect(ff.background.service_worker).toBeUndefined();
    expect(Array.isArray(ff.background.scripts)).toBe(true);
    expect(ff.background.scripts.length).toBeGreaterThan(0);
  });

  it('carries a valid gecko id and a min version that supports MAIN-world scripts', () => {
    expect(ff.browser_specific_settings.gecko.id).toMatch(/^[^@\s]+@[^@\s]+$/);
    expect(Number(ff.browser_specific_settings.gecko.strict_min_version.split('.')[0])).toBeGreaterThanOrEqual(128);
  });

  it('keeps the version in lockstep with the Chrome manifest', () => {
    const chrome = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    expect(ff.version).toBe(chrome.version);
  });

  it('still ships the MAIN-world inject script that does the actual blocking', () => {
    const main = ff.content_scripts.find((c: any) => c.world === 'MAIN');
    expect(main).toBeTruthy();
    expect(main.js).toContain('src/inject.js');
    expect(main.run_at).toBe('document_start');
  });
});
