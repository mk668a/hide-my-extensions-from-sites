// Unit test for the Chrome→Firefox manifest transform. Firefox MV3 differs from
// Chrome MV3 in three ways that matter here, and nothing else: it has no
// background service worker (it uses an event-page `scripts` array), it requires
// a `browser_specific_settings.gecko.id`, and `world: "MAIN"` content scripts
// only exist from Firefox 128. The interception code itself is byte-identical
// across browsers (the SCHEME regex already matches `moz-extension`), so the
// transform is the entire browser-specific surface — we pin it precisely.
import { describe, it, expect } from 'vitest';
import { toFirefoxManifest } from '../../tools/firefox-manifest.js';

const CHROME = {
  manifest_version: 3,
  name: 'hide-my-extensions-from-sites',
  version: '0.3.0',
  permissions: ['storage'],
  background: { service_worker: 'src/background.js' },
  content_scripts: [
    { matches: ['<all_urls>'], js: ['src/inject.js'], run_at: 'document_start', all_frames: true, world: 'MAIN' },
    { matches: ['<all_urls>'], js: ['src/content.js'], run_at: 'document_start', all_frames: true },
  ],
};

describe('toFirefoxManifest', () => {
  it('replaces the service worker with an event-page scripts array', () => {
    const ff = toFirefoxManifest(CHROME);
    expect(ff.background).toEqual({ scripts: ['src/background.js'] });
    expect(ff.background.service_worker).toBeUndefined();
  });

  it('adds a gecko id and a strict_min_version that covers MAIN-world content scripts', () => {
    const ff = toFirefoxManifest(CHROME);
    expect(ff.browser_specific_settings.gecko.id).toMatch(/^[^@\s]+@[^@\s]+$/);
    // `world: "MAIN"` landed in Firefox 128; anything lower would silently fail.
    expect(Number(ff.browser_specific_settings.gecko.strict_min_version.split('.')[0])).toBeGreaterThanOrEqual(128);
  });

  it('declares no data collection (a privacy tool that transmits nothing)', () => {
    // Firefox now requires gecko.data_collection_permissions for new add-ons;
    // "none" is the honest declaration — this extension only touches local
    // storage and never sends a probe URL or anything else off-device.
    const ff = toFirefoxManifest(CHROME);
    expect(ff.browser_specific_settings.gecko.data_collection_permissions.required).toEqual(['none']);
  });

  it('preserves everything browser-agnostic verbatim (version, name, perms, content_scripts incl. MAIN world)', () => {
    const ff = toFirefoxManifest(CHROME);
    expect(ff.manifest_version).toBe(3);
    expect(ff.name).toBe(CHROME.name);
    expect(ff.version).toBe(CHROME.version);
    expect(ff.permissions).toEqual(CHROME.permissions);
    expect(ff.content_scripts).toEqual(CHROME.content_scripts);
    // The MAIN-world inject script — the whole defense — must survive the transform.
    expect(ff.content_scripts.find((c) => c.world === 'MAIN').js).toEqual(['src/inject.js']);
  });

  it('does not mutate its input', () => {
    const before = JSON.parse(JSON.stringify(CHROME));
    toFirefoxManifest(CHROME);
    expect(CHROME).toEqual(before);
  });
});
