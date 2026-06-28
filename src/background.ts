// background.ts — service worker. Tracks per-tab interception counts, keeps a
// short recent log for the popup, and paints the toolbar badge.
//
// State is in-memory: if the worker is evicted the counts reset, which is fine —
// the next intercepted probe repaints the badge.
'use strict';

// HmefHit / HmefStats are the cross-file wire shapes, declared in globals.d.ts
// (shared with popup.ts). No import — these are classic scripts.

const LOG_CAP = 50;
const state = new Map<number, HmefStats>(); // tabId -> { count, log }

function entryFor(tabId: number): HmefStats {
  let e = state.get(tabId);
  if (!e) {
    e = { count: 0, log: [] };
    state.set(tabId, e);
  }
  return e;
}

function paintBadge(tabId: number, count: number): void {
  const text = count > 0 ? (count > 999 ? '999+' : String(count)) : '';
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#ef4444' });
}

chrome.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;

  if (msg && msg.type === 'getStats') {
    // From the popup (no sender.tab); it passes the active tabId explicitly.
    const e = state.get(msg.tabId) || { count: 0, log: [] };
    sendResponse({ count: e.count, log: e.log });
    return true;
  }

  if (msg && msg.type === 'clear' && typeof msg.tabId === 'number') {
    // From the popup, which has no sender.tab — it passes the tabId explicitly.
    state.set(msg.tabId, { count: 0, log: [] });
    paintBadge(msg.tabId, 0);
    return;
  }

  if (typeof tabId !== 'number') return;

  if (msg.type === 'pageload') {
    state.set(tabId, { count: 0, log: [] });
    paintBadge(tabId, 0);
    return;
  }

  if (msg.type === 'hit') {
    const e = entryFor(tabId);
    e.count += 1;
    e.log.unshift({ url: msg.url, vector: msg.vector, action: msg.action });
    if (e.log.length > LOG_CAP) e.log.length = LOG_CAP;
    paintBadge(tabId, e.count);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => state.delete(tabId));
