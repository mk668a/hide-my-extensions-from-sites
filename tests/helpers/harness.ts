// Test harness: loads a content-script source file (which is a plain script, not
// an ES module) into the current jsdom global, with a synchronous postMessage
// shim and a controllable chrome.* mock. Lets us exercise the *real shipped
// files* rather than a refactored copy. It reads the compiled src/*.js that tsc
// emits (the exact bytes the browser loads), not the .ts authoring source.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../src');

export function readSrc(name: string): string {
  return fs.readFileSync(path.join(SRC, name), 'utf8');
}

// Run a script string in global scope (indirect eval), so `window`, `Element`,
// `XMLHttpRequest`, etc. resolve to the jsdom globals.
export function runScript(code: string): void {
  (0, eval)(code);
}

export function runSrc(name: string): void {
  runScript(readSrc(name));
}

// Deliver postMessage synchronously with source === window, which jsdom does not
// guarantee on its own. Both worlds (inject/content) rely on e.source === window.
export function installSyncPostMessage(): void {
  (window as any).postMessage = (data: any) => {
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
export function makeChrome(opts: any = {}): any {
  const store: Record<string, any> = { enabled: true, deception: false, ...(opts.store || {}) };
  const storageListeners: Array<(changes: any, area: string) => void> = [];
  const messageListeners: Array<(msg: any, sender: any, cb: any) => void> = [];
  const removeListeners: Array<(tabId: number) => void> = [];
  const calls = {
    sendMessage: [] as any[],
    setBadgeText: [] as any[],
    setBadgeColor: [] as any[],
    storageSet: [] as any[],
  };

  const chrome: any = {
    __store: store,
    __calls: calls,
    __sender: opts.sender || { tab: { id: 1 } },
    __emitRemoved: (tabId: number) => removeListeners.forEach((fn) => fn(tabId)),

    storage: {
      local: {
        get(defaults: any, cb?: (result: any) => void) {
          // chrome.storage.local.get(null) returns the whole store; get(obj)
          // returns those keys with defaults filled in for missing ones.
          let result: Record<string, any>;
          if (defaults == null) {
            result = { ...store };
          } else {
            result = typeof defaults === 'object' ? { ...defaults } : {};
            for (const k of Object.keys(result)) if (k in store) result[k] = store[k];
          }
          if (cb) cb(result);
          return Promise.resolve(result);
        },
        set(obj: any, cb?: () => void) {
          calls.storageSet.push(obj);
          Object.assign(store, obj);
          storageListeners.forEach((fn) => fn({}, 'local'));
          if (cb) cb();
          return Promise.resolve();
        },
      },
      onChanged: { addListener: (fn: (changes: any, area: string) => void) => storageListeners.push(fn) },
    },

    runtime: {
      sendMessage: (msg: any, cb?: (response: any) => void) => {
        calls.sendMessage.push(msg);
        // Route to listeners so a wired background can respond.
        messageListeners.forEach((fn) => fn(msg, chrome.__sender, cb || (() => {})));
        return Promise.resolve();
      },
      onMessage: { addListener: (fn: (msg: any, sender: any, cb: any) => void) => messageListeners.push(fn) },
    },

    action: {
      setBadgeText: (o: any) => calls.setBadgeText.push(o),
      setBadgeBackgroundColor: (o: any) => calls.setBadgeColor.push(o),
    },

    tabs: {
      onRemoved: { addListener: (fn: (tabId: number) => void) => removeListeners.push(fn) },
      query: async () => [{ id: chrome.__sender?.tab?.id ?? 1 }],
    },
  };

  return chrome;
}

// Dispatch a config or hit message into the page world synchronously.
export function postToWorld(data: any): void {
  const ev = new window.MessageEvent('message', { data });
  if (ev.source !== window) {
    try {
      Object.defineProperty(ev, 'source', { value: window, configurable: true });
    } catch (_) {}
  }
  window.dispatchEvent(ev);
}
