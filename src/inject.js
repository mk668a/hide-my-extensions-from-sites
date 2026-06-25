// inject.js — runs in the page's MAIN world at document_start.
// It patches the JS APIs a page uses to probe `chrome-extension://<id>/<resource>`
// URLs (the BrowserGate enumeration technique) and makes every probe either fail
// uniformly (passive) or return a fake "installed" result (deception, optional).
//
// It cannot touch chrome.* APIs (wrong world); it talks to content.js via
// window.postMessage using the tag below.
(() => {
  'use strict';

  const HIT = '__hmef_hit_b7f3'; // page->bridge: a probe was intercepted
  const CFG = '__hmef_cfg_b7f3'; // bridge->page: config update
  const SCHEME = /^(chrome-extension|moz-extension|safari-web-extension):\/\//i;
  // 1x1 transparent GIF — used to force `onload` ("installed") in deception mode.
  const FAKE_IMG =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  // An empty data URL — decodes to nothing, so an <img> fires `onerror` ("absent").
  const DEAD = 'data:,';

  let config = { enabled: true, deception: false, allowlist: [] };

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__tag !== CFG) return;
    if (e.data.config) config = Object.assign(config, e.data.config);
  });

  function urlOf(input) {
    try {
      if (typeof input === 'string') return input;
      if (input && typeof input === 'object' && typeof input.url === 'string') {
        return input.url; // Request / URL-like
      }
      return String(input);
    } catch (_) {
      return '';
    }
  }

  // The extension id is the host of a chrome-extension://<id>/… URL.
  function extIdOf(input) {
    const m = /^[a-z-]+:\/\/([^/]+)/i.exec(urlOf(input));
    return m ? m[1] : '';
  }

  function isAllowed(input) {
    const id = extIdOf(input);
    return id && Array.isArray(config.allowlist) && config.allowlist.includes(id);
  }

  // A probe is an extension URL we should defend against — unless its id is on
  // the user's allow-list (an extension they trust to serve page resources).
  const isProbe = (input) => SCHEME.test(urlOf(input)) && !isAllowed(input);

  function report(url, vector, action) {
    try {
      window.postMessage(
        { __tag: HIT, url: String(url).slice(0, 200), vector, action },
        '*'
      );
    } catch (_) {}
  }

  // Decide, per probe, whether deception mode fabricates a hit.
  const fakeThisOne = () => config.deception && Math.random() < 0.5;

  // --- fetch ---------------------------------------------------------------
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      if (config.enabled && isProbe(input)) {
        const url = urlOf(input);
        if (fakeThisOne()) {
          report(url, 'fetch', 'fake');
          return Promise.resolve(new Response('', { status: 200, statusText: 'OK' }));
        }
        report(url, 'fetch', 'block');
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return origFetch.apply(this, arguments);
    };
  }

  // --- XMLHttpRequest ------------------------------------------------------
  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype) {
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      this.__hmefProbe = config.enabled && isProbe(url);
      this.__hmefUrl = url;
      return origOpen.apply(this, arguments);
    };
    XHR.prototype.send = function () {
      if (!this.__hmefProbe) return origSend.apply(this, arguments);
      const fake = fakeThisOne();
      report(this.__hmefUrl, 'xhr', fake ? 'fake' : 'block');
      const xhr = this;
      // Fire synthetic completion so onreadystatechange / onload / onerror run.
      setTimeout(() => {
        try {
          Object.defineProperty(xhr, 'readyState', { configurable: true, value: 4 });
          Object.defineProperty(xhr, 'status', { configurable: true, value: fake ? 200 : 0 });
          Object.defineProperty(xhr, 'responseText', { configurable: true, value: '' });
          Object.defineProperty(xhr, 'response', { configurable: true, value: '' });
        } catch (_) {}
        try { xhr.dispatchEvent(new Event('readystatechange')); } catch (_) {}
        try { xhr.dispatchEvent(new Event(fake ? 'load' : 'error')); } catch (_) {}
        try { xhr.dispatchEvent(new Event('loadend')); } catch (_) {}
      }, 0);
    };
  }

  // --- element src/href property setters -----------------------------------
  function guardProp(proto, prop, vector) {
    if (!proto) return;
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc || typeof desc.set !== 'function') return;
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set(value) {
        if (config.enabled && isProbe(value)) {
          const fake = fakeThisOne();
          report(value, vector, fake ? 'fake' : 'block');
          return desc.set.call(this, fake ? FAKE_IMG : DEAD);
        }
        return desc.set.call(this, value);
      },
    });
  }
  guardProp(window.HTMLImageElement && HTMLImageElement.prototype, 'src', 'img');
  guardProp(window.HTMLScriptElement && HTMLScriptElement.prototype, 'src', 'script');
  guardProp(window.HTMLLinkElement && HTMLLinkElement.prototype, 'href', 'link');

  // --- setAttribute (bypasses the property setters above) ------------------
  const origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    const n = typeof name === 'string' ? name.toLowerCase() : name;
    if (config.enabled && (n === 'src' || n === 'href') && isProbe(value)) {
      const fake = fakeThisOne();
      report(value, 'attr:' + n, fake ? 'fake' : 'block');
      return origSetAttr.call(this, name, fake ? FAKE_IMG : DEAD);
    }
    return origSetAttr.apply(this, arguments);
  };
})();
