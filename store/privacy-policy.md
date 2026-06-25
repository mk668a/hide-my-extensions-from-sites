# Privacy Policy — Hide My Extensions From Sites

_Last updated: 2026-06-25_

**Short version: this extension collects nothing, sends nothing, and talks to no
server. Everything stays on your device.**

## What data we collect

None. The extension does not collect, store, or transmit any personally
identifiable information, browsing history, website content, or analytics.

## What is stored locally

The only data the extension stores is **your own settings**, kept on your device
via the browser's `storage.local` API:

- whether protection is on or off,
- whether deception mode is on or off,
- the allow-list of extension IDs you choose to trust.

This data never leaves your browser. It is not synced to us, sold, or shared with
anyone. Removing the extension removes it.

## Network activity

The extension makes **no network requests**. It has no backend, no telemetry, and
no third-party services. It runs entirely offline.

## Permissions

- **`storage`** — to save the settings listed above on your device.
- **Content scripts on all sites** — required because any website can attempt to
  fingerprint your extensions, so the protection must be able to run on every page.
  The content script only intercepts `chrome-extension://` / `moz-extension://`
  resource probes; it does not read or modify ordinary page content.

## Changes

If this policy ever changes, the updated version will be published in the project
repository.

## Contact

Open an issue at
<https://github.com/mk668a/hide-my-extensions-from-sites/issues>.
