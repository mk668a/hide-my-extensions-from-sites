// Render Chrome Web Store assets (screenshots, promo tiles, icons) at exact
// store dimensions using a headless Chromium. Pure vector/HTML in, PNG out.
//
//   node store/tools/render.mjs
//
// Outputs land in store/assets/. Screenshots are 1280x800, promo tiles are the
// store's exact sizes, icons are rendered from store/tools/shield.svg.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'assets');
mkdirSync(OUT, { recursive: true });

const SHIELD = readFileSync(join(here, 'shield.svg'), 'utf8');

// ---- design tokens (mirrors the popup) -----------------------------------
const C = {
  bg0: '#0b1220', bg1: '#0f172a', panel: '#111827', line: '#1f2937',
  text: '#e5e7eb', muted: '#9ca3af', accent: '#34d399', accent2: '#6ee7b7',
  danger: '#ef4444',
};

// ---- the popup, as a static mock with sample data ------------------------
const POPUP_CSS = `
  .popup{width:320px;background:${C.bg0};color:${C.text};border-radius:14px;
    overflow:hidden;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.04)}
  .popup *{box-sizing:border-box}
  .popup header{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid ${C.line}}
  .popup header .shield{font-size:18px}
  .popup header .title{font-weight:600;font-size:13px}
  .popup header .count{margin-left:auto;font-variant-numeric:tabular-nums;color:${C.muted}}
  .popup header .count b{color:${C.accent};font-size:16px}
  .popup .toggles{padding:10px 14px;display:grid;gap:10px}
  .popup .row{display:flex;align-items:center;gap:10px;justify-content:space-between}
  .popup .row .label{display:flex;flex-direction:column}
  .popup .row .label small{color:${C.muted};font-size:11px}
  .popup .switch{position:relative;width:38px;height:22px;flex:none}
  .popup .slider{position:absolute;inset:0;background:${C.line};border-radius:999px}
  .popup .slider::before{content:"";position:absolute;height:16px;width:16px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.15s}
  .popup .switch.on .slider{background:${C.accent}}
  .popup .switch.on .slider::before{transform:translateX(16px)}
  .popup .allow{padding:4px 14px 12px;border-top:1px solid ${C.line}}
  .popup .allow .head{color:${C.muted};font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:8px 0 6px}
  .popup .allow .add{display:flex;gap:6px}
  .popup .allow input{flex:1;min-width:0;background:${C.panel};border:1px solid ${C.line};border-radius:6px;color:${C.text};padding:5px 8px;font:11px ui-monospace,Menlo,monospace}
  .popup .allow .add button{background:${C.accent};color:#06281d;border:none;border-radius:6px;padding:0 10px;font-weight:600}
  .popup .allow ul{list-style:none;margin:0;padding:8px 0 0}
  .popup .chip{display:flex;align-items:center;gap:6px;padding:4px 0}
  .popup .chip .id{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:${C.text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .popup .chip .x{margin-left:auto;color:${C.muted};font-size:14px}
  .popup .allow .none{color:#4b5563;font-size:11px;padding:4px 0}
  .popup .log-head{display:flex;align-items:center;padding:8px 14px 4px;border-top:1px solid ${C.line};color:${C.muted};font-size:11px;text-transform:uppercase;letter-spacing:.04em}
  .popup .log-head .clear{margin-left:auto;color:${C.muted};font-size:11px;text-transform:none}
  .popup ul.log{list-style:none;margin:0;padding:0 0 8px}
  .popup ul.log li{padding:5px 14px;border-top:1px solid #0f1726;display:flex;gap:8px;align-items:baseline}
  .popup .tag{flex:none;font-size:10px;padding:1px 6px;border-radius:999px;text-transform:uppercase;letter-spacing:.03em}
  .popup .tag.block{background:rgba(239,68,68,.15);color:#fca5a5}
  .popup .tag.fake{background:rgba(52,211,153,.15);color:#6ee7b7}
  .popup .url{color:${C.muted};font-family:ui-monospace,Menlo,monospace;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;

const logRow = (action: string, url: string) =>
  `<li><span class="tag ${action}">${action}</span><span class="url">${url}</span></li>`;

function popup({ count, deception, log, allow }: any) {
  const allowBody = allow && allow.length
    ? allow.map((id: string) => `<li class="chip"><span class="id">${id}</span><span class="x">×</span></li>`).join('')
    : `<li class="none">None — every extension probe is blocked.</li>`;
  return `<div class="popup">
    <header><span class="shield">🛡</span><span class="title">hide-my-extensions</span>
      <span class="count"><b>${count}</b> blocked</span></header>
    <div class="toggles">
      <div class="row"><span class="label">Protection<small>Block sites from scanning your extensions</small></span>
        <label class="switch on"><span class="slider"></span></label></div>
      <div class="row"><span class="label">Deception mode<small>Feed scanners fake "installed" results</small></span>
        <label class="switch ${deception ? 'on' : ''}"><span class="slider"></span></label></div>
    </div>
    <div class="allow"><div class="head">Always allow (trusted extension IDs)</div>
      <div class="add"><input value="" placeholder="extension id (32 letters)"><button>Add</button></div>
      <ul>${allowBody}</ul></div>
    <div class="log-head">This tab<span class="clear">clear</span></div>
    <ul class="log">${log.map(([a, u]: [string, string]) => logRow(a, u)).join('')}</ul>
  </div>`;
}

// ---- shared page frame ----------------------------------------------------
const FONT = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`;
function page(bodyCss: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{font-family:${FONT};-webkit-font-smoothing:antialiased}
    ${POPUP_CSS}
    ${bodyCss}
  </style></head><body>${body}</body></html>`;
}

const BG = `radial-gradient(1200px 700px at 78% -10%, #15233f 0%, ${C.bg1} 45%, ${C.bg0} 100%)`;

// screenshot scaffold: 1280x800 split — copy left, popup right
function shot({ kicker, title, sub, bullets, popupState, extra }: any) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const bulletHtml = (bullets || [])
    .map((b: string) => `<li><span class="dot"></span>${esc(b)}</li>`)
    .join('');
  return page(`
    .frame{width:1280px;height:800px;background:${BG};display:flex;align-items:center;padding:0 92px;gap:64px;position:relative;overflow:hidden}
    .frame::before{content:"";position:absolute;width:520px;height:520px;right:-120px;top:-120px;background:radial-gradient(circle, rgba(52,211,153,.16), transparent 62%);filter:blur(8px)}
    .left{flex:1;max-width:620px;z-index:1}
    .kicker{display:inline-flex;align-items:center;gap:8px;color:${C.accent2};font-size:15px;font-weight:600;letter-spacing:.02em;background:rgba(52,211,153,.10);border:1px solid rgba(52,211,153,.22);padding:6px 12px;border-radius:999px;margin-bottom:22px}
    .left h1{color:${C.text};font-size:50px;line-height:1.06;font-weight:800;letter-spacing:-.02em}
    .left h1 .hl{color:${C.accent}}
    .left p{color:${C.muted};font-size:20px;line-height:1.5;margin-top:18px;max-width:540px}
    .left ul{list-style:none;margin-top:26px;display:grid;gap:12px}
    .left li{display:flex;align-items:center;gap:12px;color:${C.text};font-size:17px}
    .left li .dot{width:8px;height:8px;border-radius:50%;background:${C.accent};flex:none;box-shadow:0 0 0 4px rgba(52,211,153,.15)}
    .right{flex:none;z-index:1;display:flex;flex-direction:column;align-items:center;gap:18px}
    .right .scale{transform:scale(1.55);transform-origin:center}
    .caption{color:${C.muted};font-size:13px;font-family:ui-monospace,Menlo,monospace}
    .extra{position:absolute;left:92px;bottom:40px;color:#5b6677;font-size:13px;z-index:1}
  `, `<div class="frame">
      <div class="left">
        <span class="kicker">🛡 ${kicker}</span>
        <h1>${title}</h1>
        ${sub ? `<p>${sub}</p>` : ''}
        ${bulletHtml ? `<ul>${bulletHtml}</ul>` : ''}
      </div>
      <div class="right"><div class="scale">${popup(popupState)}</div></div>
      ${extra ? `<div class="extra">${extra}</div>` : ''}
    </div>`);
}

// ---- the four screenshots -------------------------------------------------
const blockLog = [
  ['block', 'chrome-extension://aapbdb…/icon.png'],
  ['block', 'chrome-extension://nmmhkk…/probe.js'],
  ['block', 'chrome-extension://cjpalh…/img.png'],
  ['block', 'chrome-extension://gighmm…/in.js'],
  ['block', 'chrome-extension://fmkad…/devtools'],
];
const fakeLog = [
  ['fake', 'chrome-extension://aapbdb…/icon.png'],
  ['fake', 'chrome-extension://nmmhkk…/probe.js'],
  ['block', 'chrome-extension://cjpalh…/img.png'],
  ['fake', 'chrome-extension://gighmm…/in.js'],
  ['block', 'chrome-extension://fmkad…/devtools'],
];

const SCREENS = [
  {
    file: 'screenshot-1-hero.png',
    kicker: 'Privacy uBlock for extension fingerprinting',
    title: `Sites can read which extensions you have.<br><span class="hl">Now they can't.</span>`,
    sub: `Web pages silently probe <code>chrome-extension://</code> URLs to enumerate your installed extensions — a stable fingerprint that survives clearing cookies. This blocks the technique itself, on every site.`,
    popupState: { count: 12, deception: false, log: blockLog, allow: [] },
    extra: 'Live per-tab counter shows exactly when a site tries to scan you.',
  },
  {
    file: 'screenshot-2-deception.png',
    kicker: 'Active deception (optional)',
    title: `Don't just hide.<br><span class="hl">Feed scanners lies.</span>`,
    sub: `Passive defense returns "not installed" for every probe. Deception mode goes further: it hands the scanner a fake extension list, poisoning its results so the fingerprint it collects is worthless.`,
    popupState: { count: 37, deception: true, log: fakeLog, allow: [] },
    extra: 'Green "fake" tags = a scanner just swallowed a planted result.',
  },
  {
    file: 'screenshot-3-universal.png',
    kicker: 'Universal, not per-site',
    title: `Every probe channel.<br><span class="hl">One defense.</span>`,
    sub: `Runs in the page's MAIN world at document_start, before any page script. Neutralises every request channel a page can use to probe — each with its own regression test.`,
    bullets: [
      'fetch / XHR / sendBeacon / EventSource',
      '<img> / <script> / <link> / <iframe> / srcset',
      'SVG <use> and CSS url(extension://…)',
      'Tamper-proof nonce — a page can\'t turn it off',
    ],
    popupState: { count: 128, deception: false, log: blockLog, allow: [] },
  },
  {
    file: 'screenshot-4-local.png',
    kicker: 'Local-first by design',
    title: `No accounts. No servers.<br><span class="hl">No cloud.</span>`,
    sub: `Everything runs locally in your browser — deterministic, offline, free. Some extensions legitimately serve resources to the page; add their ID to the allow-list and their requests pass through untouched.`,
    bullets: [
      'Zero network calls, zero telemetry',
      'Allow-list trusted extensions by ID',
      'Open source (MIT) — auditable end to end',
    ],
    popupState: {
      count: 12, deception: false, log: blockLog.slice(0, 3),
      allow: ['cjpalhdlnbpafiamejdnhcphjbkeiagm', 'gighmmpiobklfepjocnamgkkbiglidom'],
    },
  },
];

// ---- promo tiles ----------------------------------------------------------
function promo(w: number, h: number, opts: any) {
  const big = w >= 1000;
  return page(`
    .tile{width:${w}px;height:${h}px;background:${BG};display:flex;align-items:center;gap:${big ? 56 : 26}px;padding:0 ${big ? 90 : 40}px;position:relative;overflow:hidden}
    .tile::before{content:"";position:absolute;width:${big ? 620 : 320}px;height:${big ? 620 : 320}px;right:-${big ? 140 : 110}px;top:-${big ? 160 : 120}px;background:radial-gradient(circle, rgba(52,211,153,.18), transparent 62%)}
    .badge{flex:none;width:${big ? 168 : 92}px;height:${big ? 168 : 92}px;border-radius:${big ? 40 : 22}px;box-shadow:0 24px 60px rgba(0,0,0,.5);z-index:1}
    .badge svg{width:100%;height:100%;display:block;border-radius:inherit}
    .copy{z-index:1}
    .copy .name{color:${C.muted};font-size:${big ? 22 : 14}px;font-weight:600;letter-spacing:.01em;margin-bottom:${big ? 14 : 8}px;font-family:ui-monospace,Menlo,monospace}
    .copy h1{color:${C.text};font-size:${big ? 58 : 27}px;line-height:1.08;font-weight:800;letter-spacing:-.02em}
    .copy h1 .hl{color:${C.accent}}
    .copy p{color:${C.muted};font-size:${big ? 24 : 0}px;margin-top:18px;${big ? '' : 'display:none'}}
  `, `<div class="tile">
      <div class="badge">${SHIELD}</div>
      <div class="copy">
        <div class="name">hide-my-extensions-from-sites</div>
        <h1>${opts.title}</h1>
        ${opts.sub ? `<p>${opts.sub}</p>` : ''}
      </div>
    </div>`);
}

// ---- icons ----------------------------------------------------------------
function iconPage(size: number) {
  return `<!doctype html><html><head><meta charset="utf8"><style>
    html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}
  </style></head><body>${SHIELD}</body></html>`;
}

// ---- run ------------------------------------------------------------------
const browser = await chromium.launch();

async function snap(
  html: string,
  w: number,
  h: number,
  file: string,
  { transparent = false }: { transparent?: boolean } = {}
) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.screenshot({
    path: join(OUT, file),
    clip: { x: 0, y: 0, width: w, height: h },
    omitBackground: transparent,
  });
  await ctx.close();
  console.log('wrote', file, `${w}x${h}`);
}

for (const s of SCREENS) await snap(shot(s), 1280, 800, s.file);

await snap(promo(440, 280, {
  title: `Make your extensions<br><span class="hl">invisible to every site.</span>`,
}), 440, 280, 'promo-small-440x280.png');

await snap(promo(1400, 560, {
  title: `Sites fingerprint you by your extensions.<br><span class="hl">Hide the whole list.</span>`,
  sub: `Universal, local, free. The "privacy uBlock" for extension enumeration.`,
}), 1400, 560, 'promo-marquee-1400x560.png');

for (const size of [16, 48, 128]) {
  await snap(iconPage(size), size, size, `icon${size}.png`, { transparent: true });
}
await snap(iconPage(128), 128, 128, 'store-icon-128.png', { transparent: true });

await browser.close();
console.log('done →', OUT);
