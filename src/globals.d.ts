// Ambient types for the cross-file globals the extension wires by hand. The
// content scripts are classic (non-module) scripts: schema.ts runs first in the
// ISOLATED world and publishes `self.HMEFSchema`, which content.ts then reads.
// There is no import between them — manifest load-order is the contract — so the
// shared shape is declared here instead.

/** The frozen v1 config shape `migrateConfig` always returns. */
interface HmefConfig {
  schemaVersion: number;
  enabled: boolean;
  deception: boolean;
  allowlist: string[];
}

/** The object schema.ts publishes on `self.HMEFSchema`. */
interface HmefSchema {
  CONFIG_SCHEMA_VERSION: number;
  migrateConfig(raw: unknown): HmefConfig;
}

/** One intercepted probe — logged by the worker (background.ts), shown by popup.ts. */
interface HmefHit {
  url: string;
  vector: string;
  action: string;
}

/** Per-tab stats the worker hands the popup over `getStats`. */
interface HmefStats {
  count: number;
  log: HmefHit[];
}

// Make `self.HMEFSchema`, `window.HMEFSchema`, `globalThis.HMEFSchema` and the
// bare `HMEFSchema` identifier all resolve to the published object.
interface Window {
  HMEFSchema: HmefSchema;
}
declare var HMEFSchema: HmefSchema;
