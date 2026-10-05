import type { Base64Url, Bytes } from '../../contracts/brand.ts';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

/** Encode bytes as the project's canonical, unpadded base64url form. */
export function encodeBase64Url(bytes: Uint8Array): Base64Url {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return encoded as Base64Url;
}

/** Decode only canonical, unpadded base64url; reject alternate encodings. */
export function decodeBase64Url(encoded: Base64Url | string): Bytes {
  if (!BASE64URL_PATTERN.test(encoded) || encoded.length % 4 === 1) {
    throw new TypeError('Invalid base64url');
  }
  const standard = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new TypeError('Invalid base64url');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (encodeBase64Url(bytes) !== encoded) throw new TypeError('Non-canonical base64url');
  return bytes;
}

export function utf8(value: string): Bytes {
  return new TextEncoder().encode(value);
}

export function concatBytes(...parts: readonly Uint8Array[]): Bytes {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function hexToBytes(hex: string): Bytes {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) {
    throw new TypeError('Invalid hexadecimal input');
  }
  const result = new Uint8Array(hex.length / 2);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return result;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Length-prefixed UTF-8 tuple for unambiguous signature inputs. */
export function encodeTuple(fields: readonly (string | number)[]): Bytes {
  const parts = fields.map((field) => utf8(String(field)));
  const totalLength = parts.reduce((total, part) => total + 4 + part.length, 0);
  const result = new Uint8Array(totalLength);
  const view = new DataView(result.buffer);
  let offset = 0;
  for (const part of parts) {
    view.setUint32(offset, part.length, false);
    offset += 4;
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function encodeAad(
  recordId: string,
  type: string,
  schemaVersion: number,
  epoch: number,
): Bytes {
  return encodeTuple([recordId, type, schemaVersion, epoch]);
}
