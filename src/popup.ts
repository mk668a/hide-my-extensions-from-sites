// popup.ts — reads/writes the two toggles and renders the current tab's log.
'use strict';

// HmefStats / HmefHit are the shared wire shapes declared in globals.d.ts
// (the same objects background.ts produces). No import — classic scripts.

const DEFAULTS = { enabled: true, deception: false, allowlist: [] as string[] };
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

function render(stats: HmefStats | null): void {
  const count = stats ? stats.count : 0;
  const log = (stats && stats.log) || [];
  $('count').textContent = count > 999 ? '999+' : String(count);

  const ul = $('log');
  ul.innerHTML = '';
  $('empty').style.display = log.length ? 'none' : 'block';

  for (const hit of log) {
    const li = document.createElement('li');
    const tag = document.createElement('span');
    tag.className = 'tag ' + (hit.action === 'fake' ? 'fake' : 'block');
    tag.textContent = hit.action === 'fake' ? 'fake' : 'block';
    const url = document.createElement('span');
    url.className = 'url';
    url.textContent = hit.url || '';
    url.title = hit.url || '';
    li.append(tag, url);
    ul.appendChild(li);
  }
}

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab && tab.id;
}

async function refresh(): Promise<void> {
  const tabId = await activeTabId();
  if (typeof tabId !== 'number') return render(null);
  chrome.runtime.sendMessage({ type: 'getStats', tabId }, render);
}

function bindToggle(id: string): void {
  $(id).addEventListener('change', (e) => {
    chrome.storage.local.set({ [id]: (e.target as HTMLInputElement).checked });
  });
}

function renderAllowlist(ids: string[]): void {
  const ul = $('allow-list');
  ul.innerHTML = '';
  if (!ids.length) {
    const li = document.createElement('li');
    li.className = 'none';
    li.textContent = 'None — every extension probe is blocked.';
    ul.appendChild(li);
    return;
  }
  for (const id of ids) {
    const li = document.createElement('li');
    li.className = 'chip';
    const span = document.createElement('span');
    span.className = 'id';
    span.textContent = id;
    span.title = id;
    const rm = document.createElement('button');
    rm.textContent = '×';
    rm.title = 'remove';
    rm.addEventListener('click', () => removeId(id));
    li.append(span, rm);
    ul.appendChild(li);
  }
}

async function getAllowlist(): Promise<string[]> {
  const { allowlist } = await chrome.storage.local.get({ allowlist: [] });
  return Array.isArray(allowlist) ? allowlist : [];
}

async function addId(): Promise<void> {
  const input = $('allow-input') as HTMLInputElement;
  const id = input.value.trim().toLowerCase();
  // Chrome extension ids are 32 chars of a–p; be lenient but reject junk.
  if (!/^[a-p]{32}$/.test(id)) {
    input.focus();
    return;
  }
  const ids = await getAllowlist();
  if (!ids.includes(id)) {
    const next = [...ids, id];
    await chrome.storage.local.set({ allowlist: next });
    renderAllowlist(next);
  }
  input.value = '';
}

async function removeId(id: string): Promise<void> {
  const ids = await getAllowlist();
  const next = ids.filter((x) => x !== id);
  await chrome.storage.local.set({ allowlist: next });
  renderAllowlist(next);
}

async function init(): Promise<void> {
  const cfg = await chrome.storage.local.get(DEFAULTS);
  ($('enabled') as HTMLInputElement).checked = !!cfg.enabled;
  ($('deception') as HTMLInputElement).checked = !!cfg.deception;
  bindToggle('enabled');
  bindToggle('deception');

  renderAllowlist(Array.isArray(cfg.allowlist) ? cfg.allowlist : []);
  $('allow-add').addEventListener('click', addId);
  $('allow-input').addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') addId();
  });

  $('clear').addEventListener('click', async () => {
    const tabId = await activeTabId();
    if (typeof tabId === 'number') {
      chrome.runtime.sendMessage({ type: 'clear', tabId });
    }
    render(null);
  });

  refresh();
}

document.addEventListener('DOMContentLoaded', init);
