// Unit tests for src/inject.js — the MAIN-world interception layer.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readSrc, runScript, installSyncPostMessage, postToWorld } from '../helpers/harness.js';

const HIT = '__hmef_hit_b7f3';
const CFG = '__hmef_cfg_b7f3';
const CHROME_URL = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/probe.js';
const MOZ_URL = 'moz-extension://1111-2222/probe.png';

let hits;
let origFetch;

function setConfig(config) {
  postToWorld({ __tag: CFG, config });
}

beforeAll(() => {
  installSyncPostMessage();
  // inject.js only patches fetch if window.fetch is already a function.
  origFetch = vi.fn(() => Promise.resolve('REAL_RESPONSE'));
  window.fetch = origFetch;
  runScript(readSrc('inject.js'));

  // Capture every intercept report the page world emits.
  window.addEventListener('message', (e) => {
    if (e?.data?.__tag === HIT) hits.push(e.data);
  });
});

beforeEach(() => {
  hits = [];
  origFetch.mockClear();
  setConfig({ enabled: true, deception: false, allowlist: [] });
});

const PROBE_ID = 'abcdefghijklmnopabcdefghijklmnop'; // the id inside CHROME_URL

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetch', () => {
  it('passes normal URLs through to the original fetch', async () => {
    await expect(window.fetch('https://example.com/app.js')).resolves.toBe('REAL_RESPONSE');
    expect(origFetch).toHaveBeenCalledOnce();
    expect(hits).toHaveLength(0);
  });

  it('blocks a chrome-extension:// probe when enabled', async () => {
    await expect(window.fetch(CHROME_URL)).rejects.toBeInstanceOf(TypeError);
    expect(origFetch).not.toHaveBeenCalled();
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ vector: 'fetch', action: 'block' });
  });

  it('blocks moz-extension:// too', async () => {
    await expect(window.fetch(MOZ_URL)).rejects.toBeInstanceOf(TypeError);
    expect(hits[0].action).toBe('block');
  });

  it('reads the URL from a Request-like object', async () => {
    await expect(window.fetch({ url: CHROME_URL })).rejects.toBeInstanceOf(TypeError);
    expect(hits).toHaveLength(1);
  });

  it('passes probes through when protection is disabled', async () => {
    setConfig({ enabled: false, deception: false });
    await expect(window.fetch(CHROME_URL)).resolves.toBe('REAL_RESPONSE');
    expect(origFetch).toHaveBeenCalledOnce();
    expect(hits).toHaveLength(0);
  });

  it('returns a fake 200 in deception mode', async () => {
    setConfig({ enabled: true, deception: true });
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // < 0.5 -> fake
    const res = await window.fetch(CHROME_URL);
    expect(res.status).toBe(200);
    expect(origFetch).not.toHaveBeenCalled();
    expect(hits[0]).toMatchObject({ vector: 'fetch', action: 'fake' });
  });

  it('still blocks (not fakes) when deception RNG misses', async () => {
    setConfig({ enabled: true, deception: true });
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // >= 0.5 -> block
    await expect(window.fetch(CHROME_URL)).rejects.toBeInstanceOf(TypeError);
    expect(hits[0].action).toBe('block');
  });
});

describe('element src/href', () => {
  it('swaps a chrome-extension img.src and reports it', () => {
    const img = document.createElement('img');
    img.src = CHROME_URL;
    expect(img.getAttribute('src')).not.toContain('chrome-extension');
    expect(hits.some((h) => h.vector === 'img' && h.action === 'block')).toBe(true);
  });

  it('intercepts setAttribute("src", ...) which bypasses the property setter', () => {
    const img = document.createElement('img');
    img.setAttribute('src', CHROME_URL);
    expect(img.getAttribute('src')).not.toContain('chrome-extension');
    expect(hits.some((h) => h.vector === 'attr:src')).toBe(true);
  });

  it('leaves normal img.src untouched', () => {
    const img = document.createElement('img');
    img.src = 'https://example.com/pixel.png';
    expect(img.getAttribute('src')).toContain('example.com');
    expect(hits).toHaveLength(0);
  });
});

describe('allow-list', () => {
  it('passes an allow-listed extension fetch through untouched', async () => {
    setConfig({ enabled: true, deception: false, allowlist: [PROBE_ID] });
    await expect(window.fetch(CHROME_URL)).resolves.toBe('REAL_RESPONSE');
    expect(origFetch).toHaveBeenCalledOnce();
    expect(hits).toHaveLength(0);
  });

  it('still blocks an extension that is not on the list', async () => {
    setConfig({ enabled: true, deception: false, allowlist: ['someotherextensionidnotmatching'] });
    await expect(window.fetch(CHROME_URL)).rejects.toBeInstanceOf(TypeError);
    expect(hits[0].action).toBe('block');
  });

  it('leaves an allow-listed img.src untouched', () => {
    setConfig({ enabled: true, deception: false, allowlist: [PROBE_ID] });
    const img = document.createElement('img');
    img.src = CHROME_URL;
    expect(img.getAttribute('src')).toContain('chrome-extension');
    expect(hits).toHaveLength(0);
  });
});

describe('XMLHttpRequest', () => {
  it('fires an error event and reports a blocked probe', async () => {
    const xhr = new XMLHttpRequest();
    const onError = vi.fn();
    xhr.addEventListener('error', onError);
    xhr.open('GET', CHROME_URL);
    xhr.send();
    await new Promise((r) => setTimeout(r, 0));
    expect(onError).toHaveBeenCalledOnce();
    expect(hits.some((h) => h.vector === 'xhr' && h.action === 'block')).toBe(true);
  });
});
