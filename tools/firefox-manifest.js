// Generate the Firefox MV3 manifest from the Chrome manifest, which is the single
// source of truth. The interception code is byte-identical across browsers (the
// SCHEME regex in inject.js already matches `moz-extension://`), so this transform
// is the *entire* browser-specific surface. Keeping it as one pure function means
// version/permission/content-script drift between the two builds is impossible.
//
// Three deltas, and only three:
//   1. Background: Chrome runs a service worker; Firefox MV3 has none — it uses a
//      non-persistent event page declared as `background.scripts`.
//   2. `browser_specific_settings.gecko.id` is required for a Firefox MV3 add-on
//      (and to ever submit to AMO).
//   3. `strict_min_version` 140: two features set the floor — `world: "MAIN"`
//      content scripts (the whole defense) exist from Firefox 128, and
//      `gecko.data_collection_permissions` (below) is honoured from Firefox 140.
//      We take the higher of the two; a lower floor would either silently skip
//      the MAIN-world patch or be rejected for the data-collection key.
// Plus `gecko.data_collection_permissions`, now required by Firefox for new
// add-ons: this extension transmits nothing, so it honestly declares "none".

export const GECKO_ID = 'hide-my-extensions-from-sites@humanhacker.ai';
export const MIN_FIREFOX = '140.0';

export function toFirefoxManifest(chrome) {
  const ff = JSON.parse(JSON.stringify(chrome)); // deep clone; never mutate input

  const worker = chrome.background && chrome.background.service_worker;
  ff.background = { scripts: worker ? [worker] : [] };

  ff.browser_specific_settings = {
    gecko: {
      id: GECKO_ID,
      strict_min_version: MIN_FIREFOX,
      data_collection_permissions: { required: ['none'] },
    },
  };

  return ff;
}

// CLI: `node tools/firefox-manifest.js <chrome-manifest> <out-file>`
// Writes the Firefox manifest to <out-file>. Used by tools/pack.sh.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const [, , src = 'manifest.json', out] = process.argv;
  if (!out) {
    console.error('usage: node tools/firefox-manifest.js <chrome-manifest> <out-file>');
    process.exit(2);
  }
  const chrome = JSON.parse(readFileSync(src, 'utf8'));
  writeFileSync(out, JSON.stringify(toFirefoxManifest(chrome), null, 2) + '\n');
  console.error(`wrote ${out}`);
}
