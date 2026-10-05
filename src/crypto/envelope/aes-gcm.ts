import type { Bytes } from '../../contracts/brand.ts';
import type { EnvelopeAad, SealedBox } from '../../contracts/crypto.ts';
import { decodeBase64Url, encodeAad, encodeBase64Url } from '../primitives/encoding.ts';
import { getWebCrypto, randomBytes } from '../primitives/webcrypto.ts';

export const AES_GCM_IV_BYTES = 12;
export const AES_GCM_TAG_BITS = 128;

function assertAes256Key(key: CryptoKey, usage: 'encrypt' | 'decrypt'): void {
  const algorithm = key.algorithm as AesKeyAlgorithm;
  if (
    key.type !== 'secret' ||
    algorithm.name !== 'AES-GCM' ||
    algorithm.length !== 256 ||
    !key.usages.includes(usage)
  ) {
    throw new TypeError(`Expected an AES-256-GCM key with ${usage} usage`);
  }
}

function validateAad(aad: EnvelopeAad): Bytes {
  if (
    !aad.recordId ||
    !aad.type ||
    !Number.isSafeInteger(aad.schemaVersion) ||
    aad.schemaVersion < 0 ||
    !Number.isSafeInteger(aad.epoch) ||
    aad.epoch < 0
  ) {
    throw new TypeError('Invalid AES-GCM envelope AAD');
  }
  return encodeAad(aad.recordId, aad.type, aad.schemaVersion, aad.epoch);
}

export async function seal(key: CryptoKey, plaintext: Bytes, aad: EnvelopeAad): Promise<SealedBox> {
  assertAes256Key(key, 'encrypt');
  const additionalData = validateAad(aad);
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const ciphertext = await getWebCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData, tagLength: AES_GCM_TAG_BITS },
    key,
    plaintext,
  );
  return { iv: encodeBase64Url(iv), ct: encodeBase64Url(new Uint8Array(ciphertext)) };
}

export async function open(
  key: CryptoKey,
  box: SealedBox,
  aad: EnvelopeAad,
): Promise<Bytes | null> {
  try {
    assertAes256Key(key, 'decrypt');
    const iv = decodeBase64Url(box.iv);
    const ciphertext = decodeBase64Url(box.ct);
    if (iv.length !== AES_GCM_IV_BYTES || ciphertext.length < AES_GCM_TAG_BITS / 8) return null;
    const additionalData = validateAad(aad);
    const plaintext = await getWebCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData, tagLength: AES_GCM_TAG_BITS },
      key,
      ciphertext,
    );
    return new Uint8Array(plaintext);
  } catch {
    return null;
  }
}
