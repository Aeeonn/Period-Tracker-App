// synthetic: true (all generated keys, ids, AAD and plaintexts are artificial).
import { describe, expect, it } from 'vitest';
import type { Bytes, DeviceId, LogicalId, OpaqueId } from '../../src/contracts/brand.ts';
import type { EnvelopeAad, SealedBox } from '../../src/contracts/crypto.ts';
import { createCryptoApi } from '../../src/crypto/primitives/api.ts';
import {
  bytesToHex,
  decodeBase64Url,
  encodeBase64Url,
  hexToBytes,
  utf8,
} from '../../src/crypto/primitives/encoding.ts';
import {
  generateAes256Key,
  generateDeviceAgreementKeyPair,
  generateDeviceSigningKeyPair,
  generateIndexKey,
} from '../../src/crypto/keyring/device-keys.ts';
import {
  createLocalMasterKey,
  unwrapLocalMasterKey,
  wrapLocalMasterKey,
} from '../../src/crypto/keyring/lmk.ts';
import { PBKDF2_ITERATIONS } from '../../src/crypto/primitives/kdf.ts';
import { randomBytes } from '../../src/crypto/primitives/webcrypto.ts';

const api = createCryptoApi();
const aad: EnvelopeAad = {
  recordId: 'opaque-test-record' as OpaqueId,
  type: 'day',
  schemaVersion: 1,
  epoch: 0,
};

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function changedBox(box: SealedBox): SealedBox {
  const ciphertext = decodeBase64Url(box.ct);
  ciphertext[0] = ciphertext[0]! ^ 1;
  return { ...box, ct: encodeBase64Url(ciphertext) };
}

describe('WebCrypto CryptoApi behavior', () => {
  it('seals random plaintexts with 96-bit IVs and opens them only under identical AAD', async () => {
    const key = await generateAes256Key();
    const plaintexts: Bytes[] = [
      new Uint8Array(),
      randomBytes(1),
      randomBytes(32),
      randomBytes(4096),
    ];
    const seenIvs = new Set<string>();

    for (const plaintext of plaintexts) {
      const box = await api.seal(key, plaintext, aad);
      expect(decodeBase64Url(box.iv)).toHaveLength(12);
      expect(seenIvs.has(box.iv)).toBe(false);
      seenIvs.add(box.iv);
      const opened = await api.open(key, box, aad);
      expect(opened).toEqual({ ok: true, value: plaintext });
    }
    for (let index = 0; index < 128; index += 1) {
      const box = await api.seal(key, new Uint8Array(), aad);
      expect(decodeBase64Url(box.iv)).toHaveLength(12);
      expect(seenIvs.has(box.iv)).toBe(false);
      seenIvs.add(box.iv);
    }

    const original = await api.seal(key, utf8('synthetic-envelope'), aad);
    expect(await api.open(key, changedBox(original), aad)).toEqual({
      ok: false,
      error: { kind: 'integrity' },
    });
    const alteredAads: EnvelopeAad[] = [
      { ...aad, recordId: 'another-record' as OpaqueId },
      { ...aad, type: 'cfg' },
      { ...aad, schemaVersion: aad.schemaVersion + 1 },
      { ...aad, epoch: aad.epoch + 1 },
    ];
    for (const altered of alteredAads) {
      expect(await api.open(key, original, altered)).toEqual({
        ok: false,
        error: { kind: 'integrity' },
      });
    }

    const secondSeal = await api.seal(key, utf8('synthetic-envelope'), aad);
    expect(secondSeal.iv).not.toBe(original.iv);
    expect(secondSeal.ct).not.toBe(original.ct);
  });

  it('enforces approved PBKDF2 metadata and keeps derived KEKs non-extractable', async () => {
    const salt = randomBytes(16);
    const source = {
      kind: 'passphrase' as const,
      passphrase: 'synthetic-test-passphrase',
      params: { iterations: PBKDF2_ITERATIONS, salt },
    };
    const key = await api.deriveKek(source);
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect([...key.usages].sort()).toEqual(['decrypt', 'encrypt']);
    await expect(
      api.deriveKek({ ...source, params: { iterations: PBKDF2_ITERATIONS - 1, salt } }),
    ).rejects.toThrow(/iterations/);
    await expect(
      api.deriveKek({
        ...source,
        params: { iterations: PBKDF2_ITERATIONS, salt: randomBytes(15) },
      }),
    ).rejects.toThrow(/salt/);
  });

  it('derives separated recovery and PRF KEKs from 16-byte salts and 32-byte PRF output', async () => {
    const salt = randomBytes(16);
    const recovery = await api.deriveKek({
      kind: 'recovery_code',
      code: 'synthetic-recovery-code',
      salt,
    });
    const prf = await api.deriveKek({ kind: 'passkey_prf', prfOutput: randomBytes(32), salt });
    expect(recovery.extractable).toBe(false);
    expect(prf.extractable).toBe(false);
    expect(recovery.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect(prf.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    await expect(
      api.deriveKek({ kind: 'passkey_prf', prfOutput: randomBytes(31), salt }),
    ).rejects.toThrow(/32 bytes/);
    await expect(
      api.deriveKek({
        kind: 'recovery_code',
        code: 'synthetic-recovery-code',
        salt: randomBytes(15),
      }),
    ).rejects.toThrow(/16 bytes/);
  });

  it('wraps the LMK for each KDF path; wrong passphrase returns WrongSecret with no plaintext', async () => {
    const salt = randomBytes(16);
    const passphrase = await api.deriveKek({
      kind: 'passphrase',
      passphrase: 'synthetic-correct-passphrase',
      params: { iterations: PBKDF2_ITERATIONS, salt },
    });
    const wrongPassphrase = await api.deriveKek({
      kind: 'passphrase',
      passphrase: 'synthetic-wrong-passphrase',
      params: { iterations: PBKDF2_ITERATIONS, salt },
    });
    const lmk = createLocalMasterKey();
    expect(lmk).toHaveLength(32);
    const wrapped = await wrapLocalMasterKey(lmk, passphrase);
    const unwrapped = await unwrapLocalMasterKey(wrapped, passphrase);
    expect(unwrapped.ok).toBe(true);
    if (unwrapped.ok) expect(equalBytes(unwrapped.value, lmk)).toBe(true);

    const rejected = await unwrapLocalMasterKey(wrapped, wrongPassphrase);
    expect(rejected).toEqual({ ok: false, error: { kind: 'wrong_secret' } });
    expect('value' in rejected).toBe(false);

    const recoveryKek = await api.deriveKek({
      kind: 'recovery_code',
      code: 'synthetic-recovery',
      salt,
    });
    const prfKek = await api.deriveKek({ kind: 'passkey_prf', prfOutput: randomBytes(32), salt });
    for (const kek of [recoveryKek, prfKek]) {
      const altWrap = await wrapLocalMasterKey(lmk, kek);
      const result = await unwrapLocalMasterKey(altWrap, kek);
      expect(result.ok).toBe(true);
      if (result.ok) expect(equalBytes(result.value, lmk)).toBe(true);
    }
  });

  it('wraps AES keys and returns extractable data keys; bad secret and changed bytes reject', async () => {
    const goodKek = await api.deriveKek({
      kind: 'recovery_code',
      code: 'synthetic-wrap-key',
      salt: randomBytes(16),
    });
    const badKek = await api.deriveKek({
      kind: 'recovery_code',
      code: 'synthetic-other-key',
      salt: randomBytes(16),
    });
    const keyToWrap = await generateAes256Key(true);
    const wrapped = await api.wrapKey(keyToWrap, goodKek);
    const unwrapped = await api.unwrapKey(wrapped, goodKek, 'aes_gcm');
    expect(unwrapped.ok).toBe(true);
    if (unwrapped.ok) {
      expect(unwrapped.value.extractable).toBe(true);
      const sealed = await api.seal(unwrapped.value, utf8('synthetic'), aad);
      expect((await api.open(unwrapped.value, sealed, aad)).ok).toBe(true);
    }
    expect(await api.unwrapKey(wrapped, badKek, 'aes_gcm')).toEqual({
      ok: false,
      error: { kind: 'wrong_secret' },
    });
    const corrupt = { ...wrapped, ct: encodeBase64Url(changedBytes(decodeBase64Url(wrapped.ct))) };
    expect(await api.unwrapKey(corrupt, goodKek, 'aes_gcm')).toEqual({
      ok: false,
      error: { kind: 'wrong_secret' },
    });

    const identity = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    const wrappedIdentity = await api.wrapKey(identity.privateKey, goodKek);
    const restoredIdentity = await api.unwrapKey(wrappedIdentity, goodKek, 'ecdsa_sign');
    expect(restoredIdentity.ok).toBe(true);
    if (restoredIdentity.ok) expect(restoredIdentity.value.extractable).toBe(true);
    await expect(
      api.wrapKey((await generateDeviceSigningKeyPair()).privateKey, goodKek),
    ).rejects.toThrow(/extractable/);
  });

  it('signs and verifies ECDSA P-256/SHA-256, rejecting changed data and signatures', async () => {
    const pair = await generateDeviceSigningKeyPair();
    expect(pair.privateKey.extractable).toBe(false);
    expect(pair.publicKey.extractable).toBe(true);
    const data = utf8('synthetic-signed-message');
    const signature = await api.sign(pair.privateKey, data);
    expect(decodeBase64Url(signature)).toHaveLength(64);
    expect(await api.verify(pair.publicKey, data, signature)).toBe(true);
    expect(await api.verify(pair.publicKey, utf8('changed-message'), signature)).toBe(false);
    const changed = decodeBase64Url(signature);
    changed[0] = changed[0]! ^ 1;
    expect(await api.verify(pair.publicKey, data, encodeBase64Url(changed))).toBe(false);
  });

  it('ECDH-ES wraps to a recipient with signed context and rejects wrong keys or tampering', async () => {
    const recipientPair = await generateDeviceAgreementKeyPair();
    const otherRecipient = await generateDeviceAgreementKeyPair();
    const senderSign = await generateDeviceSigningKeyPair();
    const dataKey = await generateAes256Key(true);
    const context = { kind: 'category', category: 'cycle_overview', epoch: 3 } as const;
    const deviceId = 'synthetic-recipient' as DeviceId;
    const wrapped = await api.ecdhWrap(
      dataKey,
      { deviceId, agreePub: recipientPair.publicKey },
      context,
      senderSign.privateKey,
    );
    expect(decodeBase64Url(wrapped.salt)).toHaveLength(16);
    expect(decodeBase64Url(wrapped.iv)).toHaveLength(12);
    const unwrapped = await api.ecdhUnwrap(wrapped, recipientPair.privateKey, senderSign.publicKey);
    expect(unwrapped.ok).toBe(true);
    if (unwrapped.ok) {
      expect(unwrapped.value.extractable).toBe(true);
      const box = await api.seal(unwrapped.value, utf8('synthetic-shared-key-roundtrip'), aad);
      expect((await api.open(dataKey, box, aad)).ok).toBe(true);
      const localKek = await api.deriveKek({
        kind: 'recovery_code',
        code: 'synthetic-recipient-local-wrap',
        salt: randomBytes(16),
      });
      const locallyWrapped = await api.wrapKey(unwrapped.value, localKek);
      expect((await api.unwrapKey(locallyWrapped, localKek, 'aes_gcm')).ok).toBe(true);
    }
    expect(await api.ecdhUnwrap(wrapped, otherRecipient.privateKey, senderSign.publicKey)).toEqual({
      ok: false,
      error: { kind: 'integrity' },
    });
    expect(
      await api.ecdhUnwrap(
        { ...wrapped, context: { kind: 'category', category: 'mood_selected', epoch: 3 } },
        recipientPair.privateKey,
        senderSign.publicKey,
      ),
    ).toEqual({ ok: false, error: { kind: 'bad_signature' } });
    const changed = decodeBase64Url(wrapped.ct);
    changed[0] = changed[0]! ^ 1;
    expect(
      await api.ecdhUnwrap(
        { ...wrapped, ct: encodeBase64Url(changed) },
        recipientPair.privateKey,
        senderSign.publicKey,
      ),
    ).toEqual({ ok: false, error: { kind: 'bad_signature' } });
  });

  it('matches RFC 4231 HMAC-SHA-256 test case 1 through the 128-bit opaque-id API', async () => {
    const indexKey = await globalThis.crypto.subtle.importKey(
      'raw',
      hexToBytes('0b'.repeat(20)),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const opaqueId = await api.opaqueId(indexKey, 'Hi There' as LogicalId);
    expect(opaqueId).toBe('sDRMYdjbOFNcqK_OrwvxKw');
    expect(bytesToHex(decodeBase64Url(opaqueId))).toBe('b0344c61d8db38535ca8afceaf0bf12b');
  });

  it('derives stable 128-bit HMAC opaque ids without exposing logical ids', async () => {
    const indexKey = await generateIndexKey();
    expect(indexKey.extractable).toBe(false);
    const logicalId = 'synthetic-logical-id' as LogicalId;
    const first = await api.opaqueId(indexKey, logicalId);
    expect(first).toBe(await api.opaqueId(indexKey, logicalId));
    expect(first).not.toBe(await api.opaqueId(indexKey, 'different-synthetic-id' as LogicalId));
    expect(decodeBase64Url(first)).toHaveLength(16);
    expect(first).not.toContain(logicalId);
  });
});

function changedBytes(bytes: Bytes): Bytes {
  const changed = bytes.slice();
  changed[0] = changed[0]! ^ 1;
  return changed;
}
