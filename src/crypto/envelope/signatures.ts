import type { Base64Url, Bytes } from '../../contracts/brand.ts';
import { decodeBase64Url, encodeBase64Url, encodeTuple } from '../primitives/encoding.ts';
import { getWebCrypto } from '../primitives/webcrypto.ts';

function assertSigningKey(
  key: CryptoKey,
  type: 'private' | 'public',
  usage: 'sign' | 'verify',
): void {
  if (
    key.type !== type ||
    key.algorithm.name !== 'ECDSA' ||
    (key.algorithm as EcKeyAlgorithm).namedCurve !== 'P-256' ||
    !key.usages.includes(usage)
  ) {
    throw new TypeError(`Expected an ECDSA P-256 ${type} key with ${usage} usage`);
  }
}

export async function sign(privateKey: CryptoKey, data: Bytes): Promise<Base64Url> {
  assertSigningKey(privateKey, 'private', 'sign');
  const signature = await getWebCrypto().subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    data,
  );
  return encodeBase64Url(new Uint8Array(signature));
}

export async function verify(
  publicKey: CryptoKey,
  data: Bytes,
  signature: Base64Url,
): Promise<boolean> {
  try {
    assertSigningKey(publicKey, 'public', 'verify');
    const decoded = decodeBase64Url(signature);
    if (decoded.length !== 64) return false;
    return getWebCrypto().subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      decoded,
      data,
    );
  } catch {
    return false;
  }
}

export function encodeSignedTuple(fields: readonly (string | number)[]): Bytes {
  return encodeTuple(fields);
}
