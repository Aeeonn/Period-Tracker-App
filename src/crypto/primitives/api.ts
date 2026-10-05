import type { LogicalId, OpaqueId } from '../../contracts/brand.ts';
import type { CryptoApi, CryptoResult, KeyPurpose } from '../../contracts/crypto.ts';
import { encodeBase64Url, utf8 } from './encoding.ts';
import { deriveKek } from './kdf.ts';
import { getWebCrypto } from './webcrypto.ts';
import { ecdhUnwrap, ecdhWrap } from '../envelope/ecdh-wrap.ts';
import { open, seal } from '../envelope/aes-gcm.ts';
import { unwrapKey, wrapKey } from '../envelope/key-wrapping.ts';
import { sign, verify } from '../envelope/signatures.ts';

export function createCryptoApi(): CryptoApi {
  return {
    deriveKek,
    wrapKey,
    async unwrapKey(wrapped, kek, purpose: KeyPurpose): Promise<CryptoResult<CryptoKey>> {
      const result = await unwrapKey(wrapped, kek, purpose);
      if (result.ok) return result;
      return { ok: false, error: { kind: 'wrong_secret' } };
    },
    async seal(key, plaintext, aad) {
      return seal(key, plaintext, aad);
    },
    async open(key, box, aad) {
      const plaintext = await open(key, box, aad);
      return plaintext === null
        ? { ok: false, error: { kind: 'integrity' } }
        : { ok: true, value: plaintext };
    },
    sign,
    verify,
    ecdhWrap,
    ecdhUnwrap,
    async opaqueId(indexKey, logicalId: LogicalId): Promise<OpaqueId> {
      const algorithm = indexKey.algorithm as HmacKeyAlgorithm;
      if (
        indexKey.type !== 'secret' ||
        algorithm.name !== 'HMAC' ||
        algorithm.hash.name !== 'SHA-256' ||
        !indexKey.usages.includes('sign')
      ) {
        throw new TypeError('Expected an HMAC-SHA-256 key with sign usage');
      }
      const mac = new Uint8Array(
        await getWebCrypto().subtle.sign('HMAC', indexKey, utf8(logicalId)),
      );
      return encodeBase64Url(mac.subarray(0, 16)) as unknown as OpaqueId;
    },
  };
}
