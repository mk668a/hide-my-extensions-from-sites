# hide-my-extensions-from-sites 🛡

**English ・ [日本語](docs/i18n/README.ja.md) ・ [简体中文](docs/i18n/README.zh-CN.md) ・ [한국어](docs/i18n/README.ko.md) ・ [Español](docs/i18n/README.es.md) ・ [Français](docs/i18n/README.fr.md)**

<p align="center">
  <img src="store/assets/promo-marquee-1400x560.png" alt="Sites fingerprint you by your extensions. Hide the whole list. Universal, local, free — the privacy uBlock for extension enumeration." width="820">
</p>

**Hide my extensions from every site that scans.**

Websites can silently read *which browser extensions you have installed*. They fetch `chrome-extension://{id}/{resource}` URLs one by one and **enumerate** your installed extensions from which ones respond — the trick exposed by LinkedIn's "BrowserGate." It's a strong fingerprinting signal, usable for tracking, targeting, and censorship.

`hide-my-extensions-from-sites` kills this enumeration **across every site**, not as a per-site patch but by blocking the technique itself — a "privacy uBlock."

> In one line: **make your extension list invisible to every site.**

---

## 😩 Why build it

- **Extensions are a fingerprint.** The set of installed extensions is a stable identifier that survives clearing cookies.
- **Existing defenses are too local.** Tools like browsergate-shield only match LinkedIn's specific IDs. There's no **universal** defense in Chrome against other sites using the same technique.

---

## 🧱 How it works

1. **Interpose `chrome-extension://` probes in the MAIN world** — intercept extension-ID probing via `fetch` / `XHR` / DOM (`img`/`link` tags) / Workers / cache from a content_script.
2. **Hide existence (passive defense)** — return a uniform "not present" response so installed extensions can't be read.
3. **Poison the enumeration (active deception, optional mode)** — instead of just "not present," return a **fake extension list** to corrupt the scanner's results. If passive defense means "don't leak," this means "make them swallow lies."
4. **See it work** — when a site is caught scanning, the icon shows a badge (e.g. `🛡 12 scans blocked`) with a real-time log.

| Passive defense — hide the list | Deception mode — poison the scan |
|:---:|:---:|
| ![Popup showing extension probes blocked on the current tab](store/assets/screenshot-1-hero.png) | ![Popup feeding the scanner fake "installed" results](store/assets/screenshot-2-deception.png) |

---

## 🥊 Comparison

| | Scope | Active deception |
|---|---|---|
| browsergate-shield | LinkedIn-only | no |
| TrackPrivacy | universal | no |
| **hide-my-extensions-from-sites** | **universal (all sites)** | **yes (optional mode)** |

---

## 🔒 Scope

- **No accounts, no servers, no cloud.** Everything runs locally in your browser — deterministic, offline, free.
- **Allow-list for trusted extensions.** Some extensions legitimately serve resources to the page; add their id in the popup and their requests pass through untouched.
- Target: **Chrome / Chromium** (111+) and **Firefox** (140+), Manifest V3.

---

## 🎯 Threat model & coverage

The attacker is a **web page** trying to learn which extensions you have installed
by requesting `chrome-extension://{id}/{resource}` (or `moz-extension://…`) URLs
and watching which ones resolve. We run in the page's MAIN world at
`document_start`, before any page script, and neutralise every request channel a
page can use to issue or observe such a probe.

**Blocked probe vectors** (each has a regression test):

| Channel | How it's neutralised |
|---|---|
| `fetch()` | extension-URL probes rejected (or faked in deception mode) |
| `XMLHttpRequest` | `open()` to an extension URL is redirected to a dead URL |
| `<img>` / `<script>` / `<link>` `src`/`href` | property setter + `setAttribute` rewritten |
| `<iframe>` / `<object>` / `<embed>` | `src` / `data` setters + `setAttribute` rewritten |
| `srcset` (`<img>` / `<source>`) | setter + `setAttribute` rewritten |
| SVG `<use>` `xlink:href` | `setAttributeNS` (namespaced) rewritten |
| CSS `url(extension://…)` | `setProperty` / `cssText` / `setAttribute("style")` scrubbed |
| `navigator.sendBeacon` | extension-URL beacons dropped |
| `EventSource` | extension-URL streams redirected to a dead URL |

**Trust boundary.** The ISOLATED-world bridge hands the MAIN world a per-load
nonce before any page script runs; every config update must carry it, over a
same-origin (`'/'`) channel. A hostile page therefore **cannot spoof a message to
turn protection off**, and cannot sniff the nonce.

**Known gaps (documented, by design):**

- **`el.style.backgroundImage = …`** (direct camelCase property) is a *native named
  setter* in Chrome — it isn't on `CSSStyleDeclaration.prototype`, so it can't be
  patched. CSS also gives no load/error signal, making it a poor enumeration oracle;
  the string-based CSS paths above *are* covered.
- **Timing oracles** (`onload`/`onerror` latency differences) are not normalised —
  this needs a design, not a single patch, and is out of scope for 1.0.
- One Firefox-for-**Android** `web-ext` lint warning (data-collection key floor);
  this is a desktop-targeted build.

**Config schema (frozen at v1).** Stored config is exactly
`{ schemaVersion, enabled, deception, allowlist }`. On load it is migrated to this
shape: `enabled` is fail-safe (anything non-boolean means **protection on**),
`deception` is strict opt-in, and `allowlist` is validated to lowercase 32-char
ids. Old or corrupt configs are upgraded in place, idempotently.

---

## 📦 Install (load it locally)

No store listing yet — run it unpacked. `npm run build` produces two zips in `dist/`:
`…-chrome-<version>.zip` and `…-firefox-<version>.zip`. They share identical code;
only the manifest differs (Firefox uses an event-page background and declares no
data collection).

**Chrome / Chromium (111+):**

1. Get the Chrome folder: unzip `…-chrome-<version>.zip`, or clone the repo and
   run `npm install && npm run build:src` (the extension is written in TypeScript;
   this compiles `src/*.ts` → the `src/*.js` the manifest loads).
2. Open `chrome://extensions` → turn on **Developer mode** (top-right).
3. Click **Load unpacked** and pick the folder that contains `manifest.json`.

**Firefox (140+):**

1. Unzip `…-firefox-<version>.zip`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick the `manifest.json` inside it.

Either way, the 🛡 icon shows up in the toolbar — click it to toggle protection and
watch the per-tab scan count.

> A `.zip` can't be installed directly — unzip it first. Firefox needs 140+ and
> Chrome/Chromium needs 111+ (both for MAIN-world content scripts).

## 🧪 Develop & test

```sh
npm install
npm run typecheck   # type-check the whole repo (src + tools + tests)
npm run build:src   # compile src/*.ts → src/*.js (the browser-loaded output)
npm test            # unit + integration (vitest + jsdom; compiles src first)
npm run test:e2e    # system test (Playwright; run `npx playwright install chromium` once)
npm run build       # compile, then produce the loadable zips in dist/
```

The whole codebase is TypeScript. The extension keeps a no-bundler, classic-script
architecture: `src/*.ts` compiles 1:1 to `src/*.js` (gitignored) via `tsc`, and the
manifest loads those files directly. Tooling and tests run as TypeScript through
`tsx`/vitest with no build step.

Tests are layered: unit + integration (`tests/`) run under vitest, and an E2E test loads the real unpacked extension in Chromium. The Firefox build's manifest is generated from the Chrome one by `tools/firefox-manifest.ts` (one source of truth) and validated by `web-ext lint`.

## 🚧 Status

**v1.0 — stable.** The config schema is frozen (with in-place migration) and the
blocked vectors are documented above, each with a regression test (unit +
integration + Chromium E2E). Distributed as a local "Load unpacked / Load
Temporary Add-on" zip; not yet listed on the Chrome Web Store or Firefox Add-ons.

## 📄 License

MIT
