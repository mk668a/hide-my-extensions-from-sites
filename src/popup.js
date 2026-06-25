// popup.js — reads/writes the two toggles and renders the current tab's log.
'use strict';

const DEFAULTS = { enabled: true, deception: false, allowlist: [] };
const $ = (id) => document.getElementById(id);

function render(stats) {
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

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab && tab.id;
}

async function refresh() {
  const tabId = await activeTabId();
  if (typeof tabId !== 'number') return render(null);
  chrome.runtime.sendMessage({ type: 'getStats', tabId }, render);
}

function bindToggle(id) {
  $(id).addEventListener('change', (e) => {
    chrome.storage.local.set({ [id]: e.target.checked });
  });
}

function renderAllowlist(ids) {
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

async function getAllowlist() {
  const { allowlist } = await chrome.storage.local.get({ allowlist: [] });
  return Array.isArray(allowlist) ? allowlist : [];
}

async function addId() {
  const input = $('allow-input');
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

async function removeId(id) {
  const ids = await getAllowlist();
  const next = ids.filter((x) => x !== id);
  await chrome.storage.local.set({ allowlist: next });
  renderAllowlist(next);
}

async function init() {
  const cfg = await chrome.storage.local.get(DEFAULTS);
  $('enabled').checked = cfg.enabled;
  $('deception').checked = cfg.deception;
  bindToggle('enabled');
  bindToggle('deception');

  renderAllowlist(Array.isArray(cfg.allowlist) ? cfg.allowlist : []);
  $('allow-add').addEventListener('click', addId);
  $('allow-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addId();
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
