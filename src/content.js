// content.js — runs in the ISOLATED world. Bridges the MAIN-world inject.js
// (which has no chrome.* access) to the service worker and to storage.
(() => {
  'use strict';

  const HIT = '__hmef_hit_b7f3';
  const CFG = '__hmef_cfg_b7f3';
  const DEFAULTS = { enabled: true, deception: false, allowlist: [] };

  function pushConfig() {
    chrome.storage.local.get(DEFAULTS, (cfg) => {
      window.postMessage({ __tag: CFG, config: cfg }, '*');
    });
  }

  // Send current config to the page world as early as possible, then keep it synced.
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
