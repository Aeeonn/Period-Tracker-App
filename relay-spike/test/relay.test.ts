import { beforeEach, describe, expect, it } from 'vitest';
import { type Bytes, toBase64Url, utf8 } from '../src/bytes.ts';
import { type Deps, type Env, MAX_BODY_BYTES, PUSH_TEST_LIMIT, handle } from '../src/relay.ts';
import { signRequest } from '../src/signed-request.ts';
import { PUSH_PAYLOAD, importVapidKeys } from '../src/webpush.ts';
import {
  createTestD1,
  decryptPushBody,
  hashHex,
  newSyntheticSubscription,
  newVapidJwk,
  verifyJwt,
} from './helpers.ts';

// Synthetic bearer value for tests only; the preview value lives outside the repository.
const testBearer = 'synthetic-test-bearer-0123456789abcdef';
const ORIGIN = 'https://relay.example.test';
const NOW_MS = 1_800_000_000_000;
const NOW_S = NOW_MS / 1000;

interface Captured {
  url: string;
  init: RequestInit;
}

let env: Env;
let calls: Captured[];
let deps: Deps;
let pushResponse: () => Response;

beforeEach(async () => {
  const hash = await hashHex(testBearer);
  env = {
    DB: createTestD1(),
    ENROLLMENT_SECRET_HASH: hash,
    VAPID_PRIVATE_JWK: await newVapidJwk(),
  };
  calls = [];
  pushResponse = () => new Response(JSON.stringify({ reason: 'BadDeviceToken' }), { status: 400 });
  deps = {
    fetch: (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(pushResponse());
    },
    nowMs: () => NOW_MS,
  };
});

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

const bearer = { authorization: `Bearer ${testBearer}` };

async function subscriptionBody() {
  const sub = await newSyntheticSubscription();
  return {
    sub,
    body: {
      subscription: {
        endpoint: 'https://web.push.apple.com/synthetic-subscription-token',
        expirationTime: null,
        keys: { p256dh: toBase64Url(sub.p256dh), auth: toBase64Url(sub.auth) },
      },
    },
  };
}

describe('POST /push-test authorization', () => {
  it('returns 401 before reading the body or accessing D1 when unauthenticated', async () => {
    let bodyPulls = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          bodyPulls += 1;
          controller.enqueue(utf8('synthetic body'));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const noD1Env: Env = {
      ...env,
      DB: {
        prepare: () => {
          throw new Error('unauthenticated request accessed D1');
        },
        batch: () => {
          throw new Error('unauthenticated request accessed D1');
        },
      },
    };
    const request = new Request(`${ORIGIN}/push-test`, {
      method: 'POST',
      body,
      duplex: 'half',
    });
    const response = await handle(request, noD1Env, deps);
    expect(response.status).toBe(401);
    expect(bodyPulls).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('returns 401 for an empty POST, as the live curl check does', async () => {
    const response = await handle(post('/push-test', undefined), env, deps);
    expect(response.status).toBe(401);
  });

  it.each([
    ['wrong secret', 'Bearer synthetic-wrong-bearer-0123456789'],
    ['wrong scheme', `Basic ${testBearer}`],
    ['secret too short', 'Bearer short'],
  ])('returns 401 for a %s', async (_name, value) => {
    const { body } = await subscriptionBody();
    const response = await handle(post('/push-test', body, { authorization: value }), env, deps);
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('returns 503 when the preview secrets are not configured', async () => {
    const { body } = await subscriptionBody();
    const unconfigured: Env = { DB: env.DB };
    expect((await handle(post('/push-test', body, bearer), unconfigured, deps)).status).toBe(503);
    expect(calls).toHaveLength(0);
  });
});

describe('POST /push-test with the secret', () => {
  it('attempts exactly one well-formed encrypted push with the fixed generic text', async () => {
    const { sub, body } = await subscriptionBody();
    const response = await handle(post('/push-test', body, bearer), env, deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      attempted: 1,
      pushService: 'web.push.apple.com',
      pushStatus: 400,
      pushReason: 'BadDeviceToken',
    });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    if (!call) throw new Error('no call');
    expect(call.url).toBe('https://web.push.apple.com/synthetic-subscription-token');
    expect(call.init.method).toBe('POST');
    expect(call.init.redirect).toBe('manual');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['content-encoding']).toBe('aes128gcm');
    const vapid = await importVapidKeys(env.VAPID_PRIVATE_JWK ?? '');
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(headers.authorization ?? '');
    if (!vapid || !match?.[1]) throw new Error('missing VAPID authorization');
    expect(match[2]).toBe(toBase64Url(vapid.publicRaw));
    const jwt = await verifyJwt(match[1], vapid.publicRaw);
    expect(jwt?.claims).toEqual({
      aud: 'https://web.push.apple.com',
      exp: NOW_S + 12 * 60 * 60,
      sub: ORIGIN,
    });
    const opened = await decryptPushBody(
      call.init.body as Bytes,
      sub.privateKey,
      sub.p256dh,
      sub.auth,
    );
    expect(opened.plaintext).toBe(PUSH_PAYLOAD);
    expect(JSON.parse(opened.plaintext)).toEqual({
      title: 'Synthetic probe test',
      body: 'This is a synthetic notification test.',
    });
  });

  it('sends the same fixed text whatever extra fields the caller adds', async () => {
    const { sub, body } = await subscriptionBody();
    const request = post('/push-test', { ...body, title: 'custom', text: 'custom' }, bearer);
    expect((await handle(request, env, deps)).status).toBe(200);
    const [call] = calls;
    const opened = await decryptPushBody(
      call?.init.body as Bytes,
      sub.privateKey,
      sub.p256dh,
      sub.auth,
    );
    expect(opened.plaintext).toBe(PUSH_PAYLOAD);
  });

  it('does not consume rate-limit slots for authorized invalid requests', async () => {
    const malformedJson = new Request(`${ORIGIN}/push-test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer },
      body: '{not json',
    });
    const invalidSubscription = post('/push-test', { subscription: {} }, bearer);
    const oversized = post('/push-test', { pad: 'x'.repeat(MAX_BODY_BYTES) }, bearer);
    const invalidRequests = [
      [malformedJson, 400],
      [invalidSubscription, 400],
      [oversized, 413],
    ] as const;

    for (const [request, expectedStatus] of invalidRequests) {
      expect((await handle(request, env, deps)).status).toBe(expectedStatus);
    }

    const db = env.DB as ReturnType<typeof createTestD1>;
    expect(db.sqlite.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM rate_limits').get()).toEqual(
      { n: 0 },
    );
    expect(calls).toHaveLength(0);

    const { body } = await subscriptionBody();
    for (let i = 0; i < PUSH_TEST_LIMIT; i += 1) {
      expect((await handle(post('/push-test', body, bearer), env, deps)).status).toBe(200);
    }
    expect((await handle(post('/push-test', body, bearer), env, deps)).status).toBe(429);
    expect(db.sqlite.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM rate_limits').get()).toEqual(
      { n: PUSH_TEST_LIMIT + 1 },
    );
    expect(calls).toHaveLength(PUSH_TEST_LIMIT);
  });

  it('rate-limits authorized calls to the window limit', async () => {
    const { body } = await subscriptionBody();
    for (let i = 0; i < PUSH_TEST_LIMIT; i += 1) {
      expect((await handle(post('/push-test', body, bearer), env, deps)).status).toBe(200);
    }
    expect((await handle(post('/push-test', body, bearer), env, deps)).status).toBe(429);
    expect(calls).toHaveLength(PUSH_TEST_LIMIT);
    deps.nowMs = () => NOW_MS + 600_000;
    expect((await handle(post('/push-test', body, bearer), env, deps)).status).toBe(200);
  });

  it('refuses an endpoint outside the push-service allowlist without fetching', async () => {
    const { body } = await subscriptionBody();
    body.subscription.endpoint = 'https://relay.example.test/internal';
    expect((await handle(post('/push-test', body, bearer), env, deps)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('refuses a malformed body without fetching', async () => {
    const request = new Request(`${ORIGIN}/push-test`, {
      method: 'POST',
      headers: bearer,
      body: '{not json',
    });
    expect((await handle(request, env, deps)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('reports 502 with one attempt when the push service is unreachable', async () => {
    const { body } = await subscriptionBody();
    deps.fetch = (url, init) => {
      calls.push({ url, init });
      return Promise.reject(new Error('synthetic network failure'));
    };
    const response = await handle(post('/push-test', body, bearer), env, deps);
    expect(response.status).toBe(502);
    expect(calls).toHaveLength(1);
  });

  it('does not echo a non-conforming push-service reason', async () => {
    const { body } = await subscriptionBody();
    pushResponse = () => new Response('<html>synthetic</html>', { status: 404 });
    const response = await handle(post('/push-test', body, bearer), env, deps);
    expect(await response.json()).toEqual({
      attempted: 1,
      pushService: 'web.push.apple.com',
      pushStatus: 404,
    });
  });

  it('refuses oversized bodies', async () => {
    const request = post('/push-test', { pad: 'x'.repeat(20_000) }, bearer);
    expect((await handle(request, env, deps)).status).toBe(413);
  });
});

describe('signed spike routes', () => {
  let device: CryptoKeyPair;

  beforeEach(async () => {
    device = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const publicKey = toBase64Url(
      new Uint8Array(await crypto.subtle.exportKey('raw', device.publicKey)),
    );
    const registered = await handle(
      post('/spike/devices', { deviceId: 'synthetic-device-1', publicKey }, bearer),
      env,
      deps,
    );
    expect(registered.status).toBe(201);
  });

  async function signed(
    path: string,
    body: unknown,
    options: { nonce?: string; ts?: number; deviceId?: string; tamper?: boolean } = {},
  ): Promise<Request> {
    const text = JSON.stringify(body);
    const sig = await signRequest(
      device.privateKey,
      options.deviceId ?? 'synthetic-device-1',
      'POST',
      path,
      options.ts ?? NOW_S,
      options.nonce ?? 'synthetic-nonce-0000000001',
      utf8(text),
    );
    return new Request(`${ORIGIN}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', sig },
      body: options.tamper ? `${text} ` : text,
    });
  }

  it('accepts a valid signed request and records its nonce in D1', async () => {
    const response = await handle(await signed('/spike/signed', { synthetic: true }), env, deps);
    expect(response.status).toBe(200);
    const db = env.DB as ReturnType<typeof createTestD1>;
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM nonces').get()).toEqual({ n: 1 });
  });

  it('rejects a chunked over-limit body and cancels without pulling later chunks', async () => {
    const chunks = [new Uint8Array(MAX_BODY_BYTES), new Uint8Array([1]), new Uint8Array([2])];
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          const chunk = chunks[pulls];
          if (!chunk) {
            controller.close();
            return;
          }
          pulls += 1;
          controller.enqueue(chunk);
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request(`${ORIGIN}/spike/signed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    });

    expect(request.headers.get('content-length')).toBeNull();
    const response = await handle(request, env, deps);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'body too large' });
    expect(pulls).toBe(2);
    expect(cancelled).toBe(true);
  });

  it('accepts a chunked body exactly at the byte limit', async () => {
    const body = utf8(JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES - 10) }));
    expect(body.byteLength).toBe(MAX_BODY_BYTES);
    const sig = await signRequest(
      device.privateKey,
      'synthetic-device-1',
      'POST',
      '/spike/signed',
      NOW_S,
      'synthetic-nonce-0000000003',
      body,
    );
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1;
          controller.enqueue(body);
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request(`${ORIGIN}/spike/signed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', sig },
      body: stream,
      duplex: 'half',
    });

    expect(request.headers.get('content-length')).toBeNull();
    expect((await handle(request, env, deps)).status).toBe(200);
    expect(pulls).toBe(1);
  });

  it('rejects a replayed nonce with 409', async () => {
    expect((await handle(await signed('/spike/signed', { n: 1 }), env, deps)).status).toBe(200);
    expect((await handle(await signed('/spike/signed', { n: 1 }), env, deps)).status).toBe(409);
  });

  it.each([
    ['stale timestamp', { ts: NOW_S - 301 }],
    ['future timestamp', { ts: NOW_S + 301 }],
    ['unknown device', { deviceId: 'synthetic-device-2' }],
    ['tampered body', { tamper: true }],
  ])('rejects a %s with 401', async (_name, options) => {
    const response = await handle(await signed('/spike/signed', { n: 2 }, options), env, deps);
    expect(response.status).toBe(401);
  });

  it('accepts the edge of the 300 s window', async () => {
    const response = await handle(
      await signed('/spike/signed', { n: 3 }, { ts: NOW_S - 300 }),
      env,
      deps,
    );
    expect(response.status).toBe(200);
  });

  it('rejects a request without a Sig header', async () => {
    expect((await handle(post('/spike/signed', { n: 4 }), env, deps)).status).toBe(401);
  });

  it('expires nonces after the TTL bucket', async () => {
    expect((await handle(await signed('/spike/signed', { n: 5 }), env, deps)).status).toBe(200);
    deps.nowMs = () => NOW_MS + 15 * 60_000;
    expect(
      (
        await handle(
          await signed(
            '/spike/signed',
            { n: 6 },
            { ts: NOW_S + 900, nonce: 'synthetic-nonce-0000000002' },
          ),
          env,
          deps,
        )
      ).status,
    ).toBe(200);
    const db = env.DB as ReturnType<typeof createTestD1>;
    expect(db.sqlite.prepare('SELECT COUNT(*) AS n FROM nonces').get()).toEqual({ n: 1 });
  });

  it('push-sign builds the VAPID-signed encrypted push without sending it', async () => {
    const { body } = await subscriptionBody();
    const response = await handle(await signed('/spike/push-sign', body), env, deps);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: boolean; encryptedBytes: number };
    expect(json.ok).toBe(true);
    expect(json.encryptedBytes).toBe(16 + 4 + 1 + 65 + PUSH_PAYLOAD.length + 1 + 16);
    expect(calls).toHaveLength(0);
  });

  it('device registration requires the enrollment secret', async () => {
    const response = await handle(
      post('/spike/devices', { deviceId: 'synthetic-device-3', publicKey: 'AA' }),
      env,
      deps,
    );
    expect(response.status).toBe(401);
  });
});

describe('routing', () => {
  it('serves the public VAPID key only', async () => {
    const response = await handle(new Request(`${ORIGIN}/vapid-public-key`), env, deps);
    const vapid = await importVapidKeys(env.VAPID_PRIVATE_JWK ?? '');
    expect(await response.json()).toEqual({
      key: toBase64Url(vapid?.publicRaw ?? new Uint8Array()),
    });
  });

  it('returns 404 for unknown paths, including prototype names', async () => {
    for (const path of ['/', '/constructor', '/__proto__', '/v1/spaces']) {
      expect((await handle(post(path, {}), env, deps)).status, path).toBe(404);
    }
  });

  it('returns 405 for GET on POST routes', async () => {
    expect((await handle(new Request(`${ORIGIN}/push-test`), env, deps)).status).toBe(405);
  });

  it('sets no CORS headers', async () => {
    const response = await handle(post('/push-test', {}), env, deps);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
