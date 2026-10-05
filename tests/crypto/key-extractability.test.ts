// synthetic: true (keys are generated locally for boundary assertions).
import { describe, expect, it } from 'vitest';
import {
  generateAes256Key,
  generateDeviceAgreementKeyPair,
  generateDeviceSigningKeyPair,
  generateIndexKey,
} from '../../src/crypto/keyring/device-keys.ts';

describe('approved key extractability boundaries', () => {
  it('keeps device signing, agreement and opaque-id secrets non-extractable', async () => {
    const signing = await generateDeviceSigningKeyPair();
    const agreement = await generateDeviceAgreementKeyPair();
    const index = await generateIndexKey();
    expect(signing.privateKey.extractable).toBe(false);
    expect(agreement.privateKey.extractable).toBe(false);
    expect(index.extractable).toBe(false);
    expect(signing.publicKey.extractable).toBe(true);
    expect(agreement.publicKey.extractable).toBe(true);
  });

  it('makes AES data-key exportability an explicit wrap-workflow choice', async () => {
    expect((await generateAes256Key()).extractable).toBe(false);
    expect((await generateAes256Key(true)).extractable).toBe(true);
  });
});
