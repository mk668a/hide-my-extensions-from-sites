// schema.ts — the frozen v1 configuration schema and its migration.
//
// This is a classic content-script, listed BEFORE content.js in the same
// content_scripts entry, so it runs in the same ISOLATED-world global and
// publishes `self.HMEFSchema` for content.js to use. (It has no chrome.* needs;
// it is pure logic.)
//
// v1.0 is a stability commitment: the stored config is exactly these four keys
// and nothing else. `migrateConfig` takes whatever is actually in storage — an
// old build's partial config, a corrupt value, a future key we don't know — and
// returns the canonical current shape. It is pure and idempotent, so callers can
// run it on every read and persist the result without ever looping.
'use strict';

self.HMEFSchema = (() => {
  const CONFIG_SCHEMA_VERSION = 1;
  const EXT_ID = /^[a-p]{32}$/; // a Chrome extension id: 32 chars of a–p

  function cleanAllowlist(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const entry of value) {
      if (typeof entry !== 'string') continue;
      const id = entry.trim().toLowerCase();
      if (EXT_ID.test(id) && !out.includes(id)) out.push(id);
    }
    return out;
  }

  function migrateConfig(raw: unknown): HmefConfig {
    const r: Record<string, unknown> =
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      // Fail safe: protection is ON unless it was *explicitly* turned off. A
      // corrupt or missing value must never silently disable the defense.
      enabled: r.enabled === false ? false : true,
      // Deception is a deliberate opt-in; only a literal `true` enables it.
      deception: r.deception === true,
      allowlist: cleanAllowlist(r.allowlist),
    };
  }

  return { CONFIG_SCHEMA_VERSION, migrateConfig };
})();
