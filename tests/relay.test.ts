import { describe, expect, it } from 'vitest';
import { handle, MAX_BODY_BYTES, memoryStore, type Env } from '../relay/src/index.ts';
import { newShareKeys, sha256Hex } from '../src/share/crypto.ts';

const env = { DB: undefined as never, ALLOWED_ORIGINS: 'https://flo.example' } satisfies Env;
const base = 'https://relay.example/v1/couples/';

async function setup() {
  const store = memoryStore();
  const keys = newShareKeys();
  const call = (path: string, init: RequestInit = {}) =>
    handle(new Request(base + keys.coupleId + path, init), env, store, 1000);
  const created = await call('', {
    method: 'PUT',
    body: JSON.stringify({ writeKeyHash: await sha256Hex(keys.writeKey) }),
  });
  expect(created.status).toBe(201);
  return { store, keys, call };
}

/** Valid-looking sealed box: a 12-byte IV and a ciphertext holding at least the tag. */
const IV = 'a'.repeat(16);
const CT = 'b'.repeat(24);

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('relay', () => {
  it('stores and returns the latest snapshot for the write key holder', async () => {
    const { call, keys, store } = await setup();
    expect((await call('/snapshot')).status).toBe(404);
    const put = await call('/snapshot', {
      method: 'PUT',
      headers: bearer(keys.writeKey),
      body: JSON.stringify({ iv: IV, ct: CT }),
    });
    expect(put.status).toBe(204);
    const get = await call('/snapshot');
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({ iv: IV, ct: CT, updatedAt: 1000 });
    expect(store.couples.get(keys.coupleId)).not.toBe(keys.writeKey);
  });

  it('refuses writes and deletes with only the pairing code values', async () => {
    const { call, keys } = await setup();
    for (const token of [keys.readKey, keys.coupleId, '']) {
      const put = await call('/snapshot', {
        method: 'PUT',
        headers: bearer(token),
        body: JSON.stringify({ iv: IV, ct: CT }),
      });
      expect(put.status).toBe(403);
      expect((await call('', { method: 'DELETE', headers: bearer(token) })).status).toBe(403);
    }
  });

  it('does not let anyone re-register an existing couple', async () => {
    const { call } = await setup();
    const again = await call('', {
      method: 'PUT',
      body: JSON.stringify({ writeKeyHash: 'a'.repeat(64) }),
    });
    expect(again.status).toBe(409);
  });

  it('deletes the couple and snapshot, after which reads say the couple is gone', async () => {
    const { call, keys, store } = await setup();
    await call('/snapshot', {
      method: 'PUT',
      headers: bearer(keys.writeKey),
      body: JSON.stringify({ iv: IV, ct: CT }),
    });
    expect((await call('', { method: 'DELETE', headers: bearer(keys.writeKey) })).status).toBe(204);
    expect(store.snapshots.size).toBe(0);
    const get = await call('/snapshot');
    expect(get.status).toBe(404);
    expect(await get.json()).toEqual({ error: 'no_couple' });
  });

  it('rejects bad ids, bodies and oversized uploads', async () => {
    const { call, keys } = await setup();
    const store = memoryStore();
    expect((await handle(new Request(base + 'short/snapshot'), env, store)).status).toBe(400);
    const bad = await call('/snapshot', {
      method: 'PUT',
      headers: bearer(keys.writeKey),
      body: JSON.stringify({ iv: 'has space', ct: 'x' }),
    });
    expect(bad.status).toBe(400);
    for (const box of [
      { iv: 'a'.repeat(15), ct: CT },
      { iv: IV, ct: 'b'.repeat(21) },
    ]) {
      const short = await call('/snapshot', {
        method: 'PUT',
        headers: bearer(keys.writeKey),
        body: JSON.stringify(box),
      });
      expect(short.status).toBe(400);
    }
    const huge = await call('/snapshot', {
      method: 'PUT',
      headers: bearer(keys.writeKey),
      body: JSON.stringify({ iv: IV, ct: 'a'.repeat(MAX_BODY_BYTES) }),
    });
    expect(huge.status).toBe(400);
  });

  it('allows CORS only from configured origins', async () => {
    const { call } = await setup();
    const allowed = await call('/snapshot', {
      method: 'OPTIONS',
      headers: { origin: 'https://flo.example' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://flo.example');
    const other = await call('/snapshot', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example' },
    });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});
