// Integration test — wires all three real scripts (inject ↔ content ↔ background)
// in one global and drives them from a simulated page action, exercising the
// postMessage → runtime.sendMessage → badge seam end to end.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readSrc, runScript, makeChrome, installSyncPostMessage } from '../helpers/harness.js';

const CHROME_URL = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/probe.js';
const TAB = 5;

let chrome;
let origFetch;

function badgesFor(tabId) {
  return chrome.__calls.setBadgeText.filter((b) => b.tabId === tabId);
}
function lastBadgeText(tabId) {
  const b = badgesFor(tabId);
  return b.length ? b[b.length - 1].text : undefined;
}

beforeAll(() => {
  installSyncPostMessage();
  chrome = makeChrome({ sender: { tab: { id: TAB } } });
  globalThis.chrome = chrome;

  origFetch = vi.fn(() => Promise.resolve('REAL_RESPONSE'));
  window.fetch = origFetch;

  // Order mirrors the manifest: worker first, then the MAIN-world inject, then
  // the ISOLATED pair (schema.js publishes HMEFSchema before content.js uses it).
  runScript(readSrc('background.js'));
  runScript(readSrc('inject.js'));
  runScript(readSrc('schema.js'));
  runScript(readSrc('content.js'));
});

beforeEach(() => {
  origFetch.mockClear();
  // Reset this tab's worker state between cases.
  chrome.__sender = { tab: { id: TAB } };
  chrome.runtime.sendMessage({ type: 'pageload' });
});

afterEach(() => vi.restoreAllMocks());

describe('end-to-end probe defense', () => {
  it('a page probe is rejected AND surfaces on the badge', async () => {
    chrome.__sender = { tab: { id: TAB } };
    await expect(window.fetch(CHROME_URL)).rejects.toBeInstanceOf(TypeError);
    expect(origFetch).not.toHaveBeenCalled();
    expect(lastBadgeText(TAB)).toBe('1');
  });

  it('deception mode (via storage) makes the probe a fake 200 and logs it', async () => {
    chrome.storage.local.set({ enabled: true, deception: true }); // re-pushes config to inject
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    chrome.__sender = { tab: { id: TAB } };

    const res = await window.fetch(CHROME_URL);
    expect(res.status).toBe(200);

    let stats;
    chrome.runtime.sendMessage({ type: 'getStats', tabId: TAB }, (s) => (stats = s));
    expect(stats.count).toBe(1);
    expect(stats.log[0]).toMatchObject({ action: 'fake' });

    chrome.storage.local.set({ enabled: true, deception: false }); // restore
  });

  it('disabling protection (via storage) lets probes through with no badge', async () => {
    chrome.storage.local.set({ enabled: false, deception: false });
    chrome.__sender = { tab: { id: TAB } };

    await expect(window.fetch(CHROME_URL)).resolves.toBe('REAL_RESPONSE');
    expect(origFetch).toHaveBeenCalledOnce();

    let stats;
    chrome.runtime.sendMessage({ type: 'getStats', tabId: TAB }, (s) => (stats = s));
    expect(stats.count).toBe(0);

    chrome.storage.local.set({ enabled: true, deception: false }); // restore
  });
});
