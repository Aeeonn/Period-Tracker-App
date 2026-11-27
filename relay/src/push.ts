/**
 * Web Push with Web Crypto only: RFC 8291 payload encryption (aes128gcm) and
 * RFC 8292 VAPID authentication. Payloads are tiny signals such as
 * {"k":"tick"}; the phone writes the notification text from its own data.
 */

type Bytes = Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(text: string): Bytes {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** The private VAPID key as stored in the relay secret (a P-256 JWK). */
export interface VapidJwk {
  readonly kty: 'EC';
  readonly crv: 'P-256';
  readonly x: string;
  readonly y: string;
  readonly d: string;
}

export function parseVapidJwk(text: string | undefined): VapidJwk | null {
  if (text === undefined) return null;
  try {
    const jwk = JSON.parse(text) as Partial<VapidJwk>;
    return jwk.kty === 'EC' &&
      jwk.crv === 'P-256' &&
      typeof jwk.x === 'string' &&
      typeof jwk.y === 'string' &&
      typeof jwk.d === 'string'
      ? (jwk as VapidJwk)
      : null;
  } catch {
    return null;
  }
}

/** The uncompressed public key (65 bytes, base64url) the browser subscribes with. */
export function vapidPublicKey(jwk: VapidJwk): string {
  return b64url(concat(new Uint8Array([4]), fromB64url(jwk.x), fromB64url(jwk.y)));
}

/** `Authorization` header value for a push to `endpoint` (RFC 8292). */
export async function vapidAuthorization(
  endpoint: string,
  jwk: VapidJwk,
  subject: string,
  nowMs: number,
): Promise<string> {
  const header = b64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(nowMs / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  // Web Crypto ECDSA signatures are already the raw r || s form JWS needs.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(`${header}.${claims}`),
  );
  return `vapid t=${header}.${claims}.${b64url(new Uint8Array(signature))}, k=${vapidPublicKey(jwk)}`;
}

/**
 * Encrypt `payload` for a subscription (RFC 8291, single aes128gcm record).
 * `salt` and `serverKeys` are only passed by tests.
 */
export async function encryptPayload(
  payload: Uint8Array,
  p256dh: Bytes,
  auth: Bytes,
  options: { salt?: Bytes; serverKeys?: CryptoKeyPair } = {},
): Promise<Bytes> {
  const serverKeys =
    options.serverKeys ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair);
  const serverPublic = new Uint8Array(
    (await crypto.subtle.exportKey('raw', serverKeys.publicKey)) as ArrayBuffer,
  );
  const userKey = await crypto.subtle.importKey(
    'raw',
    p256dh,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: userKey }, serverKeys.privateKey, 256),
  );
  const ikm = await hkdf(
    auth,
    shared,
    concat(encoder.encode('WebPush: info\0'), p256dh, serverPublic),
    32,
  );
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // A single record: payload followed by the 0x02 last-record delimiter.
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      key,
      concat(payload, new Uint8Array([2])),
    ),
  );
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = serverPublic.byteLength;
  return concat(header, serverPublic, ciphertext);
}

export interface PushTarget {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

/** Send one push and return the push service's HTTP status (0 on a network error). */
export async function sendPush(
  target: PushTarget,
  message: Record<string, string>,
  vapid: { readonly jwk: VapidJwk; readonly subject: string },
  options: { readonly ttl: number; readonly nowMs: number; readonly fetcher: typeof fetch },
): Promise<number> {
  const body = await encryptPayload(
    encoder.encode(JSON.stringify(message)),
    fromB64url(target.p256dh),
    fromB64url(target.auth),
  );
  try {
    const response = await options.fetcher(target.endpoint, {
      method: 'POST',
      headers: {
        authorization: await vapidAuthorization(
          target.endpoint,
          vapid.jwk,
          vapid.subject,
          options.nowMs,
        ),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: String(options.ttl),
        urgency: 'normal',
      },
      body,
    });
    return response.status;
  } catch {
    return 0;
  }
}
