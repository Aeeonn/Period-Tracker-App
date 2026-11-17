import { describe, expect, it } from 'vitest';
import type { Bytes } from '../../src/contracts/brand.ts';
import { encodeBase64Url } from '../../src/crypto/primitives/encoding.ts';
import {
  validateConfiguration,
  type LockConfiguration,
  type LockPersistence,
} from '../../src/lock/core/persistence.ts';
import {
  MemoryLockPersistence,
  SYNTHETIC_PASSPHRASE,
  confirmSetup,
  createMemoryService,
} from './fixtures.ts';

function filled(length: number, value: number): Bytes {
  return new Uint8Array(length).fill(value) as Bytes;
}

async function configurationWithPasskey(): Promise<{
  readonly configuration: LockConfiguration;
  readonly code: string;
}> {
  const persistence = new MemoryLockPersistence();
  const service = createMemoryService(persistence);
  const setup = await confirmSetup(service);
  const enabled = await service.enablePasskey(
    { kind: 'passphrase', passphrase: SYNTHETIC_PASSPHRASE },
    {
      credentialId: encodeBase64Url(filled(16, 7)),
      prfSalt: encodeBase64Url(filled(32, 9)),
      prfOutput: filled(32, 42),
    },
  );
  if (!enabled.ok) throw new Error(`Synthetic passkey setup failed: ${enabled.error}`);
  if (!persistence.configuration?.passkey) throw new Error('Synthetic passkey wrap is missing.');
  return { configuration: persistence.configuration, code: setup.code };
}

/** Serves stored metadata through the same check the IndexedDB persistence applies. */
class StoredLockPersistence extends MemoryLockPersistence implements LockPersistence {
  constructor(private stored: unknown) {
    super();
  }

  override async read(): Promise<LockConfiguration | undefined> {
    return this.configuration ?? validateConfiguration(this.stored);
  }
}

describe('stored lock metadata validation', () => {
  it('keeps a well-formed passkey wrap', async () => {
    const { configuration } = await configurationWithPasskey();
    expect(validateConfiguration(structuredClone(configuration))).toEqual(configuration);
  });

  it('ignores a damaged passkey wrap so the passphrase and recovery code still unlock', async () => {
    const { configuration, code } = await configurationWithPasskey();
    const damagedWraps: unknown[] = [
      'not-an-object',
      null,
      {},
      { ...configuration.passkey, prfSalt: encodeBase64Url(filled(8, 1)) },
      { ...configuration.passkey, salt: '***not-base64url***' },
      { ...configuration.passkey, credentialId: '' },
      { ...configuration.passkey, wrapped: { iv: 5 } },
    ];

    for (const passkey of damagedWraps) {
      const stored = { ...structuredClone(configuration), passkey };
      const parsed = validateConfiguration(stored);
      expect(parsed).not.toHaveProperty('passkey');
      expect(parsed.passphrase).toEqual(configuration.passphrase);
      expect(parsed.recoveryCode).toEqual(configuration.recoveryCode);

      const service = createMemoryService(new StoredLockPersistence(stored));
      // Face ID is simply not offered, and its old output opens nothing.
      await expect(service.passkeyInfo()).resolves.toBeUndefined();
      await expect(
        service.unlock({ kind: 'passkey_prf', prfOutput: filled(32, 42) }),
      ).resolves.toMatchObject({ ok: false });
      await expect(
        service.unlock({ kind: 'passphrase', passphrase: SYNTHETIC_PASSPHRASE }),
      ).resolves.toMatchObject({ ok: true });
      service.lock('manual');
      await expect(
        service.unlock({ kind: 'recovery_code', code }),
      ).resolves.toMatchObject({ ok: true });
    }
  });

  it('still refuses metadata whose passphrase or recovery wrap is damaged', async () => {
    const { configuration } = await configurationWithPasskey();
    const broken: unknown[] = [
      undefined,
      { ...configuration, version: 2 },
      { ...configuration, passphrase: { ...configuration.passphrase, iterations: 1000 } },
      { ...configuration, passphrase: { ...configuration.passphrase, salt: 'AA' } },
      { ...configuration, recoveryCode: { ...configuration.recoveryCode, wrapped: null } },
      // A damaged passkey never excuses a damaged passphrase wrap.
      { ...configuration, passkey: {}, passphrase: { ...configuration.passphrase, wrapped: 7 } },
    ];
    for (const value of broken) {
      expect(() => validateConfiguration(value)).toThrow('Lock metadata is invalid');
    }
  });
});
