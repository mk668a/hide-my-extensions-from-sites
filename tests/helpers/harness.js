// Test harness: loads a content-script source file (which is a plain script, not
// an ES module) into the current jsdom global, with a synchronous postMessage
// shim and a controllable chrome.* mock. Lets us exercise the *real shipped
// files* rather than a refactored copy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../src');

export function readSrc(name) {
  return fs.readFileSync(path.join(SRC, name), 'utf8');
}

// Run a script string in global scope (indirect eval), so `window`, `Element`,
// `XMLHttpRequest`, etc. resolve to the jsdom globals.
export function runScript(code) {
  (0, eval)(code);
}

export function runSrc(name) {
  runScript(readSrc(name));
}

// Deliver postMessage synchronously with source === window, which jsdom does not
// guarantee on its own. Both worlds (inject/content) rely on e.source === window.
export function installSyncPostMessage() {
  window.postMessage = (data) => {
    const ev = new window.MessageEvent('message', { data });
    if (ev.source !== window) {
      try {
        Object.defineProperty(ev, 'source', { value: window, configurable: true });
      } catch (_) {}
    }
    window.dispatchEvent(ev);
  };
}

// A chrome.* mock. storage is in-memory; runtime.sendMessage records every call
// and (optionally) routes to registered onMessage listeners so content↔background
// can be wired in integration tests.
export function makeChrome(opts = {}) {
  const store = { enabled: true, deception: false, ...(opts.store || {}) };
  const storageListeners = [];
  const messageListeners = [];
  const removeListeners = [];
  const calls = {
    sendMessage: [],
    setBadgeText: [],
    setBadgeColor: [],
    storageSet: [],
  };

  const chrome = {
    __store: store,
    __calls: calls,
    __sender: opts.sender || { tab: { id: 1 } },
    __emitRemoved: (tabId) => removeListeners.forEach((fn) => fn(tabId)),

    storage: {
      local: {
        get(defaults, cb) {
          // chrome.storage.local.get(null) returns the whole store; get(obj)
          // returns those keys with defaults filled in for missing ones.
          let result;
          if (defaults == null) {
            result = { ...store };
          } else {
            result = typeof defaults === 'object' ? { ...defaults } : {};
            for (const k of Object.keys(result)) if (k in store) result[k] = store[k];
          }
          if (cb) cb(result);
          return Promise.resolve(result);
        },
        set(obj, cb) {
          calls.storageSet.push(obj);
          Object.assign(store, obj);
          storageListeners.forEach((fn) => fn({}, 'local'));
          if (cb) cb();
          return Promise.resolve();
        },
      },
      onChanged: { addListener: (fn) => storageListeners.push(fn) },
    },

    runtime: {
      sendMessage: (msg, cb) => {
        calls.sendMessage.push(msg);
        // Route to listeners so a wired background can respond.
        messageListeners.forEach((fn) => fn(msg, chrome.__sender, cb || (() => {})));
        return Promise.resolve();
      },
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
    },

    action: {
      setBadgeText: (o) => calls.setBadgeText.push(o),
      setBadgeBackgroundColor: (o) => calls.setBadgeColor.push(o),
    },

    tabs: {
      onRemoved: { addListener: (fn) => removeListeners.push(fn) },
      query: async () => [{ id: chrome.__sender?.tab?.id ?? 1 }],
    },
  };

  return chrome;
}

// Dispatch a config or hit message into the page world synchronously.
export function postToWorld(data) {
  const ev = new window.MessageEvent('message', { data });
  if (ev.source !== window) {
    try {
      Object.defineProperty(ev, 'source', { value: window, configurable: true });
    } catch (_) {}
  }
  window.dispatchEvent(ev);
}
