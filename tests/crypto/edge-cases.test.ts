// synthetic: true - every key, identity, message, and payload is test-only.
import { describe, expect, it, vi } from 'vitest';
import type { Base64Url, DeviceId, LogicalId, OpaqueId } from '../../src/contracts/brand.ts';
import type { EnvelopeAad, WrapContext } from '../../src/contracts/crypto.ts';
import type { ShareCategory } from '../../src/contracts/enums.ts';
import { open, seal } from '../../src/crypto/envelope/aes-gcm.ts';
import { ecdhUnwrap, ecdhWrap } from '../../src/crypto/envelope/ecdh-wrap.ts';
import { unwrapKey, wrapKey } from '../../src/crypto/envelope/key-wrapping.ts';
import { sign, verify } from '../../src/crypto/envelope/signatures.ts';
import {
  generateAes256Key,
  generateDeviceAgreementKeyPair,
  generateDeviceSigningKeyPair,
} from '../../src/crypto/keyring/device-keys.ts';
import { unwrapLocalMasterKey, wrapLocalMasterKey } from '../../src/crypto/keyring/lmk.ts';
import { createCryptoApi } from '../../src/crypto/primitives/api.ts';
import {
  bytesToHex,
  concatBytes,
  decodeBase64Url,
  encodeAad,
  encodeBase64Url,
  encodeTuple,
  hexToBytes,
  utf8,
} from '../../src/crypto/primitives/encoding.ts';
import { deriveHkdfAes256, hkdfSha256 } from '../../src/crypto/primitives/hkdf.ts';
import {
  assertSalt16,
  deriveKek,
  PBKDF2_ITERATIONS,
  pbkdf2Sha256,
} from '../../src/crypto/primitives/kdf.ts';
import { getWebCrypto, randomBytes } from '../../src/crypto/primitives/webcrypto.ts';

const aad: EnvelopeAad = {
  recordId: 'synthetic-envelope-id' as OpaqueId,
  type: 'day',
  schemaVersion: 1,
  epoch: 0,
};

async function importAesKey(usages: KeyUsage[]): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    'raw',
    new Uint8Array(32).fill(7),
    'AES-GCM',
    false,
    usages,
  );
}

describe('crypto encoding validation', () => {
  it('round-trips canonical base64url in empty, ordinary, and multi-chunk cases', () => {
    expect(encodeBase64Url(new Uint8Array())).toBe('');
    expect(decodeBase64Url('')).toEqual(new Uint8Array());
    const source = Uint8Array.from({ length: 0x8001 }, (_, index) => index % 251);
    expect(decodeBase64Url(encodeBase64Url(source))).toEqual(source);
    expect(() => decodeBase64Url('A')).toThrow('Invalid base64url');
    expect(() => decodeBase64Url('AA=')).toThrow('Invalid base64url');
    expect(() => decodeBase64Url('AB')).toThrow('Non-canonical base64url');
    expect(() => decodeBase64Url('not*base64')).toThrow('Invalid base64url');
  });

  it('validates hex, concatenates bytes, and length-prefixes tuple fields', () => {
    expect(hexToBytes('00aF')).toEqual(new Uint8Array([0, 175]));
    expect(bytesToHex(hexToBytes('00aF'))).toBe('00af');
    expect(() => hexToBytes('0')).toThrow('Invalid hexadecimal input');
    expect(() => hexToBytes('xz')).toThrow('Invalid hexadecimal input');
    expect(concatBytes(new Uint8Array([1, 2]), new Uint8Array(), new Uint8Array([3]))).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    const tuple = encodeTuple(['ab', 7]);
    const view = new DataView(tuple.buffer);
    expect(view.getUint32(0, false)).toBe(2);
    expect(new TextDecoder().decode(tuple.subarray(4, 6))).toBe('ab');
    expect(view.getUint32(6, false)).toBe(1);
    expect(new TextDecoder().decode(tuple.subarray(10))).toBe('7');
    expect(encodeAad('synthetic-id', 'day', 1, 0)).toEqual(
      encodeTuple(['synthetic-id', 'day', 1, 0]),
    );
  });
});

describe('crypto primitive input bounds', () => {
  it('rejects invalid random, salt, HKDF, and PBKDF2 lengths', async () => {
    expect(() => randomBytes(-1)).toThrow(RangeError);
    expect(() => randomBytes(1.5)).toThrow(RangeError);
    expect(() => randomBytes(65_537)).toThrow(RangeError);
    expect(randomBytes(0)).toHaveLength(0);
    expect(() => assertSalt16(new Uint8Array(15))).toThrow('salt must be 16 bytes');
    expect(() => assertSalt16(new Uint8Array(15), 'synthetic recovery salt')).toThrow(
      'synthetic recovery salt must be 16 bytes',
    );
    expect(() => assertSalt16(new Uint8Array(16))).not.toThrow();

    await expect(hkdfSha256(new Uint8Array(), new Uint8Array(16), new Uint8Array(), 32)).rejects.toThrow(
      'HKDF input key material must not be empty',
    );
    await expect(
      hkdfSha256(new Uint8Array([1]), new Uint8Array(16), new Uint8Array(), 0),
    ).rejects.toThrow('HKDF output length must be between 1 and 8160 bytes');
    await expect(
      hkdfSha256(new Uint8Array([1]), new Uint8Array(16), new Uint8Array(), 8161),
    ).rejects.toThrow('HKDF output length must be between 1 and 8160 bytes');
    await expect(deriveHkdfAes256(new Uint8Array(), new Uint8Array(16), new Uint8Array())).rejects.toThrow(
      'HKDF input key material must not be empty',
    );
    await expect(pbkdf2Sha256(utf8('synthetic'), new Uint8Array(16), 0, 1)).rejects.toThrow(
      'PBKDF2 iterations must be a positive integer',
    );
    await expect(pbkdf2Sha256(utf8('synthetic'), new Uint8Array(16), 1, 0)).rejects.toThrow(
      'PBKDF2 output length must fit Web Crypto deriveBits length',
    );
  });

  it('rejects unsupported key derivation inputs before deriving secret material', async () => {
    await expect(
      deriveKek({
        kind: 'passphrase',
        passphrase: '',
        params: { iterations: PBKDF2_ITERATIONS, salt: new Uint8Array(16) },
      }),
    ).rejects.toThrow('Passphrase must not be empty');
    await expect(
      deriveKek({
        kind: 'recovery_code',
        code: '',
        salt: new Uint8Array(16),
      }),
    ).rejects.toThrow('Recovery code must not be empty');
  });

  it('fails clearly when the Web Crypto provider is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    try {
      expect(() => getWebCrypto()).toThrow('Web Crypto is unavailable');
      expect(() => randomBytes(1)).toThrow('Web Crypto is unavailable');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('crypto envelope failure behavior', () => {
  it('rejects invalid AES keys and AAD and maps malformed boxes to no plaintext', async () => {
    const key = await generateAes256Key();
    const decryptOnly = await importAesKey(['decrypt']);
    const encryptOnly = await importAesKey(['encrypt']);
    await expect(seal(decryptOnly, utf8('synthetic payload'), aad)).rejects.toThrow(
      'Expected an AES-256-GCM key with encrypt usage',
    );
    await expect(seal(key, utf8('synthetic payload'), { ...aad, schemaVersion: -1 })).rejects.toThrow(
      'Invalid AES-GCM envelope AAD',
    );
    await expect(
      seal(key, utf8('synthetic payload'), { ...aad, epoch: 1.5 }),
    ).rejects.toThrow('Invalid AES-GCM envelope AAD');
    await expect(open(encryptOnly, { iv: 'AA' as Base64Url, ct: 'AA' as Base64Url }, aad)).resolves.toBeNull();
    await expect(open(key, { iv: 'A' as Base64Url, ct: '' as Base64Url }, aad)).resolves.toBeNull();
  });

  it('rejects unsupported wrapping keys and maps unwrap failures to typed results', async () => {
    const api = createCryptoApi();
    const kek = await api.deriveKek({
      kind: 'recovery_code',
      code: 'synthetic-wrapping-code',
      salt: new Uint8Array(16).fill(3),
    });
    const dataKey = await generateAes256Key(true);
    const nonExtractableKey = await generateAes256Key();
    await expect(wrapKey(nonExtractableKey, kek)).rejects.toThrow(
      'Key must be extractable to be wrapped by Web Crypto',
    );
    const agreement = await generateDeviceAgreementKeyPair();
    await expect(wrapKey(agreement.privateKey, kek)).rejects.toThrow(
      'Only AES-256-GCM, HMAC-SHA-256, and ECDSA P-256 private keys can be wrapped',
    );

    const wrapped = await wrapKey(dataKey, kek);
    await expect(unwrapKey(wrapped, kek, 'hmac')).resolves.toEqual({ ok: false });
    await expect(
      unwrapKey({ iv: 'AA' as Base64Url, ct: 'AA' as Base64Url }, kek, 'aes_gcm'),
    ).resolves.toEqual({ ok: false });
    const decryptOnlyKek = await importAesKey(['decrypt']);
    await expect(unwrapKey(wrapped, decryptOnlyKek, 'aes_gcm')).resolves.toEqual({
      ok: false,
    });
  });

  it('validates signatures, ECDH context, and LMK wrapping errors', async () => {
    const signing = await generateDeviceSigningKeyPair();
    const agreement = await generateDeviceAgreementKeyPair();
    const invalidKey = await generateDeviceAgreementKeyPair();
    const dataKey = await generateAes256Key(true);
    await expect(sign(signing.publicKey, utf8('synthetic message'))).rejects.toThrow(
      'Expected an ECDSA P-256 private key with sign usage',
    );
    expect(await verify(signing.publicKey, utf8('synthetic message'), '!' as Base64Url)).toBe(false);
    expect(await verify(invalidKey.publicKey, utf8('synthetic message'), 'AA' as Base64Url)).toBe(
      false,
    );

    const categoryContext = {
      kind: 'category',
      category: 'synthetic-invalid-category' as ShareCategory,
      epoch: 0,
    } satisfies WrapContext;
    await expect(
      ecdhWrap(
        dataKey,
        { deviceId: 'synthetic-recipient' as DeviceId, agreePub: agreement.publicKey },
        categoryContext,
        signing.privateKey,
      ),
    ).rejects.toThrow('Invalid share category');
    await expect(
      ecdhWrap(
        await generateAes256Key(),
        { deviceId: 'synthetic-recipient' as DeviceId, agreePub: agreement.publicKey },
        { kind: 'couple', epoch: 0 },
        signing.privateKey,
      ),
    ).rejects.toThrow('ECDH-ES wrapping requires an extractable AES-256-GCM key');
    const validWrapped = await ecdhWrap(
      dataKey,
      { deviceId: 'synthetic-recipient' as DeviceId, agreePub: agreement.publicKey },
      { kind: 'couple', epoch: 0 },
      signing.privateKey,
    );
    await expect(ecdhUnwrap(validWrapped, signing.privateKey, signing.publicKey)).resolves.toEqual({
      ok: false,
      error: { kind: 'integrity' },
    });

    const kek = await createCryptoApi().deriveKek({
      kind: 'recovery_code',
      code: 'synthetic-lmk-code',
      salt: new Uint8Array(16).fill(9),
    });
    await expect(wrapLocalMasterKey(new Uint8Array(31), kek)).rejects.toThrow(
      'LMK must be 32 bytes',
    );
    const malformed = {
      iv: 'A' as Base64Url,
      ct: '' as Base64Url,
    };
    await expect(unwrapLocalMasterKey(malformed, kek)).resolves.toEqual({
      ok: false,
      error: { kind: 'wrong_secret' },
    });

    const api = createCryptoApi();
    await expect(api.opaqueId(signing.publicKey, 'synthetic-logical-id' as LogicalId)).rejects.toThrow(
      'Expected an HMAC-SHA-256 key with sign usage',
    );
  });
});
