import { describe, expect, it } from 'vitest';
import type { Base64Url, Bytes } from '../../src/contracts/brand.ts';
import type { LockService, PasskeyEnrollment } from '../../src/contracts/lock.ts';
import { encodeBase64Url } from '../../src/crypto/primitives/encoding.ts';
import {
  DeferredLockPersistence,
  MemoryLockPersistence,
  SYNTHETIC_PASSPHRASE,
  confirmSetup,
  createMemoryService,
} from './fixtures.ts';

const passphrase = { kind: 'passphrase', passphrase: SYNTHETIC_PASSPHRASE } as const;
const newPassphrase = 'synthetic cedar morning 82';

function filled(length: number, value: number): Bytes {
  return new Uint8Array(length).fill(value) as Bytes;
}

function enrollment(overrides: Partial<PasskeyEnrollment> = {}): PasskeyEnrollment {
  return {
    credentialId: encodeBase64Url(filled(16, 7)),
    prfSalt: encodeBase64Url(filled(32, 9)),
    prfOutput: filled(32, 42),
    ...overrides,
  };
}

async function configured(persistence = new MemoryLockPersistence()): Promise<{
  readonly service: LockService;
  readonly persistence: MemoryLockPersistence;
  readonly code: string;
}> {
  const service = createMemoryService(persistence);
  const setup = await confirmSetup(service);
  return { service, persistence, code: setup.code };
}

describe('LockService Face ID passkey wrap', () => {
  it('enables, unlocks with the same PRF output, and rejects a different one', async () => {
    const { service, persistence } = await configured();
    expect(await service.passkeyInfo()).toBeUndefined();

    const enrolled = enrollment();
    expect(await service.enablePasskey(passphrase, enrolled)).toEqual({ ok: true });
    expect(await service.passkeyInfo()).toEqual({
      credentialId: enrolled.credentialId,
      prfSalt: enrolled.prfSalt,
    });
    const stored = persistence.configuration?.passkey;
    expect(stored?.credentialId).toBe(enrolled.credentialId);
    expect(stored?.wrapped.ct).toBeTruthy();
    expect(JSON.stringify(persistence.configuration)).not.toContain(
      encodeBase64Url(filled(32, 42)),
    );

    service.lock('manual');
    expect(await service.unlock({ kind: 'passkey_prf', prfOutput: filled(32, 43) })).toEqual({
      ok: false,
      error: 'wrong_secret',
    });
    expect(await service.unlock({ kind: 'passkey_prf', prfOutput: filled(16, 42) })).toEqual({
      ok: false,
      error: 'wrong_secret',
    });
    expect(service.isUnlocked()).toBe(false);
    expect(await service.unlock({ kind: 'passkey_prf', prfOutput: filled(32, 42) })).toEqual({
      ok: true,
    });
    expect(service.isUnlocked()).toBe(true);
  });

  it('keeps the passphrase and recovery code working after enabling Face ID', async () => {
    const { service, code } = await configured();
    expect(await service.enablePasskey(passphrase, enrollment())).toEqual({ ok: true });
    service.lock('manual');
    expect(await service.unlock(passphrase)).toEqual({ ok: true });
    service.lock('manual');
    expect(await service.unlock({ kind: 'recovery_code', code })).toEqual({ ok: true });
  });

  it('reports a passkey unlock as unsupported when Face ID is not enabled', async () => {
    const { service } = await configured();
    service.lock('manual');
    expect(await service.unlock({ kind: 'passkey_prf', prfOutput: filled(32, 42) })).toEqual({
      ok: false,
      error: 'unsupported',
    });
  });

  it('requires an unlocked session and the right passphrase, and changes nothing otherwise', async () => {
    const { service, persistence } = await configured();
    const before = persistence.configuration;
    expect(
      await service.enablePasskey(
        { kind: 'passphrase', passphrase: 'synthetic wrong words 11' },
        enrollment(),
      ),
    ).toEqual({ ok: false, error: 'wrong_secret' });
    expect(service.isUnlocked()).toBe(true);
    expect(persistence.configuration).toEqual(before);

    service.lock('manual');
    expect(await service.enablePasskey(passphrase, enrollment())).toEqual({
      ok: false,
      error: 'locked',
    });
    expect(persistence.configuration).toEqual(before);
  });

  it('rejects malformed enrollments before any re-authentication', async () => {
    const { service, persistence } = await configured();
    const before = persistence.configuration;
    const invalid: PasskeyEnrollment[] = [
      enrollment({ credentialId: '' as Base64Url }),
      enrollment({ credentialId: '***' as Base64Url }),
      enrollment({ credentialId: encodeBase64Url(filled(1024, 1)) }),
      enrollment({ prfSalt: encodeBase64Url(filled(16, 9)) }),
      enrollment({ prfOutput: filled(31, 42) }),
    ];
    for (const value of invalid) {
      expect(await service.enablePasskey(passphrase, value)).toEqual({
        ok: false,
        error: 'invalid_enrollment',
      });
    }
    expect(persistence.configuration).toEqual(before);
  });

  it('disables Face ID so the PRF output no longer unlocks', async () => {
    const { service, persistence } = await configured();
    await service.enablePasskey(passphrase, enrollment());
    expect(await service.disablePasskey()).toEqual({ ok: true });
    expect(persistence.configuration?.passkey).toBeUndefined();
    expect(await service.passkeyInfo()).toBeUndefined();
    service.lock('manual');
    expect(await service.disablePasskey()).toEqual({ ok: false, error: 'locked' });
    expect(await service.unlock({ kind: 'passkey_prf', prfOutput: filled(32, 42) })).toEqual({
      ok: false,
      error: 'unsupported',
    });
  });

  it('replaces an earlier passkey wrap when enabled again', async () => {
    const { service } = await configured();
    await service.enablePasskey(passphrase, enrollment());
    const second = enrollment({
      credentialId: encodeBase64Url(filled(16, 8)),
      prfOutput: filled(32, 77),
    });
    expect(await service.enablePasskey(passphrase, second)).toEqual({ ok: true });
    expect((await service.passkeyInfo())?.credentialId).toBe(second.credentialId);
    service.lock('manual');
    expect(await service.unlock({ kind: 'passkey_prf', prfOutput: filled(32, 42) })).toEqual({
      ok: false,
      error: 'wrong_secret',
    });
    expect(await service.unlock({ kind: 'passkey_prf', prfOutput: filled(32, 77) })).toEqual({
      ok: true,
    });
  });

  it('keeps the passkey wrap across a passphrase change and accepts Face ID as authorization', async () => {
    const { service, persistence } = await configured();
    await service.enablePasskey(passphrase, enrollment());
    const passkeyBefore = persistence.configuration?.passkey;
    expect(
      await service.changePassphrase(
        { kind: 'passkey_prf', prfOutput: filled(32, 42) },
        newPassphrase,
      ),
    ).toEqual({ ok: true });
    expect(persistence.configuration?.passkey).toEqual(passkeyBefore);
    service.lock('manual');
    expect(await service.unlock({ kind: 'passkey_prf', prfOutput: filled(32, 42) })).toEqual({
      ok: true,
    });
    service.lock('manual');
    expect(await service.unlock({ kind: 'passphrase', passphrase: newPassphrase })).toEqual({
      ok: true,
    });
  });

  it('keeps both updates when Face ID is enabled during a passphrase change', async () => {
    const { service, persistence } = await configured();
    const [changed, enabled] = await Promise.all([
      service.changePassphrase(passphrase, newPassphrase),
      service.enablePasskey(passphrase, enrollment()),
    ]);
    expect(changed).toEqual({ ok: true });
    expect(enabled).toEqual({ ok: true });
    expect(persistence.configuration?.passkey).toBeDefined();
    service.lock('manual');
    expect(await service.unlock({ kind: 'passphrase', passphrase: newPassphrase })).toEqual({
      ok: true,
    });
    service.lock('manual');
    expect(await service.unlock({ kind: 'passkey_prf', prfOutput: filled(32, 42) })).toEqual({
      ok: true,
    });
  });

  it('reports locked and writes nothing when the app locks before the commit starts', async () => {
    const persistence = new DeferredLockPersistence();
    const { service } = await configured(persistence);
    const before = persistence.configuration;
    const deferred = persistence.deferNextCommit();
    const pending = service.enablePasskey(passphrase, enrollment());
    await deferred.started;
    service.lock('timeout');
    expect(await pending).toEqual({ ok: false, error: 'locked' });
    expect(persistence.configuration).toEqual(before);
  });
});
