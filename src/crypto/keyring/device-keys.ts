import { getWebCrypto } from '../primitives/webcrypto.ts';

/** Device signing private keys stay non-extractable; their public keys can be shared. */
export function generateDeviceSigningKeyPair(): Promise<CryptoKeyPair> {
  return getWebCrypto().subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ]);
}

/** Device agreement private keys stay non-extractable; their public keys can be shared. */
export function generateDeviceAgreementKeyPair(): Promise<CryptoKeyPair> {
  return getWebCrypto().subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
    'deriveBits',
  ]);
}

/** Generate an opaque-id HMAC key, non-extractable by default. */
export function generateIndexKey(extractable = false): Promise<CryptoKey> {
  return getWebCrypto().subtle.generateKey(
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    extractable,
    ['sign'],
  );
}

/** Generate an AES-256-GCM key; extractability is explicit for wrapping workflows. */
export function generateAes256Key(extractable = false): Promise<CryptoKey> {
  return getWebCrypto().subtle.generateKey({ name: 'AES-GCM', length: 256 }, extractable, [
    'encrypt',
    'decrypt',
  ]);
}
