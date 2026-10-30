import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const workerSource = readFileSync(new URL('./public/probe-sw.js', import.meta.url), 'utf8');

function createWorker(windowClients = [], calls = []) {
  const listeners = new Map();
  const scope = {
    registration: {
      showNotification: async (...args) => calls.push(['showNotification', ...args]),
    },
    clients: {
      matchAll: async (options) => {
        calls.push(['matchAll', options]);
        return windowClients;
      },
      openWindow: async (path) => calls.push(['openWindow', path]),
    },
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  runInNewContext(workerSource, { self: scope });
  return { calls, listeners };
}

test('push displays the fixed generic synthetic notification', async () => {
  const { calls, listeners } = createWorker();
  const tasks = [];
  const handler = listeners.get('push');
  assert.equal(typeof handler, 'function');
  handler({ waitUntil: (task) => tasks.push(task) });
  assert.equal(tasks.length, 1);
  await tasks[0];
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'showNotification');
  assert.equal(calls[0][1], 'Synthetic probe test');
  assert.equal(calls[0][2].body, 'This is a synthetic notification test.');
  assert.equal(calls[0][2].tag, 'synthetic-probe-test');
});

test('notification click closes the notification and focuses an open window', async () => {
  const calls = [];
  const client = { focus: async () => calls.push('focus') };
  const { listeners } = createWorker([client], calls);
  const tasks = [];
  const handler = listeners.get('notificationclick');
  assert.equal(typeof handler, 'function');
  handler({
    notification: { close: () => calls.push('close') },
    waitUntil: (task) => tasks.push(task),
  });
  assert.equal(calls[0], 'close');
  assert.equal(tasks.length, 1);
  await tasks[0];
  assert.equal(calls[1][0], 'matchAll');
  assert.equal(calls[1][1].type, 'window');
  assert.equal(calls[1][1].includeUncontrolled, true);
  assert.equal(calls[2], 'focus');
});

test('notification click opens the site root when no window is open', async () => {
  const { calls, listeners } = createWorker();
  const tasks = [];
  const handler = listeners.get('notificationclick');
  assert.equal(typeof handler, 'function');
  handler({
    notification: { close: () => calls.push(['close']) },
    waitUntil: (task) => tasks.push(task),
  });
  assert.equal(calls[0][0], 'close');
  assert.equal(tasks.length, 1);
  await tasks[0];
  const openCall = calls.find(([name]) => name === 'openWindow');
  assert.ok(openCall);
  assert.equal(openCall[1], '/');
});
