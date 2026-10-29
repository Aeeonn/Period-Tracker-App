// Web Push sender pieces: VAPID ES256 JWT (RFC 8292) and aes128gcm payload encryption
// (RFC 8291 over RFC 8188). WebCrypto only; no dependencies.
import { type Bytes, concat, fromBase64Url, toBase64Url, utf8 } from './bytes.ts';

/** The fixed generic notification text. It never depends on a request, a person or health data. */
export const PUSH_TEXT = {
  title: 'Synthetic probe test',
  body: 'This is a synthetic notification test.',
} as const;
export const PUSH_PAYLOAD = JSON.stringify(PUSH_TEXT);

export const RECORD_SIZE = 4096;
export const VAPID_LIFETIME_SECONDS = 12 * 60 * 60;
export const PUSH_TTL_SECONDS = 60;

/** Push services a subscription endpoint may point at. Anything else is refused (no open proxy). */
const PUSH_HOST_SUFFIXES = [
  '.push.apple.com',
  '.notify.windows.com',
  '.push.services.mozilla.com',
] as const;
const PUSH_HOSTS = ['web.push.apple.com', 'fcm.googleapis.com'] as const;

export function isAllowedPushHost(host: string): boolean {
  const lower = host.toLowerCase();
  return (
    (PUSH_HOSTS as readonly string[]).includes(lower) ||
    PUSH_HOST_SUFFIXES.some((suffix) => lower.endsWith(suffix) && lower.length > suffix.length)
  );
}

export interface PushSubscriptionInput {
  endpoint: URL;
  p256dh: Bytes;
  auth: Bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates a PushSubscription.toJSON() shape. Returns null for anything malformed or not allowlisted. */
export function parseSubscription(value: unknown): PushSubscriptionInput | null {
  if (!isRecord(value) || typeof value.endpoint !== 'string' || value.endpoint.length > 1024) {
    return null;
  }
  let endpoint: URL;
  try {
    endpoint = new URL(value.endpoint);
  } catch {
    return null;
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.port !== '' ||
    !isAllowedPushHost(endpoint.hostname)
  ) {
    return null;
  }
  const keys = value.keys;
  if (!isRecord(keys) || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    return null;
  }
  const p256dh = fromBase64Url(keys.p256dh);
  const auth = fromBase64Url(keys.auth);
  if (p256dh === null || p256dh.length !== 65 || p256dh[0] !== 4) return null;
  if (auth === null || auth.length !== 16) return null;
  return { endpoint, p256dh, auth };
}

export interface VapidKeys {
  privateKey: CryptoKey;
  publicRaw: Bytes;
}

/** Imports the VAPID key pair from the Worker secret (a P-256 private JWK as JSON text). */
export async function importVapidKeys(jwkJson: string): Promise<VapidKeys | null> {
  try {
    const jwk = JSON.parse(jwkJson) as JsonWebKey;
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.x || !jwk.y) return null;
    const x = fromBase64Url(jwk.x);
    const y = fromBase64Url(jwk.y);
    if (x === null || y === null || x.length !== 32 || y.length !== 32) return null;
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    return { privateKey, publicRaw: concat(new Uint8Array([4]), x, y) };
  } catch {
    return null;
  }
}

export async function vapidJwt(
  privateKey: CryptoKey,
  audience: string,
  subject: string,
  expiresAt: number,
): Promise<string> {
  const header = toBase64Url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = toBase64Url(utf8(JSON.stringify({ aud: audience, exp: expiresAt, sub: subject })));
  const signingInput = `${header}.${claims}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, utf8(signingInput)),
  );
  return `${signingInput}.${toBase64Url(signature)}`;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8),
  );
}

export interface SenderKeys {
  privateKey: CryptoKey;
  publicRaw: Bytes;
}

export interface EncryptOptions {
  /** Fixed salt and sender key pair, for the RFC 8291 test vector only. */
  salt?: Bytes;
  sender?: SenderKeys;
}

/** RFC 8291 section 3.4 + RFC 8188: one aes128gcm record with the last-record delimiter 0x02. */
export async function encryptPayload(
  plaintext: Bytes,
  uaPublic: Bytes,
  authSecret: Bytes,
  options: EncryptOptions = {},
): Promise<Bytes> {
  if (plaintext.length + 1 + 16 > RECORD_SIZE) throw new Error('payload too large');
  let sender = options.sender;
  if (!sender) {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    sender = {
      privateKey: pair.privateKey,
      publicRaw: new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)),
    };
  }
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, sender.privateKey, 256),
  );
  const keyInfo = concat(utf8('WebPush: info\0'), uaPublic, sender.publicRaw);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      aesKey,
      concat(plaintext, new Uint8Array([2])),
    ),
  );
  const header = new Uint8Array(16 + 4 + 1);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = sender.publicRaw.length;
  return concat(header, sender.publicRaw, record);
}

export interface PushRequest {
  url: string;
  headers: Record<string, string>;
  body: Bytes;
}

/** Builds exactly one Web Push request carrying the fixed generic text. */
export async function buildPushRequest(
  subscription: PushSubscriptionInput,
  vapid: VapidKeys,
  subject: string,
  nowSeconds: number,
): Promise<PushRequest> {
  const jwt = await vapidJwt(
    vapid.privateKey,
    subscription.endpoint.origin,
    subject,
    nowSeconds + VAPID_LIFETIME_SECONDS,
  );
  const body = await encryptPayload(utf8(PUSH_PAYLOAD), subscription.p256dh, subscription.auth);
  return {
    url: subscription.endpoint.href,
    headers: {
      authorization: `vapid t=${jwt}, k=${toBase64Url(vapid.publicRaw)}`,
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(PUSH_TTL_SECONDS),
      urgency: 'normal',
    },
    body,
  };
}
