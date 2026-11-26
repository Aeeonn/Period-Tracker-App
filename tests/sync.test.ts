import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as storage from '../src/data/storage.ts';
import { runEngine } from '../src/engine/index.ts';
import { date } from '../src/lib/date.ts';
import { newShareKeys, seal } from '../src/share/crypto.ts';
import { buildSnapshot } from '../src/share/snapshot.ts';

vi.stubEnv('VITE_RELAY_URL', 'https://relay.test');
const { refreshPartner } = await import('../src/share/sync.ts');

const keys = newShareKeys();
const output = runEngine({ today: date('2026-01-10'), days: [], contraception: 'none' });
const snapshot = (now: number) =>
  buildSnapshot({ output, days: [], categories: ['period'], paused: false, now });

function serve(status: number, body: unknown) {
  vi.stubGlobal('fetch', () => Promise.resolve(Response.json(body, { status })));
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await storage.deleteEverything();
});

describe('refreshPartner', () => {
  it('never replaces his copy with an older snapshot', async () => {
    await storage.saveShare({ role: 'partner', ...keys, lastSnapshot: snapshot(2000) });
    serve(200, await seal(keys, snapshot(1000)));
    expect((await refreshPartner())?.lastSnapshot?.createdAt).toBe(2000);
    serve(200, await seal(keys, snapshot(3000)));
    expect((await refreshPartner())?.lastSnapshot?.createdAt).toBe(3000);
  });

  it('drops his copy when she has stopped sharing', async () => {
    await storage.saveShare({ role: 'partner', ...keys, lastSnapshot: snapshot(2000) });
    serve(404, { error: 'no_couple' });
    const next = await refreshPartner();
    expect(next).toMatchObject({ ended: true });
    expect(next?.lastSnapshot).toBeUndefined();
  });
});
