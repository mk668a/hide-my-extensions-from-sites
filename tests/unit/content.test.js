// Unit tests for src/content.js — the ISOLATED-world bridge.
import { describe, it, expect, beforeAll } from 'vitest';
import { readSrc, runScript, makeChrome, installSyncPostMessage, postToWorld } from '../helpers/harness.js';

const HIT = '__hmef_hit_b7f3';
const CFG = '__hmef_cfg_b7f3';

let chrome;
let cfgMsgs;

beforeAll(() => {
  installSyncPostMessage();
  chrome = makeChrome();
  globalThis.chrome = chrome;

  cfgMsgs = [];
  window.addEventListener('message', (e) => {
    if (e?.data?.__tag === CFG) cfgMsgs.push(e.data);
  });

  runScript(readSrc('schema.js')); // publishes self.HMEFSchema, as in the manifest
  runScript(readSrc('content.js'));
});

describe('content bridge', () => {
  it('pushes the current config to the page world on load', () => {
    expect(cfgMsgs.length).toBeGreaterThanOrEqual(1);
    expect(cfgMsgs[0].config).toMatchObject({ enabled: true, deception: false });
  });

  it('announces a fresh page load to the worker (top frame)', () => {
    expect(chrome.__calls.sendMessage).toContainEqual({ type: 'pageload' });
  });

  it('forwards an intercepted probe from the page world to the worker', () => {
    const before = chrome.__calls.sendMessage.length;
    postToWorld({ __tag: HIT, url: 'chrome-extension://x/probe.js', vector: 'fetch', action: 'block' });
    const forwarded = chrome.__calls.sendMessage.slice(before);
    expect(forwarded).toContainEqual({
      type: 'hit',
      url: 'chrome-extension://x/probe.js',
      vector: 'fetch',
      action: 'block',
    });
  });

  it('ignores foreign window messages', () => {
    const before = chrome.__calls.sendMessage.length;
    postToWorld({ somethingElse: true });
    expect(chrome.__calls.sendMessage.length).toBe(before);
  });

  it('re-pushes config when storage changes', () => {
    const before = cfgMsgs.length;
    chrome.storage.local.set({ enabled: false });
    expect(cfgMsgs.length).toBeGreaterThan(before);
    expect(cfgMsgs[cfgMsgs.length - 1].config).toMatchObject({ enabled: false });
  });
});
