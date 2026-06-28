# Chrome Web Store — submission packet

Copy-paste source for the **hide-my-extensions-from-sites** listing on the
[Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
Every field the dashboard asks for is filled in below; the images it needs live in
[`assets/`](assets/).

---

## 1. Store listing

### Item name (≤ 45 chars)
```
Hide My Extensions From Sites
```
> The repo/package id is `hide-my-extensions-from-sites`; the store display name
> is Title Case and 29 characters.

### Summary (≤ 132 chars)
```
Stop websites from detecting which browser extensions you have installed. Universal anti-fingerprinting, 100% local.
```
(114 chars.)

### Category
```
Privacy & Security
```

### Language
```
English (United States)
```

### Description (detailed — supports plain text, ≤ 16,000 chars)

```
Websites can silently read WHICH browser extensions you have installed — and use that as a fingerprint to track you.

The trick (the same one exposed in LinkedIn's "BrowserGate"): a page requests chrome-extension://{id}/{resource} URLs one by one and watches which ones load. The set of extensions you have installed is a stable identifier that survives clearing cookies — usable for tracking, ad targeting, and even censorship.

Hide My Extensions From Sites kills this enumeration across EVERY site. It doesn't patch one attacker — it blocks the technique itself. Think of it as a "privacy uBlock" for extension fingerprinting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW IT WORKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Runs in the page's MAIN world at document_start — before any page script can probe you.
• Intercepts every channel a page can use to test an extension URL: fetch, XMLHttpRequest, <img> / <script> / <link> / <iframe> / <object> / <embed>, srcset, SVG <use>, CSS url(), sendBeacon, and EventSource.
• Returns a uniform "not present" response, so a scanner learns nothing about what you have installed.
• Optional DECEPTION MODE goes further: it feeds the scanner a fake extension list, poisoning its results so the fingerprint it collects is worthless.
• A per-tab counter and live log show you exactly when a site tries to scan you.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIVATE BY DESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• No accounts. No servers. No cloud. Everything runs locally in your browser.
• Zero network requests, zero telemetry, zero data collection.
• Deterministic, offline, and free.
• Open source under the MIT license — every line is auditable.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALLOW-LIST FOR TRUSTED EXTENSIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Some extensions legitimately serve resources to the pages you visit (password managers, accessibility tools, and so on). Add their extension ID to the allow-list in the popup and their requests pass through untouched — protection stays on for everything else.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHY IT'S DIFFERENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Most defenses are per-site — they only match one attacker's hard-coded extension IDs. This is universal: it neutralises the probing technique on every site you visit, and is the only option that can actively deceive a scanner rather than just stay quiet.

Open source: https://github.com/mk668a/hide-my-extensions-from-sites
```

> Plain-text only — the dashboard strips HTML/Markdown. Lists above use bullet
> glyphs and box-drawing characters that render fine.

---

## 2. Privacy tab (required before publishing)

### Single purpose (required)
```
This extension has a single purpose: to prevent websites from enumerating (detecting) which browser extensions the user has installed, by intercepting chrome-extension:// resource probes in the page and returning a uniform "not installed" or decoy response.
```

### Permission justifications

**`storage`**
```
Used to persist the user's own settings locally: protection on/off, deception mode on/off, and the allow-list of trusted extension IDs. Stored with chrome.storage.local on the user's device only. Nothing is ever transmitted off the device.
```

**Host permissions / `<all_urls>` (content scripts run on all sites)**
```
Extension enumeration can be attempted by ANY website, so the protective content script must run on every page to be effective. It only intercepts requests to chrome-extension:// (and moz-extension://) URLs used for probing; it does not read, collect, or modify ordinary page content, and it makes no network requests of its own.
```

> Note: the manifest declares `content_scripts` matching `<all_urls>` but lists
> **no `host_permissions` and no broad API permissions** beyond `storage`.
> Be ready to explain the `<all_urls>` content-script match — that is what the
> reviewer will focus on.

### Data usage disclosures (checkboxes on the Privacy tab)

Declare the following — **all unchecked / "does not collect"**:

| Question | Answer |
|---|---|
| Does this item collect or use personally identifiable information? | **No** |
| …health information? | **No** |
| …financial / payment information? | **No** |
| …authentication information? | **No** |
| …personal communications? | **No** |
| …location? | **No** |
| …web history? | **No** |
| …user activity (clicks, mouse, keystrokes)? | **No** |
| …website content? | **No** |

Then check the three required certifications:
- ☑ I do not sell or transfer user data to third parties, outside of approved use cases
- ☑ I do not use or transfer user data for purposes unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL
A privacy policy URL is required for any listing that requests permissions. Use the
hosted copy of [`privacy-policy.md`](privacy-policy.md) (e.g. publish it to the repo's
GitHub Pages or link the raw file):
```
https://github.com/mk668a/hide-my-extensions-from-sites/blob/main/store/privacy-policy.md
```

---

## 3. Graphic assets (all generated in `assets/`)

| Asset | Required size | File | Status |
|---|---|---|---|
| Store icon | 128×128 PNG | `assets/store-icon-128.png` | ✅ |
| Screenshot 1 (hero) | 1280×800 PNG | `assets/screenshot-1-hero.png` | ✅ |
| Screenshot 2 (deception) | 1280×800 PNG | `assets/screenshot-2-deception.png` | ✅ |
| Screenshot 3 (universal) | 1280×800 PNG | `assets/screenshot-3-universal.png` | ✅ |
| Screenshot 4 (local-first) | 1280×800 PNG | `assets/screenshot-4-local.png` | ✅ |
| Small promo tile | 440×280 PNG | `assets/promo-small-440x280.png` | ✅ (optional) |
| Marquee promo tile | 1400×560 PNG | `assets/promo-marquee-1400x560.png` | ✅ (optional) |

Rules honored: at least one 1280×800 screenshot (we ship four, the max useful before
diminishing returns; the store allows up to 5), 24-bit PNG with no alpha on the
screenshots/promos, exact pixel dimensions, no rounded corners / drop shadows baked
into the promo tiles' outer edge. Regenerate anytime with:
```sh
npx tsx store/tools/render.ts
```

The toolbar icons in `icons/` (16/48/128) are the same shield artwork, re-rendered
from `store/tools/shield.svg` for crisp edges and transparent corners.

---

## 4. Package to upload

Upload the Chrome zip built by the project:
```sh
npm run build      # → dist/hide-my-extensions-from-sites-chrome-<version>.zip
```
Upload `dist/…-chrome-<version>.zip` (NOT the Firefox zip — that goes to
addons.mozilla.org separately).

---

## 5. Pre-submit checklist

- [ ] `npm test && npm run test:e2e` green
- [ ] `npm run build` produced a fresh `…-chrome-<version>.zip` (with the updated icons)
- [ ] manifest `version` bumped if this is a re-submission
- [ ] Store icon + 4 screenshots uploaded
- [ ] Summary ≤ 132 chars, description pasted
- [ ] Category = Privacy & Security, language set
- [ ] Single-purpose + permission justifications pasted
- [ ] Data-usage disclosures all "No", 3 certifications checked
- [ ] Privacy policy URL reachable (publish `privacy-policy.md` first)
- [ ] Submit for review (first review is typically a few days)
