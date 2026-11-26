/**
 * Sharing keys and snapshot encryption.
 *
 * - coupleId: random 16 bytes, names the couple on the relay.
 * - readKey: random 32-byte AES-256-GCM key; both phones hold it. The relay never sees it.
 * - writeKey: random 32 bytes, only on her phone; the relay stores its SHA-256 hash and
 *   only accepts uploads and deletes from whoever presents it.
 *
 * The pairing code carries coupleId and readKey only, so his phone can read but never write.
 */

type Bytes = Uint8Array<ArrayBuffer>;

const BASE64URL = /^[A-Za-z0-9_-]*$/;

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function fromBase64Url(text: string): Bytes {
  if (!BASE64URL.test(text) || text.length % 4 === 1) throw new TypeError('Invalid base64url');
  const standard = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(standard + '='.repeat((4 - (standard.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (toBase64Url(bytes) !== text) throw new TypeError('Non-canonical base64url');
  return bytes;
}

function random(length: number): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(length)));
}

export interface ShareKeys {
  readonly coupleId: string;
  readonly readKey: string;
  readonly writeKey: string;
}

export function newShareKeys(): ShareKeys {
  return { coupleId: random(16), readKey: random(32), writeKey: random(32) };
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const CODE_PREFIX = 'flo1';

export function pairingCode(keys: { coupleId: string; readKey: string }): string {
  return `${CODE_PREFIX}.${keys.coupleId}.${keys.readKey}`;
}

/** Parse a pairing code; whitespace (from copy and paste) is ignored. Returns null if invalid. */
export function parsePairingCode(code: string): { coupleId: string; readKey: string } | null {
  const parts = code.replace(/\s+/g, '').split('.');
  if (parts.length !== 3 || parts[0] !== CODE_PREFIX) return null;
  const [, coupleId = '', readKey = ''] = parts;
  try {
    if (fromBase64Url(coupleId).length !== 16 || fromBase64Url(readKey).length !== 32) return null;
  } catch {
    return null;
  }
  return { coupleId, readKey };
}

export interface SealedBox {
  readonly iv: string;
  readonly ct: string;
}

function aad(coupleId: string): Bytes {
  return new TextEncoder().encode(`flo-lite/snapshot/v1|${coupleId}`);
}

function importKey(readKey: string, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromBase64Url(readKey), 'AES-GCM', false, [usage]);
}

export async function seal(
  keys: { coupleId: string; readKey: string },
  value: unknown,
): Promise<SealedBox> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(keys.coupleId) },
    await importKey(keys.readKey, 'encrypt'),
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return { iv: toBase64Url(iv), ct: toBase64Url(new Uint8Array(ct)) };
}

/** Decrypt a sealed box; returns null if it was tampered with or uses another key. */
export async function open(
  keys: { coupleId: string; readKey: string },
  box: SealedBox,
): Promise<unknown> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(box.iv), additionalData: aad(keys.coupleId) },
      await importKey(keys.readKey, 'decrypt'),
      fromBase64Url(box.ct),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as unknown;
  } catch {
    return null;
  }
}
