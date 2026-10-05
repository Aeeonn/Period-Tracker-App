import type { Bytes } from '../../contracts/brand.ts';
import type { KeyPurpose, WrappedKey } from '../../contracts/crypto.ts';
import { decodeBase64Url, encodeBase64Url } from '../primitives/encoding.ts';
import { getWebCrypto, randomBytes } from '../primitives/webcrypto.ts';
import { AES_GCM_IV_BYTES, AES_GCM_TAG_BITS } from './aes-gcm.ts';

const PURPOSE_TAGS: Record<KeyPurpose, number> = {
  aes_gcm: 1,
  hmac: 2,
  ecdsa_sign: 3,
};

function assertKek(kek: CryptoKey, usage: 'encrypt' | 'decrypt'): void {
  const algorithm = kek.algorithm as AesKeyAlgorithm;
  if (
    kek.type !== 'secret' ||
    algorithm.name !== 'AES-GCM' ||
    algorithm.length !== 256 ||
    !kek.usages.includes(usage)
  ) {
    throw new TypeError(`Expected an AES-256-GCM KEK with ${usage} usage`);
  }
}

function purposeOfKey(key: CryptoKey): KeyPurpose {
  if (key.type === 'secret') {
    const algorithm = key.algorithm as AesKeyAlgorithm | HmacKeyAlgorithm;
    if (algorithm.name === 'AES-GCM' && algorithm.length === 256) return 'aes_gcm';
    if (
      algorithm.name === 'HMAC' &&
      (algorithm as HmacKeyAlgorithm).hash.name === 'SHA-256' &&
      (algorithm as HmacKeyAlgorithm).length === 256
    ) {
      return 'hmac';
    }
  }
  if (
    key.type === 'private' &&
    key.algorithm.name === 'ECDSA' &&
    (key.algorithm as EcKeyAlgorithm).namedCurve === 'P-256'
  ) {
    return 'ecdsa_sign';
  }
  throw new TypeError(
    'Only AES-256-GCM, HMAC-SHA-256, and ECDSA P-256 private keys can be wrapped',
  );
}

async function exportKeyBytes(key: CryptoKey, purpose: KeyPurpose): Promise<Bytes> {
  if (!key.extractable) throw new TypeError('Key must be extractable to be wrapped by Web Crypto');
  const format = purpose === 'ecdsa_sign' ? 'pkcs8' : 'raw';
  return new Uint8Array(await getWebCrypto().subtle.exportKey(format, key));
}

async function importKeyBytes(bytes: Bytes, purpose: KeyPurpose): Promise<CryptoKey> {
  const crypto = getWebCrypto();
  if (purpose === 'aes_gcm') {
    // LMK-wrapped data keys can need another ECDH-ES or LMK wrap; device private keys remain non-extractable.
    return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);
  }
  if (purpose === 'hmac') {
    return crypto.subtle.importKey(
      'raw',
      bytes,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign', 'verify'],
    );
  }
  // Architecture §4.1 keeps owner identity private keys extractable while LMK-wrapped.
  return crypto.subtle.importKey('pkcs8', bytes, { name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ]);
}

export async function wrapKey(key: CryptoKey, kek: CryptoKey): Promise<WrappedKey> {
  assertKek(kek, 'encrypt');
  const purpose = purposeOfKey(key);
  const material = await exportKeyBytes(key, purpose);
  const plaintext = new Uint8Array(material.length + 1);
  plaintext[0] = PURPOSE_TAGS[purpose];
  plaintext.set(material, 1);
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const ciphertext = await getWebCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: AES_GCM_TAG_BITS },
    kek,
    plaintext,
  );
  return { iv: encodeBase64Url(iv), ct: encodeBase64Url(new Uint8Array(ciphertext)) };
}

export async function unwrapKey(
  wrapped: WrappedKey,
  kek: CryptoKey,
  purpose: KeyPurpose,
): Promise<{ readonly ok: true; readonly value: CryptoKey } | { readonly ok: false }> {
  try {
    assertKek(kek, 'decrypt');
    const iv = decodeBase64Url(wrapped.iv);
    const ciphertext = decodeBase64Url(wrapped.ct);
    if (iv.length !== AES_GCM_IV_BYTES || ciphertext.length < AES_GCM_TAG_BITS / 8 + 1) {
      return { ok: false };
    }
    const plaintext = new Uint8Array(
      await getWebCrypto().subtle.decrypt(
        { name: 'AES-GCM', iv, tagLength: AES_GCM_TAG_BITS },
        kek,
        ciphertext,
      ),
    );
    if (plaintext[0] !== PURPOSE_TAGS[purpose]) return { ok: false };
    return { ok: true, value: await importKeyBytes(plaintext.subarray(1), purpose) };
  } catch {
    return { ok: false };
  }
}
