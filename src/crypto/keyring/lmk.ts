import type { Bytes } from '../../contracts/brand.ts';
import type { CryptoError, CryptoResult, WrappedKey } from '../../contracts/crypto.ts';
import { decodeBase64Url, encodeBase64Url } from '../primitives/encoding.ts';
import { getWebCrypto, randomBytes } from '../primitives/webcrypto.ts';
import { AES_GCM_IV_BYTES, AES_GCM_TAG_BITS } from '../envelope/aes-gcm.ts';

export const LOCAL_MASTER_KEY_BYTES = 32;

/** Create 256 bits of LMK material; callers keep it in memory and persist only its wrapped form. */
export function createLocalMasterKey(): Bytes {
  return randomBytes(LOCAL_MASTER_KEY_BYTES);
}

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

/** Wrap LMK bytes under the KEK derived from one approved unlock method. */
export async function wrapLocalMasterKey(lmk: Bytes, kek: CryptoKey): Promise<WrappedKey> {
  if (lmk.length !== LOCAL_MASTER_KEY_BYTES) throw new TypeError('LMK must be 32 bytes');
  assertKek(kek, 'encrypt');
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const ciphertext = await getWebCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: AES_GCM_TAG_BITS },
    kek,
    lmk,
  );
  return { iv: encodeBase64Url(iv), ct: encodeBase64Url(new Uint8Array(ciphertext)) };
}

/**
 * Unwrap the complete LMK or return WrongSecret. Web Crypto releases no partial plaintext on GCM failure.
 */
export async function unwrapLocalMasterKey(
  wrapped: WrappedKey,
  kek: CryptoKey,
): Promise<CryptoResult<Bytes>> {
  const wrongSecret: CryptoError = { kind: 'wrong_secret' };
  try {
    assertKek(kek, 'decrypt');
    const iv = decodeBase64Url(wrapped.iv);
    const ciphertext = decodeBase64Url(wrapped.ct);
    if (iv.length !== AES_GCM_IV_BYTES || ciphertext.length < AES_GCM_TAG_BITS / 8) {
      return { ok: false, error: wrongSecret };
    }
    const lmk = new Uint8Array(
      await getWebCrypto().subtle.decrypt(
        { name: 'AES-GCM', iv, tagLength: AES_GCM_TAG_BITS },
        kek,
        ciphertext,
      ),
    );
    if (lmk.length !== LOCAL_MASTER_KEY_BYTES) return { ok: false, error: wrongSecret };
    return { ok: true, value: lmk };
  } catch {
    return { ok: false, error: wrongSecret };
  }
}
