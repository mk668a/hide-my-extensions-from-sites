// content.js — runs in the ISOLATED world. Bridges the MAIN-world inject.js
// (which has no chrome.* access) to the service worker and to storage.
(() => {
  'use strict';

  const HIT = '__hmef_hit_b7f3';
  const CFG = '__hmef_cfg_b7f3';
  const BOOT = '__hmef_boot_b7f3';
  // schema.js runs first in this same isolated world and publishes HMEFSchema.
  const { migrateConfig } = self.HMEFSchema;
  const isTop = window.top === window;

  // A per-load secret the page world (inject.js) requires on every config update.
  // We run at document_start, before any page script, so posting it now means the
  // page never observes it and can't forge a CFG message to disable protection.
  const nonce =
    (self.crypto && typeof self.crypto.randomUUID === 'function')
      ? self.crypto.randomUUID()
      : String(Math.random()).slice(2) + String(Date.now());

  // True if stored config isn't already in the canonical v1 shape on its known
  // keys — i.e. an old/corrupt config that should be upgraded in place.
  function needsUpgrade(raw, clean) {
    return (
      raw.schemaVersion !== clean.schemaVersion ||
      raw.enabled !== clean.enabled ||
      raw.deception !== clean.deception ||
      raw.allowlist === undefined ||
      String(raw.allowlist) !== String(clean.allowlist)
    );
  }

  function pushConfig() {
    chrome.storage.local.get(null, (raw) => {
      const cfg = migrateConfig(raw); // always hand inject a clean, frozen-shape config
      window.postMessage({ __tag: CFG, nonce, config: cfg }, '/');
      // Persist the migration once, from the top frame only. migrateConfig is
      // idempotent, so after the write the next read matches and this stops.
      if (isTop && needsUpgrade(raw, cfg)) chrome.storage.local.set(cfg);
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
