// Unit tests for src/inject.js — the MAIN-world interception layer.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readSrc, runScript, installSyncPostMessage, postToWorld } from '../helpers/harness.js';

const HIT = '__hmef_hit_b7f3';
const CFG = '__hmef_cfg_b7f3';
const BOOT = '__hmef_boot_b7f3';
const TEST_NONCE = 'test-nonce-7f3b';
const CHROME_URL = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/probe.js';
const MOZ_URL = 'moz-extension://1111-2222/probe.png';

let hits;
let origFetch;
let origBeacon;
let esUrls; // urls the underlying EventSource constructor actually saw

function setConfig(config) {
  postToWorld({ __tag: CFG, nonce: TEST_NONCE, config });
}

beforeAll(() => {
  installSyncPostMessage();
  // inject.js only wraps these if they already exist; jsdom ships none of them,
  // so stand up minimal stubs BEFORE loading the script so it can wrap them.
  origFetch = vi.fn(() => Promise.resolve('REAL_RESPONSE'));
  window.fetch = origFetch;

  origBeacon = vi.fn(() => true);
  Object.defineProperty(navigator, 'sendBeacon', {
    value: origBeacon,
    configurable: true,
    writable: true,
  });

  esUrls = [];
  class FakeEventSource {
    constructor(url) {
      this.url = String(url);
      esUrls.push(this.url);
    }
  }
  FakeEventSource.CONNECTING = 0;
  FakeEventSource.OPEN = 1;
  FakeEventSource.CLOSED = 2;
  window.EventSource = FakeEventSource;

  runScript(readSrc('inject.js'));

  // Complete the per-load nonce handshake the real content script performs,
  // so config updates below are accepted.
  postToWorld({ __tag: BOOT, nonce: TEST_NONCE });

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

describe('iframe / object / embed vectors', () => {
  it('neutralizes a chrome-extension iframe.src', () => {
    const el = document.createElement('iframe');
    el.src = CHROME_URL;
    expect(el.getAttribute('src')).not.toContain('chrome-extension');
    expect(hits.some((h) => h.vector === 'iframe' && h.action === 'block')).toBe(true);
  });

  it('neutralizes a chrome-extension object.data', () => {
    const el = document.createElement('object');
    el.data = CHROME_URL;
    expect(el.getAttribute('data')).not.toContain('chrome-extension');
    expect(hits.some((h) => h.vector === 'object' && h.action === 'block')).toBe(true);
  });

  it('neutralizes a chrome-extension embed.src', () => {
    const el = document.createElement('embed');
    el.src = CHROME_URL;
    expect(el.getAttribute('src')).not.toContain('chrome-extension');
    expect(hits.some((h) => h.vector === 'embed' && h.action === 'block')).toBe(true);
  });

  it('intercepts setAttribute("data", ...) on <object>', () => {
    const el = document.createElement('object');
    el.setAttribute('data', CHROME_URL);
    expect(el.getAttribute('data')).not.toContain('chrome-extension');
    expect(hits.some((h) => h.vector === 'attr:data')).toBe(true);
  });
});

describe('SVG xlink:href + srcset vectors', () => {
  const XLINK = 'http://www.w3.org/1999/xlink';

  it('intercepts setAttributeNS(xlink, "xlink:href", ...) on an SVG <use>', () => {
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttributeNS(XLINK, 'xlink:href', CHROME_URL);
    expect(use.getAttributeNS(XLINK, 'href') || '').not.toContain('chrome-extension');
    expect(hits.some((h) => h.vector === 'attr:href')).toBe(true);
  });

  it('intercepts a chrome-extension srcset via setAttribute', () => {
    const img = document.createElement('img');
    img.setAttribute('srcset', CHROME_URL + ' 1x');
    expect(img.getAttribute('srcset')).not.toContain('chrome-extension');
    expect(hits.some((h) => h.vector === 'attr:srcset')).toBe(true);
  });

  it('neutralizes a chrome-extension img.srcset property', () => {
    const img = document.createElement('img');
    img.srcset = CHROME_URL;
    expect(img.getAttribute('srcset')).not.toContain('chrome-extension');
    expect(hits.some((h) => h.vector === 'srcset')).toBe(true);
  });
});

describe('CSS background-image vector', () => {
  // Only the cross-browser-interceptable paths are covered: setProperty(),
  // cssText, and setAttribute('style', …). Direct `el.style.backgroundImage = …`
  // is a native named setter in Chrome (not on the prototype) and is a known gap.
  it('neutralizes a chrome-extension url() set via setProperty', () => {
    const d = document.createElement('div');
    d.style.setProperty('background-image', `url(${CHROME_URL})`);
    expect(d.style.getPropertyValue('background-image')).not.toContain('chrome-extension');
    expect(hits.some((h) => h.vector === 'css')).toBe(true);
  });

  it('neutralizes a chrome-extension url() set via cssText', () => {
    const d = document.createElement('div');
    d.style.cssText = `background-image:url(${CHROME_URL})`;
    expect(d.style.cssText).not.toContain('chrome-extension');
    expect(hits.some((h) => h.vector === 'css')).toBe(true);
  });

  it('neutralizes a chrome-extension url() set via setAttribute("style")', () => {
    const d = document.createElement('div');
    d.setAttribute('style', `background-image:url(${CHROME_URL})`);
    expect(d.getAttribute('style')).not.toContain('chrome-extension');
    expect(hits.some((h) => h.vector === 'css')).toBe(true);
  });

  it('leaves a normal background url() alone', () => {
    const d = document.createElement('div');
    d.style.setProperty('background-image', 'url(https://example.com/p.png)');
    expect(d.style.getPropertyValue('background-image')).toContain('example.com');
    expect(hits).toHaveLength(0);
  });
});

describe('config nonce hardening', () => {
  it('ignores a spoofed config update that carries no nonce', async () => {
    postToWorld({ __tag: CFG, config: { enabled: false } }); // attacker, no nonce
    // Protection must remain on.
    await expect(window.fetch(CHROME_URL)).rejects.toBeInstanceOf(TypeError);
    expect(origFetch).not.toHaveBeenCalled();
  });

  it('ignores a config update with the wrong nonce', async () => {
    postToWorld({ __tag: CFG, nonce: 'not-the-nonce', config: { enabled: false } });
    await expect(window.fetch(CHROME_URL)).rejects.toBeInstanceOf(TypeError);
    expect(origFetch).not.toHaveBeenCalled();
  });

  it('cannot be re-bootstrapped with a different nonce', async () => {
    postToWorld({ __tag: BOOT, nonce: 'attacker-nonce' }); // too late, locked
    postToWorld({ __tag: CFG, nonce: 'attacker-nonce', config: { enabled: false } });
    await expect(window.fetch(CHROME_URL)).rejects.toBeInstanceOf(TypeError);
    // The real nonce still works.
    setConfig({ enabled: false, deception: false });
    await expect(window.fetch(CHROME_URL)).resolves.toBe('REAL_RESPONSE');
  });

  it('stamps the shared nonce on outgoing hit reports', async () => {
    await expect(window.fetch(CHROME_URL)).rejects.toBeInstanceOf(TypeError);
    expect(hits.at(-1).nonce).toBe(TEST_NONCE);
  });
});

describe('navigator.sendBeacon', () => {
  it('blocks a chrome-extension beacon (returns false, does not send, reports)', () => {
    const ok = navigator.sendBeacon(CHROME_URL, 'x');
    expect(ok).toBe(false);
    expect(origBeacon).not.toHaveBeenCalled();
    expect(hits.some((h) => h.vector === 'beacon' && h.action === 'block')).toBe(true);
  });

  it('passes a normal beacon through to the real sendBeacon', () => {
    const ok = navigator.sendBeacon('https://example.com/collect', 'x');
    expect(ok).toBe(true);
    expect(origBeacon).toHaveBeenCalledOnce();
    expect(hits).toHaveLength(0);
  });
});

describe('EventSource', () => {
  it('redirects a chrome-extension EventSource to a dead url and reports', () => {
    const es = new EventSource(CHROME_URL);
    expect(es.url).not.toContain('chrome-extension');
    expect(esUrls.at(-1)).not.toContain('chrome-extension');
    expect(hits.some((h) => h.vector === 'eventsource')).toBe(true);
  });

  it('leaves a normal EventSource url alone', () => {
    const es = new EventSource('https://example.com/sse');
    expect(es.url).toContain('example.com');
    expect(hits).toHaveLength(0);
  });

  it('preserves the static readyState constants', () => {
    expect(EventSource.CONNECTING).toBe(0);
    expect(EventSource.OPEN).toBe(1);
    expect(EventSource.CLOSED).toBe(2);
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
