// Integration / seam test: schema.js + content.js against storage holding an old,
// corrupt config (no schemaVersion, a non-boolean `enabled`, a non-array
// allowlist, and a stray legacy key). Proves the migration (1) hands inject a
// clean frozen-shape config, (2) persists the upgrade, and (3) converges — it
// writes exactly once and does not loop against its own storage.onChanged.
import { describe, it, expect, beforeAll } from 'vitest';
import { readSrc, runScript, makeChrome, installSyncPostMessage } from '../helpers/harness';

const CFG = '__hmef_cfg_b7f3';

let chrome: any;
let lastCfg: any;

beforeAll(() => {
  installSyncPostMessage();
  // A messy legacy store: fail-unsafe `enabled`, junk allowlist, unknown key.
  chrome = makeChrome({ store: { enabled: 'nope', allowlist: 'x', legacyKey: 7 } });
  globalThis.chrome = chrome;

  window.addEventListener('message', (e) => {
    if (e?.data?.__tag === CFG) lastCfg = e.data.config;
  });

  runScript(readSrc('schema.js'));
  runScript(readSrc('content.js'));
});

describe('config migration on load', () => {
  it('hands inject a clean, frozen-shape config (fail-safe enabled, array allowlist)', () => {
    expect(lastCfg).toEqual({ schemaVersion: 1, enabled: true, deception: false, allowlist: [] });
  });

  it('persists the upgrade to storage with a schemaVersion', () => {
    const writes = chrome.__calls.storageSet;
    expect(writes.length).toBeGreaterThanOrEqual(1);
    expect(writes[0]).toMatchObject({ schemaVersion: 1, enabled: true, allowlist: [] });
  });

  it('converges: it writes exactly once and does not loop on its own change event', () => {
    expect(chrome.__calls.storageSet.length).toBe(1);
  });
});
