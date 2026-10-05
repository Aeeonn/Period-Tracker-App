import type { Bytes } from '../../contracts/brand.ts';
import type { KekSource } from '../../contracts/crypto.ts';
import { utf8 } from './encoding.ts';
import { deriveHkdfAes256 } from './hkdf.ts';
import { getWebCrypto } from './webcrypto.ts';

export const PBKDF2_ITERATIONS = 600_000;
export const PBKDF2_SALT_BYTES = 16;
export const HKDF_SALT_BYTES = 16;

const RECOVERY_KEK_INFO = utf8('lmk/recovery/v1');
const PASSKEY_PRF_KEK_INFO = utf8('lmk/passkey-prf/v1');

export function assertSalt16(salt: Bytes, label = 'salt'): void {
  if (salt.length !== HKDF_SALT_BYTES) throw new TypeError(`${label} must be 16 bytes`);
}

/** PBKDF2-HMAC-SHA-256 helper. The CryptoApi applies the approved 600k policy. */
export async function pbkdf2Sha256(
  password: Bytes,
  salt: Bytes,
  iterations: number,
  length: number,
): Promise<Bytes> {
  if (!Number.isSafeInteger(iterations) || iterations < 1) {
    throw new RangeError('PBKDF2 iterations must be a positive integer');
  }
  if (!Number.isSafeInteger(length) || length < 1 || length > Math.floor(0xffff_ffff / 8)) {
    throw new RangeError('PBKDF2 output length must fit Web Crypto deriveBits length');
  }
  const crypto = getWebCrypto();
  const key = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export async function deriveKek(source: KekSource): Promise<CryptoKey> {
  if (source.kind === 'passphrase') {
    if (source.params.iterations !== PBKDF2_ITERATIONS) {
      throw new RangeError(`PBKDF2 iterations must equal ${PBKDF2_ITERATIONS}`);
    }
    if (source.params.salt.length !== PBKDF2_SALT_BYTES) {
      throw new TypeError('PBKDF2 salt must be 16 bytes');
    }
    if (source.passphrase.length === 0) throw new TypeError('Passphrase must not be empty');
    const crypto = getWebCrypto();
    const material = await crypto.subtle.importKey(
      'raw',
      utf8(source.passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: source.params.salt,
        iterations: PBKDF2_ITERATIONS,
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  assertSalt16(source.salt, `${source.kind} salt`);
  if (source.kind === 'recovery_code') {
    if (source.code.length === 0) throw new TypeError('Recovery code must not be empty');
    return deriveHkdfAes256(utf8(source.code), source.salt, RECOVERY_KEK_INFO);
  }

  if (source.prfOutput.length !== 32) throw new TypeError('Passkey PRF output must be 32 bytes');
  return deriveHkdfAes256(source.prfOutput, source.salt, PASSKEY_PRF_KEK_INFO);
}
