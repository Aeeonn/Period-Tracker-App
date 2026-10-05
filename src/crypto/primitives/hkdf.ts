import type { Bytes } from '../../contracts/brand.ts';
import { getWebCrypto } from './webcrypto.ts';

const HASH_BYTES = 32;
const MAX_HKDF_BYTES = 255 * HASH_BYTES;

/** RFC 5869 HKDF-SHA-256 expansion, using the platform Web Crypto primitive. */
export async function hkdfSha256(
  ikm: Bytes,
  salt: Bytes,
  info: Bytes,
  length: number,
): Promise<Bytes> {
  if (ikm.length === 0) throw new TypeError('HKDF input key material must not be empty');
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_HKDF_BYTES) {
    throw new RangeError('HKDF output length must be between 1 and 8160 bytes');
  }
  const crypto = getWebCrypto();
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export async function deriveHkdfAes256(ikm: Bytes, salt: Bytes, info: Bytes): Promise<CryptoKey> {
  if (ikm.length === 0) throw new TypeError('HKDF input key material must not be empty');
  const crypto = getWebCrypto();
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
