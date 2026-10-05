export function getWebCrypto(): Crypto {
  const provider = globalThis.crypto;
  if (!provider?.subtle || typeof provider.getRandomValues !== 'function') {
    throw new DOMException('Web Crypto is unavailable', 'NotSupportedError');
  }
  return provider;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  if (!Number.isSafeInteger(length) || length < 0 || length > 65_536) {
    throw new RangeError('Random byte length must be between 0 and 65536');
  }
  const bytes = new Uint8Array(length);
  getWebCrypto().getRandomValues(bytes);
  return bytes;
}
