import { describe, expect, it } from 'vitest';
import { concat, fromBase64Url, toBase64Url, utf8 } from '../src/bytes.ts';
import {
  PUSH_PAYLOAD,
  RECORD_SIZE,
  buildPushRequest,
  encryptPayload,
  importVapidKeys,
  isAllowedPushHost,
  parseSubscription,
  vapidJwt,
} from '../src/webpush.ts';
import { decryptPushBody, newSyntheticSubscription, newVapidJwk, verifyJwt } from './helpers.ts';

// RFC 8291 Appendix A test vector (public example keys from the RFC, not real data).
const rfc = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  message:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

function b64(text: string): Uint8Array<ArrayBuffer> {
  const bytes = fromBase64Url(text);
  if (!bytes) throw new Error('bad base64url in test vector');
  return bytes;
}

async function importEcdhPrivate(publicRaw: string, privateD: string): Promise<CryptoKey> {
  const pub = b64(publicRaw);
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: toBase64Url(pub.slice(1, 33)),
      y: toBase64Url(pub.slice(33, 65)),
      d: privateD,
    },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
}

describe('aes128gcm Web Push encryption', () => {
  it('reproduces the RFC 8291 Appendix A message byte for byte', async () => {
    const sender = {
      privateKey: await importEcdhPrivate(rfc.asPublic, rfc.asPrivate),
      publicRaw: b64(rfc.asPublic),
    };
    const body = await encryptPayload(utf8(rfc.plaintext), b64(rfc.uaPublic), b64(rfc.auth), {
      salt: b64(rfc.salt),
      sender,
    });
    expect(toBase64Url(body)).toBe(rfc.message);
  });

  it('decrypts the RFC 8291 message with the independent receiver helper', async () => {
    const uaPrivate = await importEcdhPrivate(rfc.uaPublic, rfc.uaPrivate);
    const result = await decryptPushBody(
      b64(rfc.message),
      uaPrivate,
      b64(rfc.uaPublic),
      b64(rfc.auth),
    );
    expect(result.plaintext).toBe(rfc.plaintext);
    expect(result.recordSize).toBe(4096);
  });

  it('round-trips the fixed generic payload for a synthetic subscription with fresh salt and key', async () => {
    const sub = await newSyntheticSubscription();
    const first = await encryptPayload(utf8(PUSH_PAYLOAD), sub.p256dh, sub.auth);
    const second = await encryptPayload(utf8(PUSH_PAYLOAD), sub.p256dh, sub.auth);
    expect(toBase64Url(first)).not.toBe(toBase64Url(second));
    const opened = await decryptPushBody(first, sub.privateKey, sub.p256dh, sub.auth);
    expect(opened.plaintext).toBe(PUSH_PAYLOAD);
    expect(opened.recordSize).toBe(RECORD_SIZE);
    expect(opened.senderPublic).toHaveLength(65);
  });

  it('refuses a payload that does not fit one record', async () => {
    const sub = await newSyntheticSubscription();
    await expect(encryptPayload(new Uint8Array(RECORD_SIZE), sub.p256dh, sub.auth)).rejects.toThrow(
      'payload too large',
    );
  });
});

describe('VAPID', () => {
  it('signs an ES256 JWT that verifies with the advertised public key', async () => {
    const vapid = await importVapidKeys(await newVapidJwk());
    expect(vapid).not.toBeNull();
    if (!vapid) return;
    const jwt = await vapidJwt(
      vapid.privateKey,
      'https://web.push.apple.com',
      'https://relay.example.test',
      1_800_000_000,
    );
    const verified = await verifyJwt(jwt, vapid.publicRaw);
    expect(verified?.header).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(verified?.claims).toEqual({
      aud: 'https://web.push.apple.com',
      exp: 1_800_000_000,
      sub: 'https://relay.example.test',
    });
  });

  it('rejects malformed or non-P-256 key material', async () => {
    expect(await importVapidKeys('not json')).toBeNull();
    expect(await importVapidKeys(JSON.stringify({ kty: 'RSA' }))).toBeNull();
    const jwk = JSON.parse(await newVapidJwk()) as JsonWebKey;
    expect(await importVapidKeys(JSON.stringify({ ...jwk, d: undefined }))).toBeNull();
  });

  it('builds one request with VAPID auth, aes128gcm body and the fixed text', async () => {
    const vapid = await importVapidKeys(await newVapidJwk());
    const sub = await newSyntheticSubscription();
    if (!vapid) throw new Error('vapid import failed');
    const subscription = parseSubscription({
      endpoint: 'https://web.push.apple.com/synthetic-token-0001',
      keys: { p256dh: toBase64Url(sub.p256dh), auth: toBase64Url(sub.auth) },
    });
    if (!subscription) throw new Error('subscription rejected');
    const push = await buildPushRequest(subscription, vapid, 'https://relay.example.test', 1_000);
    expect(push.url).toBe('https://web.push.apple.com/synthetic-token-0001');
    expect(push.headers['content-encoding']).toBe('aes128gcm');
    expect(push.headers.ttl).toBe('60');
    const match = /^vapid t=([^,]+), k=([A-Za-z0-9_-]+)$/.exec(push.headers.authorization ?? '');
    expect(match?.[2]).toBe(toBase64Url(vapid.publicRaw));
    const verified = await verifyJwt(match?.[1] ?? '', vapid.publicRaw);
    expect(verified?.claims).toEqual({
      aud: 'https://web.push.apple.com',
      exp: 1_000 + 12 * 60 * 60,
      sub: 'https://relay.example.test',
    });
    const opened = await decryptPushBody(push.body, sub.privateKey, sub.p256dh, sub.auth);
    expect(opened.plaintext).toBe(PUSH_PAYLOAD);
  });
});

describe('subscription validation', () => {
  const keys = {
    p256dh: toBase64Url(concat(new Uint8Array([4]), new Uint8Array(64).fill(7))),
    auth: toBase64Url(new Uint8Array(16).fill(1)),
  };

  it('accepts the known push services only', () => {
    for (const host of [
      'web.push.apple.com',
      'api.push.apple.com',
      'fcm.googleapis.com',
      'updates.push.services.mozilla.com',
      'wns2-par02p.notify.windows.com',
    ]) {
      expect(isAllowedPushHost(host), host).toBe(true);
    }
    for (const host of [
      'push.apple.com.evil.example',
      'evilpush.apple.com',
      '.push.apple.com',
      'example.com',
      'googleapis.com',
      'localhost',
    ]) {
      expect(isAllowedPushHost(host), host).toBe(false);
    }
  });

  it.each([
    ['not an object', 'x'],
    ['http endpoint', { endpoint: 'http://web.push.apple.com/a', keys }],
    ['credentials in URL', { endpoint: 'https://u:p@web.push.apple.com/a', keys }],
    ['explicit port', { endpoint: 'https://web.push.apple.com:8443/a', keys }],
    ['unlisted host', { endpoint: 'https://relay.example.test/a', keys }],
    ['missing keys', { endpoint: 'https://web.push.apple.com/a' }],
    ['short auth', { endpoint: 'https://web.push.apple.com/a', keys: { ...keys, auth: 'AAAA' } }],
    [
      'compressed point',
      {
        endpoint: 'https://web.push.apple.com/a',
        keys: { ...keys, p256dh: toBase64Url(new Uint8Array(33).fill(2)) },
      },
    ],
    ['too long', { endpoint: `https://web.push.apple.com/${'a'.repeat(1100)}`, keys }],
  ])('rejects %s', (_name, value) => {
    expect(parseSubscription(value)).toBeNull();
  });

  it('accepts a well-formed synthetic subscription', () => {
    expect(parseSubscription({ endpoint: 'https://web.push.apple.com/abc', keys })).not.toBeNull();
  });
});
