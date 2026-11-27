import { describe, expect, it } from 'vitest';
import { handle, memoryStore, runDue, STALE_MS, type Env } from '../relay/src/index.ts';
import {
  b64url,
  encryptPayload,
  fromB64url,
  vapidAuthorization,
  vapidPublicKey,
  type VapidJwk,
} from '../relay/src/push.ts';
import { newShareKeys, sha256Hex } from '../src/share/crypto.ts';

const text = new TextEncoder();

// RFC 8291 Appendix A.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  header:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  ciphertext: '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ',
  // Section 5: the complete message body.
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

function jwkFromRaw(publicKey: string, d: string): VapidJwk {
  const raw = fromB64url(publicKey);
  return {
    kty: 'EC',
    crv: 'P-256',
    x: b64url(raw.slice(1, 33)),
    y: b64url(raw.slice(33, 65)),
    d,
  };
}

const VAPID = jwkFromRaw(RFC.asPublic, RFC.asPrivate);

describe('web push crypto', () => {
  it('matches the RFC 8291 example byte for byte', async () => {
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      { ...VAPID },
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );
    const publicKey = await crypto.subtle.importKey(
      'raw',
      fromB64url(RFC.asPublic),
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    );
    const body = await encryptPayload(
      text.encode(RFC.plaintext),
      fromB64url(RFC.uaPublic),
      fromB64url(RFC.auth),
      { salt: fromB64url(RFC.salt), serverKeys: { privateKey, publicKey } },
    );
    expect(b64url(body)).toBe(RFC.body);
    expect(body).toEqual(
      new Uint8Array([...fromB64url(RFC.header), ...fromB64url(RFC.ciphertext)]),
    );
  });

  it('signs a VAPID token the push service can verify', async () => {
    const endpoint = 'https://web.push.apple.com/abc';
    const header = await vapidAuthorization(endpoint, VAPID, 'https://flo.example', 1_000_000);
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, head, claims, signature, key] = match!;
    expect(key).toBe(vapidPublicKey(VAPID));
    expect(key).toBe(RFC.asPublic);
    expect(JSON.parse(new TextDecoder().decode(fromB64url(claims!)))).toEqual({
      aud: 'https://web.push.apple.com',
      exp: 1000 + 12 * 3600,
      sub: 'https://flo.example',
    });
    const verifier = await crypto.subtle.importKey(
      'raw',
      fromB64url(key!),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifier,
      fromB64url(signature!),
      text.encode(`${head}.${claims}`),
    );
    expect(valid).toBe(true);
  });
});

// A real subscription key pair, so the relay can encrypt to it.
async function subscription() {
  const keys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  return {
    p256dh: b64url(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))),
    auth: b64url(crypto.getRandomValues(new Uint8Array(16))),
  };
}

const NOW = 1_800_000_000_000;
const env = {
  DB: undefined as never,
  ALLOWED_ORIGINS: 'https://flo.example',
  VAPID_PRIVATE_JWK: JSON.stringify(VAPID),
  VAPID_SUBJECT: 'https://flo.example',
} satisfies Env;
const DEVICE = 'D'.repeat(22);
const SECRET = 's'.repeat(32);
const ENDPOINT = 'https://web.push.apple.com/QGx1';

function pushService(status = 201) {
  const sent: { url: string; headers: Headers; body: Uint8Array }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: init?.body as Uint8Array,
    });
    return new Response(null, { status });
  }) as typeof fetch;
  return { sent, fetcher };
}

async function setup(status = 201) {
  const store = memoryStore();
  const push = pushService(status);
  const call = (path: string, init: RequestInit = {}, at = NOW, vars: Env = env) =>
    handle(new Request(`https://relay.example${path}`, init), vars, store, at, push.fetcher);
  const sub = await subscription();
  const register = (
    body: Record<string, unknown> = {},
    secret = SECRET,
    id = DEVICE,
  ): Promise<Response> =>
    call(`/v1/devices/${id}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${secret}` },
      body: JSON.stringify({ endpoint: ENDPOINT, ...sub, times: [NOW + 60_000], ...body }),
    });
  return { store, push, call, register };
}

describe('relay push', () => {
  it('serves the public key, or reports push off without a key', async () => {
    const { call } = await setup();
    expect(await (await call('/v1/push/key')).json()).toEqual({ key: RFC.asPublic });
    const off = await call('/v1/push/key', {}, NOW, { DB: env.DB });
    expect(off.status).toBe(503);
  });

  it('registers a device, then only accepts updates with the same secret', async () => {
    const { store, register } = await setup();
    expect((await register()).status).toBe(201);
    expect(store.devices.get(DEVICE)?.secretHash).toBe(await sha256Hex(SECRET));
    expect((await register({ times: [NOW + 120_000] })).status).toBe(204);
    expect(store.times.get(DEVICE)).toEqual([NOW + 120_000]);
    expect((await register({ times: [] }, 't'.repeat(32))).status).toBe(403);
    expect((await register({}, 'short')).status).toBe(403);
  });

  it('rejects endpoints, keys and times it should not trust', async () => {
    const { register, store } = await setup();
    const bad: Record<string, unknown>[] = [
      { endpoint: 'https://evil.example/push' },
      { endpoint: 'http://web.push.apple.com/x' },
      { endpoint: 'https://web.push.apple.com:8443/x' },
      { p256dh: b64url(new Uint8Array(65)) },
      { auth: b64url(new Uint8Array(8)) },
      { times: [NOW + 1] },
      { times: [NOW - 2 * 60 * 60_000] },
      { times: Array.from({ length: 101 }, (_, i) => NOW + (i + 1) * 60_000) },
      { coupleId: 'not-an-id' },
    ];
    for (const body of bad) expect((await register(body)).status, JSON.stringify(body)).toBe(400);
    expect((await register({ coupleId: 'C'.repeat(22) })).status).toBe(400);
    expect(store.devices.size).toBe(0);
  });

  it('sends a test push encrypted for the device, and deletes a device', async () => {
    const { call, register, push, store } = await setup();
    await register();
    const auth = { authorization: `Bearer ${SECRET}` };
    expect(
      (await call(`/v1/devices/${DEVICE}/test`, { method: 'POST', headers: auth })).status,
    ).toBe(204);
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]!.url).toBe(ENDPOINT);
    expect(push.sent[0]!.headers.get('content-encoding')).toBe('aes128gcm');
    expect(push.sent[0]!.headers.get('authorization')).toMatch(/^vapid t=.+, k=/);
    // The payload is encrypted: the signal word is not in the body.
    expect(new TextDecoder().decode(push.sent[0]!.body)).not.toContain('test');
    expect(
      (
        await call(`/v1/devices/${DEVICE}`, {
          method: 'DELETE',
          headers: { authorization: 'Bearer x' },
        })
      ).status,
    ).toBe(403);
    expect((await call(`/v1/devices/${DEVICE}`, { method: 'DELETE', headers: auth })).status).toBe(
      204,
    );
    expect(store.devices.size).toBe(0);
    expect((await call(`/v1/devices/${DEVICE}`, { method: 'DELETE', headers: auth })).status).toBe(
      404,
    );
  });

  it('sends one tick per due device, drops stale ones and keeps future times', async () => {
    const { store, register, push } = await setup();
    await register({ times: [NOW + 60_000, NOW + 120_000, NOW + 86_400_000] });
    const other = 'E'.repeat(22);
    await register({ times: [NOW + 60_000] }, SECRET, other);
    const later = NOW + 120_000;
    expect(await runDue(env, store, later, push.fetcher)).toEqual({
      sent: 2,
      dropped: 0,
      removed: 0,
    });
    expect(push.sent).toHaveLength(2);
    expect(store.times.get(DEVICE)).toEqual([NOW + 86_400_000]);
    expect(await runDue(env, store, later, push.fetcher)).toEqual({
      sent: 0,
      dropped: 0,
      removed: 0,
    });
    // The cron was down for hours: the reminder is dropped, not sent late.
    const stale = NOW + 86_400_000 + STALE_MS + 60_000;
    expect(await runDue(env, store, stale, push.fetcher)).toEqual({
      sent: 0,
      dropped: 1,
      removed: 0,
    });
    expect(store.times.get(DEVICE)).toEqual([]);
  });

  it('forgets a device the push service says is gone', async () => {
    const { store, register, push } = await setup(410);
    await register();
    expect(await runDue(env, store, NOW + 60_000, push.fetcher)).toEqual({
      sent: 0,
      dropped: 0,
      removed: 1,
    });
    expect(store.devices.size).toBe(0);
  });

  it('tells only his linked phone that her period started, and unlinks when sharing stops', async () => {
    const { store, register, push, call } = await setup();
    const keys = newShareKeys();
    await call(`/v1/couples/${keys.coupleId}`, {
      method: 'PUT',
      body: JSON.stringify({ writeKeyHash: await sha256Hex(keys.writeKey) }),
    });
    await register({ coupleId: keys.coupleId });
    await register({}, SECRET, 'H'.repeat(22));
    const event = (token: string, kind = 'period_started') =>
      call(`/v1/couples/${keys.coupleId}/events`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind }),
      });
    expect((await event(keys.readKey)).status).toBe(403);
    expect((await event(keys.writeKey, 'sex')).status).toBe(400);
    const sent = await event(keys.writeKey);
    expect(await sent.json()).toEqual({ sent: 1 });
    expect(push.sent).toHaveLength(1);
    await call(`/v1/couples/${keys.coupleId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${keys.writeKey}` },
    });
    expect(store.devices.get(DEVICE)?.coupleId).toBeNull();
  });

  it('allows POST from the app origin', async () => {
    const { call } = await setup();
    const preflight = await call('/v1/devices/x', {
      method: 'OPTIONS',
      headers: { origin: 'https://flo.example' },
    });
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST');
  });
});
