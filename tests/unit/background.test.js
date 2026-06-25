// Unit tests for src/background.js — the service worker (counts, badge, log).
import { describe, it, expect, beforeAll } from 'vitest';
import { readSrc, runScript, makeChrome } from '../helpers/harness.js';

let chrome;

// Drive the worker the way a sender would: set the originating tab, then dispatch.
function send(msg, tabId, cb) {
  chrome.__sender = { tab: { id: tabId } };
  return chrome.runtime.sendMessage(msg, cb);
}

function getStats(tabId) {
  let stats;
  send({ type: 'getStats', tabId }, tabId, (s) => (stats = s));
  return stats;
}

function lastBadge() {
  const calls = chrome.__calls.setBadgeText;
  return calls[calls.length - 1];
}

beforeAll(() => {
  chrome = makeChrome();
  globalThis.chrome = chrome;
  runScript(readSrc('background.js'));
});

describe('hit accounting', () => {
  it('increments the count and paints the badge for the sending tab', () => {
    send({ type: 'hit', url: 'chrome-extension://a/x', vector: 'fetch', action: 'block' }, 10);
    expect(lastBadge()).toEqual({ tabId: 10, text: '1' });
    send({ type: 'hit', url: 'chrome-extension://a/y', vector: 'img', action: 'block' }, 10);
    expect(lastBadge()).toEqual({ tabId: 10, text: '2' });
    expect(getStats(10).count).toBe(2);
  });

  it('keeps counts isolated per tab', () => {
    send({ type: 'hit', url: 'chrome-extension://a/z', vector: 'fetch', action: 'fake' }, 11);
    expect(getStats(11).count).toBe(1);
    expect(getStats(10).count).toBe(2); // unchanged
  });

  it('records the newest hit first and keeps the log', () => {
    const log = getStats(11).log;
    expect(log[0]).toMatchObject({ url: 'chrome-extension://a/z', action: 'fake' });
  });

  it('caps the log at 50 entries', () => {
    for (let i = 0; i < 60; i++) {
      send({ type: 'hit', url: 'chrome-extension://a/' + i, vector: 'fetch', action: 'block' }, 12);
    }
    expect(getStats(12).count).toBe(60);
    expect(getStats(12).log.length).toBe(50);
  });
});

describe('resets', () => {
  it('pageload resets the sending tab and clears the badge', () => {
    send({ type: 'hit', url: 'chrome-extension://a/x', vector: 'fetch', action: 'block' }, 20);
    expect(getStats(20).count).toBe(1);
    send({ type: 'pageload' }, 20);
    expect(getStats(20).count).toBe(0);
    expect(lastBadge()).toEqual({ tabId: 20, text: '' });
  });

  it('clear (from popup, no sender.tab) resets the named tab', () => {
    send({ type: 'hit', url: 'chrome-extension://a/x', vector: 'fetch', action: 'block' }, 21);
    expect(getStats(21).count).toBe(1);
    // popup sends with no sender.tab; tabId is carried in the message.
    chrome.__sender = {};
    chrome.runtime.sendMessage({ type: 'clear', tabId: 21 });
    expect(getStats(21).count).toBe(0);
  });
});

describe('cleanup', () => {
  it('drops state when the tab is removed', () => {
    send({ type: 'hit', url: 'chrome-extension://a/x', vector: 'fetch', action: 'block' }, 30);
    expect(getStats(30).count).toBe(1);
    chrome.__emitRemoved(30);
    expect(getStats(30).count).toBe(0);
  });
});
