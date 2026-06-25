// inject.js — runs in the page's MAIN world at document_start.
// It patches the JS APIs a page uses to probe `chrome-extension://<id>/<resource>`
// URLs (the BrowserGate enumeration technique) and makes every probe either fail
// uniformly (passive) or return a fake "installed" result (deception, optional).
//
// It cannot touch chrome.* APIs (wrong world); it talks to content.js via
// window.postMessage using the tag below.
(() => {
  'use strict';

  const HIT = '__hmef_hit_b7f3';  // page->bridge: a probe was intercepted
  const CFG = '__hmef_cfg_b7f3';  // bridge->page: config update
  const BOOT = '__hmef_boot_b7f3'; // bridge->page: one-time per-load nonce handshake
  const SCHEME = /^(chrome-extension|moz-extension|safari-web-extension):\/\//i;
  // 1x1 transparent GIF — used to force `onload` ("installed") in deception mode.
  const FAKE_IMG =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  // An empty data URL — decodes to nothing, so an <img> fires `onerror` ("absent").
  const DEAD = 'data:,';

  let config = { enabled: true, deception: false, allowlist: [] };

  // Per-load shared secret. content.js (ISOLATED world) posts it once, before
  // any page script can run, so the page never learns it. Every config update is
  // then required to carry it — a page can't spoof a CFG message to disable
  // protection without the nonce, and can't sniff one (the tags are namespaced
  // and the channel is same-origin only).
  let nonce = null;

  window.addEventListener('message', (e) => {
    // e.source === window means it came from THIS window (not another frame);
    // combined with the '/' (same-origin) targetOrigin our sender uses, that is
    // the trust boundary. The nonce authenticates the privileged content script.
    if (e.source !== window || !e.data) return;
    const d = e.data;
    if (d.__tag === BOOT) {
      if (nonce === null && typeof d.nonce === 'string' && d.nonce) nonce = d.nonce;
      return;
    }
    if (d.__tag === CFG && nonce !== null && d.nonce === nonce && d.config) {
      config = Object.assign(config, d.config);
    }
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
    if (nonce === null) return; // not bootstrapped yet — nowhere trusted to report
    try {
      window.postMessage(
        { __tag: HIT, nonce, url: String(url).slice(0, 200), vector, action },
        '/' // same-origin only; never broadcast to other-origin frames
      );
    } catch (_) {}
  }

  // Decide, per probe, whether deception mode fabricates a hit.
  const fakeThisOne = () => config.deception && Math.random() < 0.5;

  // The single decision point every interceptor funnels through. Returns null
  // when `input` is not something we should act on; otherwise reports the hit
  // and returns { fake } so the caller applies the matching neutralization.
  function intercept(input, vector) {
    if (!config.enabled || !isProbe(input)) return null;
    const fake = fakeThisOne();
    report(urlOf(input), vector, fake ? 'fake' : 'block');
    return { fake };
  }

  // --- fetch ---------------------------------------------------------------
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      const hit = intercept(input, 'fetch');
      if (hit) {
        return hit.fake
          ? Promise.resolve(new Response('', { status: 200, statusText: 'OK' }))
          : Promise.reject(new TypeError('Failed to fetch'));
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
        const hit = intercept(value, vector);
        if (hit) return desc.set.call(this, hit.fake ? FAKE_IMG : DEAD);
        return desc.set.call(this, value);
      },
    });
  }
  guardProp(window.HTMLImageElement && HTMLImageElement.prototype, 'src', 'img');
  guardProp(window.HTMLScriptElement && HTMLScriptElement.prototype, 'src', 'script');
  guardProp(window.HTMLLinkElement && HTMLLinkElement.prototype, 'href', 'link');
  guardProp(window.HTMLIFrameElement && HTMLIFrameElement.prototype, 'src', 'iframe');
  guardProp(window.HTMLObjectElement && HTMLObjectElement.prototype, 'data', 'object');
  guardProp(window.HTMLEmbedElement && HTMLEmbedElement.prototype, 'src', 'embed');
  guardProp(window.HTMLImageElement && HTMLImageElement.prototype, 'srcset', 'srcset');
  guardProp(window.HTMLSourceElement && HTMLSourceElement.prototype, 'src', 'source');
  guardProp(window.HTMLSourceElement && HTMLSourceElement.prototype, 'srcset', 'srcset');

  // --- setAttribute (bypasses the property setters above) ------------------
  // Attribute names that carry a URL we should police. `data` covers <object>,
  // `srcset` covers <img>/<source>, `href` covers <a>/<link> and SVG <use>.
  const URL_ATTRS = new Set(['src', 'href', 'data', 'srcset']);
  const localName = (name) =>
    typeof name === 'string' ? name.split(':').pop().toLowerCase() : name;

  const origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    const n = localName(name);
    if (URL_ATTRS.has(n)) {
      const hit = intercept(value, 'attr:' + n);
      if (hit) return origSetAttr.call(this, name, hit.fake ? FAKE_IMG : DEAD);
    }
    if (n === 'style') {
      const scrubbed = scrubCss(value); // inline style can hide url(chrome-extension://…)
      if (scrubbed != null) return origSetAttr.call(this, name, scrubbed);
    }
    return origSetAttr.apply(this, arguments);
  };

  // setAttributeNS reaches xlink:href on SVG <use> — a namespaced bypass of the
  // plain setAttribute path above.
  const origSetAttrNS = Element.prototype.setAttributeNS;
  Element.prototype.setAttributeNS = function (ns, name, value) {
    const n = localName(name);
    if (URL_ATTRS.has(n)) {
      const hit = intercept(value, 'attr:' + n);
      if (hit) return origSetAttrNS.call(this, ns, name, hit.fake ? FAKE_IMG : DEAD);
    }
    return origSetAttrNS.apply(this, arguments);
  };

  // --- CSS url() (background-image, mask, cursor, …) ------------------------
  // A page can hide a probe inside `url(chrome-extension://…)` in a CSS value.
  // We rewrite the embedded URL while leaving the rest of the declaration.
  //
  // We only hook the paths that are reliably interceptable cross-browser:
  // setProperty(), the cssText setter, and setAttribute('style', …). In Chrome
  // the per-longhand camelCase accessors (`el.style.backgroundImage = …`) are
  // native named setters absent from CSSStyleDeclaration.prototype, so they
  // cannot be patched there — that direct-property path is a known gap. It is
  // also a poor enumeration oracle (CSS gives no load/error signal), so probes
  // overwhelmingly use fetch/img/script/link instead.
  const CSS_URL =
    /url\(\s*(['"]?)((?:chrome-extension|moz-extension|safari-web-extension):\/\/[^'")\s]+)\1\s*\)/gi;
  function scrubCss(value) {
    if (!config.enabled || typeof value !== 'string' || value.indexOf('-extension://') < 0) {
      return null;
    }
    let touched = false;
    const out = value.replace(CSS_URL, (m, _q, url) => {
      const hit = intercept(url, 'css');
      if (!hit) return m; // allow-listed or disabled
      touched = true;
      return 'url(' + (hit.fake ? FAKE_IMG : DEAD) + ')';
    });
    return touched ? out : null;
  }

  function guardCssProp(proto, prop) {
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc || typeof desc.set !== 'function') return;
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get: desc.get,
      set(value) {
        const scrubbed = scrubCss(value);
        return desc.set.call(this, scrubbed == null ? value : scrubbed);
      },
    });
  }

  const CSSProto = window.CSSStyleDeclaration && CSSStyleDeclaration.prototype;
  if (CSSProto) {
    const origSetProperty = CSSProto.setProperty;
    if (typeof origSetProperty === 'function') {
      CSSProto.setProperty = function (name, value, priority) {
        const scrubbed = scrubCss(value);
        return origSetProperty.call(this, name, scrubbed == null ? value : scrubbed, priority);
      };
    }
    guardCssProp(CSSProto, 'cssText'); // configurable in Chrome and jsdom
  }

  // --- navigator.sendBeacon ------------------------------------------------
  // Block returns false ("not queued" — looks the same as a real cross-scheme
  // failure); deception returns true to claim the beacon was accepted.
  const origBeacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
  if (typeof origBeacon === 'function') {
    navigator.sendBeacon = function (url, data) {
      const hit = intercept(url, 'beacon');
      if (hit) return !!hit.fake;
      return origBeacon(url, data);
    };
  }

  // --- EventSource ---------------------------------------------------------
  // SSE can't be plausibly faked, so a probe is always redirected to a dead URL
  // and fails uniformly. (WebSocket only accepts ws/wss, so it is not a probe
  // channel and needs no guard.)
  const OrigES = window.EventSource;
  if (typeof OrigES === 'function') {
    const PatchedES = function (url, init) {
      const hit = intercept(url, 'eventsource');
      return new OrigES(hit ? DEAD : url, init);
    };
    PatchedES.prototype = OrigES.prototype;
    for (const k of ['CONNECTING', 'OPEN', 'CLOSED']) {
      try { PatchedES[k] = OrigES[k]; } catch (_) {}
    }
    window.EventSource = PatchedES;
  }
})();
