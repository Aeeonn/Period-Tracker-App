import { describe, expect, it } from 'vitest';
import type { Bytes, LogicalId } from '../../src/contracts/brand.ts';
import type { LockService, RecoveryConfirmation, UnlockSecret } from '../../src/contracts/lock.ts';
import type { StoredRecordRow } from '../../src/contracts/store.ts';
import { utf8 } from '../../src/crypto/primitives/encoding.ts';
import { createCryptoApi } from '../../src/crypto/primitives/index.ts';
import {
  canonicalizeRecoveryCode,
  isPassphraseLengthAllowed,
} from '../../src/lock/core/service.ts';
import {
  DeferredLockPersistence,
  MemoryLockPersistence,
  SYNTHETIC_PASSPHRASE,
  beginSetup,
  confirmSetup,
  createMemoryService,
} from './fixtures.ts';

const newPassphrase = 'synthetic cedar morning 82';

function confirmationFor(code: string, positions: readonly number[]): RecoveryConfirmation {
  const canonical = canonicalizeRecoveryCode(code);
  return positions.map((position) => canonical[position - 1]!) as unknown as RecoveryConfirmation;
}

async function configuredService(persistence = new MemoryLockPersistence()): Promise<{
  readonly service: LockService;
  readonly persistence: MemoryLockPersistence;
  readonly code: string;
}> {
  const service = createMemoryService(persistence);
  const setup = await confirmSetup(service);
  return { service, persistence, code: setup.code };
}

describe('LockService setup and recovery', () => {
  it('creates a 120-bit grouped recovery code, enforces four-character confirmation, and persists nothing early', async () => {
    const persistence = new MemoryLockPersistence();
    const service = createMemoryService(persistence);
    const setup = await beginSetup(service);

    expect(setup.code).toMatch(/^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){5}$/u);
    expect(setup.confirmation).toHaveLength(4);
    expect(setup.positions).toEqual([...setup.positions].sort((a, b) => a - b));
    expect(new Set(setup.positions).size).toBe(4);
    expect(setup.positions.every((position) => position >= 1 && position <= 24)).toBe(true);
    expect(await service.setupState()).toBe('pending_confirmation');
    expect(service.isUnlocked()).toBe(false);
    expect(service.storeKeys()).toEqual({ ok: false, error: 'locked' });
    expect(await service.unlock({ kind: 'passphrase', passphrase: SYNTHETIC_PASSPHRASE })).toEqual({
      ok: false,
      error: 'unsupported',
    });
    expect(await service.unlock({ kind: 'recovery_code', code: setup.code })).toEqual({
      ok: false,
      error: 'unsupported',
    });
    expect(persistence.configuration).toBeUndefined();

    const positions =
      (await service.setupState()) === 'pending_confirmation' ? setup.confirmation : [];
    const wrong = [...positions] as [string, string, string, string];
    wrong[0] = wrong[0] === 'A' ? 'B' : 'A';
    expect(await service.confirmSetup(wrong)).toEqual({ ok: false, error: 'wrong_confirmation' });
    expect(await service.setupState()).toBe('pending_confirmation');
    expect(persistence.configuration).toBeUndefined();

    const correct = await service.confirmSetup(setup.confirmation);
    expect(correct).toEqual({ ok: true });
    expect(await service.setupState()).toBe('configured');
    expect(service.isUnlocked()).toBe(true);
    expect(persistence.configuration?.passphrase.iterations).toBe(600_000);
    expect(JSON.stringify(persistence.configuration)).not.toContain(SYNTHETIC_PASSPHRASE);
    expect(JSON.stringify(persistence.configuration)).not.toContain(setup.code.replaceAll('-', ''));
  });

  it('waits for a committing setup before allowing a competing setup', async () => {
    const persistence = new DeferredLockPersistence();
    const service = createMemoryService(persistence);
    const first = await beginSetup(service);
    const deferred = persistence.deferNextCommit();
    const confirmation = service.confirmSetup(first.confirmation);

    await deferred.started;
    await deferred.committing;
    const competingSetup = service.setup('synthetic maple river lantern 31');
    await Promise.resolve();
    deferred.finish();

    await expect(confirmation).resolves.toEqual({ ok: true });
    await expect(competingSetup).rejects.toThrow('Lock setup is already confirmed on this device');
    expect(await service.setupState()).toBe('configured');
    expect(persistence.commitCount).toBe(1);
  });

  it('canonicalizes passphrases to NFC and recovery codes by case and grouping only', async () => {
    const persistence = new MemoryLockPersistence();
    const service = createMemoryService(persistence);
    const decomposed = 'synthetic e\u0301cho river';
    const setup = await confirmSetup(service, decomposed);
    service.lock('manual');

    expect(
      await service.unlock({ kind: 'passphrase', passphrase: 'synthetic écho river' }),
    ).toEqual({ ok: true });
    service.lock('manual');
    expect(
      await service.unlock({
        kind: 'recovery_code',
        code: setup.code.toLowerCase().replaceAll('-', ''),
      }),
    ).toEqual({ ok: true });
    expect(canonicalizeRecoveryCode(` ${setup.code.toLowerCase()} `)).toBe(
      setup.code.replaceAll('-', ''),
    );
  });

  it('does not distinguish configured wrong passphrases from wrong recovery codes', async () => {
    const { service, code } = await configuredService();
    const invalidRecovery = `${code[0] === 'A' ? 'B' : 'A'}${code.slice(1)}`;
    expect(
      await service.unlock({ kind: 'passphrase', passphrase: 'synthetic wrong phrase' }),
    ).toEqual({
      ok: false,
      error: 'wrong_secret',
    });
    expect(await service.unlock({ kind: 'recovery_code', code: invalidRecovery })).toEqual({
      ok: false,
      error: 'wrong_secret',
    });
    expect(await service.unlock({ kind: 'recovery_code', code: 'not a recovery code' })).toEqual({
      ok: false,
      error: 'wrong_secret',
    });
    expect(
      await service.unlock({
        kind: 'passkey_prf',
        prfOutput: utf8('synthetic unconfigured') as Bytes,
      }),
    ).toEqual({
      ok: false,
      error: 'unsupported',
    });
    expect(service.isUnlocked()).toBe(true);
  });
  it('abandons pending setup on cancel, replacement, and every lock reason', async () => {
    const persistence = new MemoryLockPersistence();
    const service = createMemoryService(persistence);
    await beginSetup(service);
    service.cancelSetup();
    expect(await service.setupState()).toBe('not_configured');

    const replacement = await beginSetup(service);
    expect(await service.setupState()).toBe('pending_confirmation');
    service.lock('timeout');
    expect(await service.setupState()).toBe('not_configured');
    expect(persistence.configuration).toBeUndefined();
    expect(await service.confirmSetup(replacement.confirmation)).toEqual({
      ok: false,
      error: 'no_pending_setup',
    });
  });

  it('requires 10 code points after trimming, counting inner whitespace for setup and changes', async () => {
    const service = createMemoryService();
    expect(isPassphraseLengthAllowed('1 2 3 4')).toBe(false);
    expect(isPassphraseLengthAllowed('a b c d')).toBe(false);
    expect(isPassphraseLengthAllowed('          ')).toBe(false);
    expect(isPassphraseLengthAllowed(' 123456789 ')).toBe(false);
    expect(isPassphraseLengthAllowed('0123456789')).toBe(true);
    await expect(service.setup('1 2 3 4')).rejects.toThrow(RangeError);
    await expect(service.setup('a b c d')).rejects.toThrow(RangeError);
    await expect(service.setup('          ')).rejects.toThrow(RangeError);
    const accepted = await service.setup('0123456789');
    expect(accepted.recoveryCode).toMatch(/^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){5}$/u);
    service.cancelSetup();

    const configured = await configuredService();
    const before = configured.persistence.configuration;
    await expect(
      configured.service.changePassphrase(
        { kind: 'passphrase', passphrase: SYNTHETIC_PASSPHRASE },
        '1 2 3 4',
      ),
    ).rejects.toThrow(RangeError);
    await expect(
      configured.service.changePassphrase(
        { kind: 'passphrase', passphrase: SYNTHETIC_PASSPHRASE },
        '          ',
      ),
    ).rejects.toThrow(RangeError);
    expect(configured.persistence.configuration).toEqual(before);
    expect(
      await configured.service.changePassphrase(
        { kind: 'passphrase', passphrase: SYNTHETIC_PASSPHRASE },
        '0123456789',
      ),
    ).toEqual({ ok: true });
  });
});

describe('LockService keys and lock lifecycle', () => {
  it('hands out only non-extractable purpose keys and invalidates every accessor synchronously', async () => {
    const { service } = await configuredService();
    const result = service.storeKeys();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const keys = result.keys;
    const provider = keys.keyProvider;
    const row = { type: 'day' } as StoredRecordRow;
    const record = { entity: 'Profile' } as Parameters<typeof provider.forWrite>[0];
    const material = await provider.forWrite(record);
    const candidates = await provider.forRead('day', row);

    expect(keys.indexKey.extractable).toBe(false);
    expect(provider.snapshotKey.extractable).toBe(false);
    expect(material.key.extractable).toBe(false);
    expect(material.key).toBe(provider.snapshotKey);
    expect(candidates).toHaveLength(1);
    expect(await provider.forRead('cfg', { type: 'day' } as StoredRecordRow)).toEqual([]);
    expect(await provider.forRead('proj', { type: 'proj' } as StoredRecordRow)).toEqual([]);
    expect(await provider.forRead('couple', { type: 'couple' } as StoredRecordRow)).toEqual([]);
    expect(() =>
      provider.forWrite({ entity: 'Projection' } as Parameters<typeof provider.forWrite>[0]),
    ).toThrow();
    expect(() =>
      provider.forWrite({ entity: 'CoupleEntry' } as Parameters<typeof provider.forWrite>[0]),
    ).toThrow();
    expect(candidates[0]?.key.extractable).toBe(false);
    expect((keys.indexKey.algorithm as HmacKeyAlgorithm).name).toBe('HMAC');
    expect((provider.snapshotKey.algorithm as AesKeyAlgorithm).name).toBe('AES-GCM');
    expect(Object.keys(keys)).toEqual(['indexKey', 'keyProvider', 'isValid']);

    let observedBeforeReturn = false;
    service.onLock(() => {
      observedBeforeReturn = true;
      expect(service.isUnlocked()).toBe(false);
      expect(keys.isValid()).toBe(false);
    });
    service.lock('manual');
    expect(observedBeforeReturn).toBe(true);
    expect(keys.isValid()).toBe(false);
    expect(service.storeKeys()).toEqual({ ok: false, error: 'locked' });
    expect(() => keys.indexKey).toThrow();
    expect(() => provider.snapshotKey).toThrow();
    expect(() => provider.forWrite(record)).toThrow();
    expect(() => provider.forRead('day', row)).toThrow();
  });

  it('derives stable PDK and IDX material across unlocks for synthetic records', async () => {
    const { service, code } = await configuredService();
    const first = service.storeKeys();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const crypto = createCryptoApi();
    const logicalId = 'synthetic-lock-record' as LogicalId;
    const opaqueId = await crypto.opaqueId(first.keys.indexKey, logicalId);
    const aad = { recordId: opaqueId, type: 'sys' as const, schemaVersion: 1, epoch: 0 };
    const box = await crypto.seal(
      first.keys.keyProvider.snapshotKey,
      utf8('synthetic ciphertext canary'),
      aad,
    );

    service.lock('manual');
    expect(await service.unlock({ kind: 'recovery_code', code })).toEqual({ ok: true });
    const second = service.storeKeys();
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(await crypto.opaqueId(second.keys.indexKey, logicalId)).toBe(opaqueId);
    const opened = await crypto.open(second.keys.keyProvider.snapshotKey, box, aad);
    expect(opened.ok).toBe(true);
    if (opened.ok)
      expect(new TextDecoder().decode(opened.value)).toBe('synthetic ciphertext canary');
  });
  it('invalidates separate handles for manual, quick-hide, timeout, and cold-start locks', async () => {
    const { service, code } = await configuredService();
    for (const reason of ['manual', 'quick_hide', 'timeout', 'cold_start'] as const) {
      const result = service.storeKeys();
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('Expected unlocked keys');
      service.lock(reason);
      expect(result.keys.isValid()).toBe(false);
      expect(service.isUnlocked()).toBe(false);
      expect(await service.unlock({ kind: 'recovery_code', code })).toEqual({ ok: true });
    }
  });

  it('exposes all ten contract members as callable and detached functions', async () => {
    const service = createMemoryService();
    const members = [
      'setup',
      'confirmSetup',
      'cancelSetup',
      'setupState',
      'unlock',
      'lock',
      'isUnlocked',
      'onLock',
      'changePassphrase',
      'storeKeys',
    ] as const;
    for (const member of members) expect(typeof service[member]).toBe('function');

    const setup = service.setup;
    const pending = await setup(SYNTHETIC_PASSPHRASE);
    const state = service.setupState;
    expect(await state()).toBe('pending_confirmation');
    const confirmation = confirmationFor(pending.recoveryCode, pending.confirmPositions);
    const confirm = service.confirmSetup;
    expect(await confirm(confirmation)).toEqual({ ok: true });
    const getKeys = service.storeKeys;
    expect(getKeys().ok).toBe(true);
    const unlocked = service.isUnlocked;
    expect(unlocked()).toBe(true);
    const onLock = service.onLock;
    const off = onLock(() => undefined);
    off();
    const change = service.changePassphrase;
    expect(
      await change({ kind: 'passphrase', passphrase: SYNTHETIC_PASSPHRASE }, newPassphrase),
    ).toEqual({
      ok: true,
    });
    const lock = service.lock;
    lock('manual');
    const unlock = service.unlock;
    expect(await unlock({ kind: 'passphrase', passphrase: newPassphrase })).toEqual({ ok: true });
    const cancel = service.cancelSetup;
    cancel();
  });
});

describe('changePassphrase authorization and atomicity', () => {
  it('returns one wrong_secret result for every unauthorized method without ending the session', async () => {
    const { service, persistence, code } = await configuredService();
    const initial = persistence.configuration;
    const invalidRecovery = `${code[0] === 'A' ? 'B' : 'A'}${code.slice(1)}`;
    const wrongSecrets: readonly UnlockSecret[] = [
      { kind: 'passphrase', passphrase: 'synthetic incorrect passphrase' },
      { kind: 'recovery_code', code: invalidRecovery },
      { kind: 'passkey_prf', prfOutput: utf8('synthetic unconfigured passkey') as Bytes },
    ];
    for (const secret of wrongSecrets) {
      expect(await service.changePassphrase(secret, newPassphrase)).toEqual({
        ok: false,
        error: 'wrong_secret',
      });
      expect(service.isUnlocked()).toBe(true);
      expect(persistence.configuration).toEqual(initial);
    }
    expect(
      await service.changePassphrase(
        { kind: 'passkey_prf', prfOutput: new Uint8Array(32) as Bytes },
        newPassphrase,
      ),
    ).toEqual({
      ok: false,
      error: 'wrong_secret',
    });
  });

  it('re-wraps only the passphrase wrap and leaves handed-out purpose keys valid and identical', async () => {
    const { service, persistence, code } = await configuredService();
    const before = persistence.configuration;
    const keys = service.storeKeys();
    expect(keys.ok).toBe(true);
    if (!keys.ok || !before) return;
    const indexKey = keys.keys.indexKey;
    const recordKey = keys.keys.keyProvider.snapshotKey;

    expect(await service.changePassphrase({ kind: 'recovery_code', code }, newPassphrase)).toEqual({
      ok: true,
    });
    const after = persistence.configuration;
    expect(after?.passphrase.salt).not.toBe(before.passphrase.salt);
    expect(after?.passphrase.wrapped).not.toEqual(before.passphrase.wrapped);
    expect(after?.recoveryCode).toEqual(before.recoveryCode);
    expect(keys.keys.isValid()).toBe(true);
    expect(keys.keys.indexKey).toBe(indexKey);
    expect(keys.keys.keyProvider.snapshotKey).toBe(recordKey);

    service.lock('manual');
    expect(await service.unlock({ kind: 'passphrase', passphrase: SYNTHETIC_PASSPHRASE })).toEqual({
      ok: false,
      error: 'wrong_secret',
    });
    expect(await service.unlock({ kind: 'passphrase', passphrase: newPassphrase })).toEqual({
      ok: true,
    });
  });

  it('keeps the previous configuration after a failed atomic passphrase commit', async () => {
    const { service, persistence } = await configuredService();
    const before = persistence.configuration;
    persistence.failNextCommit = true;
    await expect(
      service.changePassphrase(
        { kind: 'passphrase', passphrase: SYNTHETIC_PASSPHRASE },
        newPassphrase,
      ),
    ).rejects.toThrow('Synthetic atomic commit failure');
    expect(persistence.configuration).toEqual(before);
    expect(service.isUnlocked()).toBe(true);
    service.lock('manual');
    expect(await service.unlock({ kind: 'passphrase', passphrase: SYNTHETIC_PASSPHRASE })).toEqual({
      ok: true,
    });
  });

  it('coalesces same-task double confirmation and preserves configured state', async () => {
    const persistence = new DeferredLockPersistence();
    const service = createMemoryService(persistence);
    const setup = await beginSetup(service);
    const gate = persistence.deferNextCommit();
    const first = service.confirmSetup(setup.confirmation);
    const second = service.confirmSetup(setup.confirmation);
    await gate.started;
    await gate.committing;
    expect(persistence.commitCount).toBe(1);
    gate.finish();
    expect(await Promise.all([first, second])).toEqual([{ ok: true }, { ok: true }]);
    expect(await service.setupState()).toBe('configured');
    await expect(service.setup(SYNTHETIC_PASSPHRASE)).rejects.toThrow();
    expect(
      await service.changePassphrase(
        { kind: 'passphrase', passphrase: SYNTHETIC_PASSPHRASE },
        newPassphrase,
      ),
    ).toEqual({ ok: true });
  });

  it('preserves persisted setup and re-wrap state when lock lands after commit starts', async () => {
    const persistence = new DeferredLockPersistence();
    const service = createMemoryService(persistence);
    const setup = await beginSetup(service);
    const confirmGate = persistence.deferNextCommit();
    const confirmation = service.confirmSetup(setup.confirmation);
    await confirmGate.started;
    await confirmGate.committing;
    const competingSetup = service.setup('synthetic second passphrase 82');
    service.lock('manual');
    confirmGate.finish();
    expect(await confirmation).toEqual({ ok: true });
    await expect(competingSetup).rejects.toThrow();
    expect(await service.setupState()).toBe('configured');
    expect(service.isUnlocked()).toBe(false);
    await expect(service.setup(SYNTHETIC_PASSPHRASE)).rejects.toThrow();

    expect(await service.unlock({ kind: 'recovery_code', code: setup.code })).toEqual({ ok: true });
    const changeGate = persistence.deferNextCommit();
    const change = service.changePassphrase(
      { kind: 'recovery_code', code: setup.code },
      newPassphrase,
    );
    await changeGate.started;
    await changeGate.committing;
    service.lock('timeout');
    changeGate.finish();
    expect(await change).toEqual({ ok: true });
    expect(await service.setupState()).toBe('configured');
    expect(service.isUnlocked()).toBe(false);
    expect(await service.unlock({ kind: 'passphrase', passphrase: newPassphrase })).toEqual({
      ok: true,
    });
  });

  it('retains the configured row when cancelSetup cannot abort a committing confirmation', async () => {
    const persistence = new DeferredLockPersistence();
    const service = createMemoryService(persistence);
    const setup = await beginSetup(service);
    const gate = persistence.deferNextCommit();
    const confirmation = service.confirmSetup(setup.confirmation);
    await gate.started;
    await gate.committing;
    service.cancelSetup();
    gate.finish();
    expect(await confirmation).toEqual({ ok: true });
    expect(await service.setupState()).toBe('configured');
    expect(service.isUnlocked()).toBe(false);
    await expect(service.setup(SYNTHETIC_PASSPHRASE)).rejects.toThrow();
    expect(await service.unlock({ kind: 'recovery_code', code: setup.code })).toEqual({ ok: true });
    expect(
      await service.changePassphrase({ kind: 'recovery_code', code: setup.code }, newPassphrase),
    ).toEqual({ ok: true });
  });
  it('defines lock during commits as abort-before-commit and reports the persisted truth', async () => {
    const persistence = new DeferredLockPersistence();
    const service = createMemoryService(persistence);
    const setup = await beginSetup(service);
    const confirmGate = persistence.deferNextCommit();
    const confirmationPromise = service.confirmSetup(setup.confirmation);
    await confirmGate.started;
    service.lock('timeout');
    expect(await confirmationPromise).toEqual({ ok: false, error: 'no_pending_setup' });
    expect(persistence.configuration).toBeUndefined();
    expect(await service.setupState()).toBe('not_configured');

    const configured = await confirmSetup(service);
    const previous = persistence.configuration;
    const changeGate = persistence.deferNextCommit();
    const changePromise = service.changePassphrase(
      { kind: 'recovery_code', code: configured.code },
      newPassphrase,
    );
    await changeGate.started;
    service.lock('timeout');
    expect(await changePromise).toEqual({ ok: false, error: 'locked' });
    expect(persistence.configuration).toEqual(previous);
    changeGate.finish();
    expect(persistence.configuration).toEqual(previous);
  });
});
