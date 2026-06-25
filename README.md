# hide-my-extensions-from-sites 🛡

**English ・ [日本語](README.ja.md)**

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

## 📦 Install (load it locally)

No store listing yet — run it unpacked. `npm run build` produces two zips in `dist/`:
`…-chrome-<version>.zip` and `…-firefox-<version>.zip`. They share identical code;
only the manifest differs (Firefox uses an event-page background and declares no
data collection).

**Chrome / Chromium (111+):**

1. Get the Chrome folder (clone the repo, or unzip `…-chrome-<version>.zip`).
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
npm test            # unit + integration (vitest + jsdom)
npm run test:e2e    # system test (Playwright; run `npx playwright install chromium` once)
npm run build       # produce the loadable zip in dist/
```

Tests are layered: unit + integration (`tests/`) run under vitest, and an E2E test loads the real unpacked extension in Chromium. The Firefox build's manifest is generated from the Chrome one by `tools/firefox-manifest.js` (one source of truth) and validated by `web-ext lint`.

## 🚧 Status

**Early build** — the extension works end to end (load it unpacked) and is covered
by unit, integration, and E2E tests. Not yet published to the Chrome Web Store or
Firefox Add-ons.

## 📄 License

MIT
