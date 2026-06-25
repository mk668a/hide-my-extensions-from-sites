// Unit tests for src/schema.js — the frozen v1 config schema + migration. This is
// the real shipped file (a classic content-script that publishes self.HMEFSchema),
// loaded through the harness exactly as the browser loads it before content.js.
import { describe, it, expect, beforeAll } from 'vitest';
import { readSrc, runScript } from '../helpers/harness.js';

const ID_A = 'a'.repeat(32); // valid Chrome extension id: 32 chars of a–p
const ID_B = 'p'.repeat(32);

let migrateConfig;
let VERSION;

beforeAll(() => {
  runScript(readSrc('schema.js'));
  migrateConfig = globalThis.HMEFSchema.migrateConfig;
  VERSION = globalThis.HMEFSchema.CONFIG_SCHEMA_VERSION;
});

describe('migrateConfig', () => {
  it('turns an empty/absent stored config into the full frozen default', () => {
    expect(migrateConfig({})).toEqual({
      schemaVersion: VERSION,
      enabled: true,
      deception: false,
      allowlist: [],
    });
    expect(migrateConfig(undefined)).toEqual(migrateConfig({}));
  });

  it('preserves a valid stored config and stamps the schema version', () => {
    expect(migrateConfig({ enabled: false, deception: true, allowlist: [ID_A] })).toEqual({
      schemaVersion: VERSION,
      enabled: false,
      deception: true,
      allowlist: [ID_A],
    });
  });

  it('is fail-safe on a corrupt `enabled`: anything non-boolean means protection ON', () => {
    expect(migrateConfig({ enabled: 'false' }).enabled).toBe(true);
    expect(migrateConfig({ enabled: 0 }).enabled).toBe(true);
    expect(migrateConfig({ enabled: false }).enabled).toBe(false); // the one explicit off
  });

  it('treats deception as strict opt-in: only literal true enables it', () => {
    expect(migrateConfig({ deception: true }).deception).toBe(true);
    expect(migrateConfig({ deception: 1 }).deception).toBe(false);
    expect(migrateConfig({ deception: 'yes' }).deception).toBe(false);
  });

  it('validates the allowlist: lowercases, drops junk, dedupes, rejects non-arrays', () => {
    const out = migrateConfig({
      allowlist: [ID_A.toUpperCase(), ID_A, 'too-short', 123, '', ID_B, ID_B],
    });
    expect(out.allowlist).toEqual([ID_A, ID_B]);
    expect(migrateConfig({ allowlist: 'notanarray' }).allowlist).toEqual([]);
  });

  it('drops unknown keys (the schema is frozen to a known shape)', () => {
    const out = migrateConfig({ enabled: true, mystery: 5, future: { x: 1 } });
    expect(Object.keys(out).sort()).toEqual(['allowlist', 'deception', 'enabled', 'schemaVersion']);
  });

  it('is idempotent: migrating an already-migrated config is a no-op', () => {
    const once = migrateConfig({ enabled: false, deception: true, allowlist: [ID_A, 'junk'] });
    expect(migrateConfig(once)).toEqual(once);
  });

  it('does not mutate its input', () => {
    const raw = { enabled: false, allowlist: [ID_A] };
    const snapshot = JSON.parse(JSON.stringify(raw));
    migrateConfig(raw);
    expect(raw).toEqual(snapshot);
  });
});
