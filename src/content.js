// content.js — runs in the ISOLATED world. Bridges the MAIN-world inject.js
// (which has no chrome.* access) to the service worker and to storage.
(() => {
  'use strict';

  const HIT = '__hmef_hit_b7f3';
  const CFG = '__hmef_cfg_b7f3';
  const BOOT = '__hmef_boot_b7f3';
  const DEFAULTS = { enabled: true, deception: false, allowlist: [] };

  // A per-load secret the page world (inject.js) requires on every config update.
  // We run at document_start, before any page script, so posting it now means the
  // page never observes it and can't forge a CFG message to disable protection.
  const nonce =
    (self.crypto && typeof self.crypto.randomUUID === 'function')
      ? self.crypto.randomUUID()
      : String(Math.random()).slice(2) + String(Date.now());

  function pushConfig() {
    chrome.storage.local.get(DEFAULTS, (cfg) => {
      window.postMessage({ __tag: CFG, nonce, config: cfg }, '/');
    });
  }

  // Hand the page world the nonce first (synchronously), then push config.
  window.postMessage({ __tag: BOOT, nonce }, '/');
  pushConfig();
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') pushConfig();
  });

  // Tell the worker a fresh page loaded (top frame only) so it can reset the badge.
  if (window.top === window) {
    try { chrome.runtime.sendMessage({ type: 'pageload' }); } catch (_) {}
  }

  // Relay intercepted probes from the page world to the worker.
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__tag !== HIT) return;
    try {
      chrome.runtime.sendMessage({
        type: 'hit',
        url: e.data.url,
        vector: e.data.vector,
        action: e.data.action,
      });
    } catch (_) {}
  });
})();
