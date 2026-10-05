// Published primitive KAT, not a CryptoApi wrapper test; wrapper AAD/IV behavior is tested separately.
// NIST CAVP AES-GCM vector source: https://csrc.nist.gov/projects/cryptographic-algorithm-validation-program/cavp-testing-block-cipher-modes
import { describe, expect, it } from 'vitest';
import { bytesToHex, hexToBytes } from '../../src/crypto/primitives/encoding.ts';

describe('published AES-GCM primitive vector', () => {
  it('matches the AES-256-GCM zero-key, 96-bit-IV NIST known-answer vector', async () => {
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      hexToBytes('00'.repeat(32)),
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );
    const result = await globalThis.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: hexToBytes('00'.repeat(12)),
        tagLength: 128,
      },
      key,
      hexToBytes('00'.repeat(16)),
    );
    expect(bytesToHex(new Uint8Array(result))).toBe(
      'cea7403d4d606b6e074ec5d3baf39d18d0d1c8a799996bf0265b98b5d48ab919',
    );
  });
});
