// Public KAT provenance: https://www.rfc-editor.org/rfc/rfc5869 Appendix A. The SHA-256 PBKDF2 KAT was cross-checked independently.
import { describe, expect, it } from 'vitest';
import { bytesToHex, hexToBytes } from '../../src/crypto/primitives/encoding.ts';
import { hkdfSha256 } from '../../src/crypto/primitives/hkdf.ts';
import { pbkdf2Sha256 } from '../../src/crypto/primitives/kdf.ts';

const HKDF_RFC5869_CASES = [
  {
    name: 'RFC 5869 Appendix A.1',
    ikm: '0b'.repeat(22),
    salt: '000102030405060708090a0b0c',
    info: 'f0f1f2f3f4f5f6f7f8f9',
    length: 42,
    okm: '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
  },
  {
    name: 'RFC 5869 Appendix A.2',
    ikm: Array.from({ length: 80 }, (_, index) => index.toString(16).padStart(2, '0')).join(''),
    salt: Array.from({ length: 80 }, (_, index) => (0x60 + index).toString(16)).join(''),
    info: Array.from({ length: 80 }, (_, index) => (0xb0 + index).toString(16)).join(''),
    length: 82,
    okm: 'b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71cc30c58179ec3e87c14c01d5c1f3434f1d87',
  },
  {
    name: 'RFC 5869 Appendix A.3',
    ikm: '0b'.repeat(22),
    salt: '',
    info: '',
    length: 42,
    okm: '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8',
  },
] as const;

describe('published KDF known-answer vectors', () => {
  for (const vector of HKDF_RFC5869_CASES) {
    it(`matches ${vector.name} independently published output`, async () => {
      const actual = await hkdfSha256(
        hexToBytes(vector.ikm),
        hexToBytes(vector.salt),
        hexToBytes(vector.info),
        vector.length,
      );
      expect(bytesToHex(actual)).toBe(vector.okm);
    });
  }

  it('matches an independently cross-checked PBKDF2-HMAC-SHA-256 test-strategy vector', async () => {
    // Test-strategy §1 requests an RFC 6070-style SHA-256 KAT. RFC 6070 itself specifies SHA-1;
    // this SHA-256 expected value was independently cross-checked with Python hashlib, not attributed to RFC 6070.
    const actual = await pbkdf2Sha256(
      new TextEncoder().encode('password'),
      new TextEncoder().encode('salt'),
      1,
      32,
    );
    expect(bytesToHex(actual)).toBe(
      '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b',
    );
  });
});
