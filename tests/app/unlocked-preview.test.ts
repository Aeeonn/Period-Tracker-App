import { describe, expect, it, vi } from 'vitest';
import type { LockService, RecoveryConfirmation } from '../../src/contracts/lock.ts';
import {
  initializeUnlockedPreview,
  isUnlockedPreviewEnabled,
  PREVIEW_INITIALIZATION_LOCK_NAME,
  type UnlockedPreviewOptions,
} from '../../src/app/unlocked-preview.ts';

const syntheticConfirmationPositions = [1, 6, 12, 24] as const;
const syntheticCredential = 'ab'.repeat(32);
const credentialStorageKey = 'flo.unlocked-preview.credential.v1';

interface SharedServiceState {
  configured: boolean;
  unlocked: boolean;
  setupCalls: number;
  unlockCalls: number;
  confirmation: RecoveryConfirmation | null;
  credential: string | null;
  requireLockForStateRead: boolean;
  failSetup: boolean;
  failConfirmation: boolean;
  failUnlock: boolean;
}

function sharedState(): SharedServiceState {
  return {
    configured: false,
    unlocked: false,
    setupCalls: 0,
    unlockCalls: 0,
    confirmation: null,
    credential: null,
    requireLockForStateRead: false,
    failSetup: false,
    failConfirmation: false,
    failUnlock: false,
  };
}

function fakeService(state: SharedServiceState): LockService {
  return {
    async setup(credential) {
      if (state.failSetup) throw new Error('synthetic setup failure');
      state.setupCalls += 1;
      state.credential = credential;
      return {
        recoveryCode: 'ABCD-EFGH-JKLM-NPQR-STUV-WXYZ',
        confirmPositions: syntheticConfirmationPositions,
      };
    },
    async confirmSetup(confirmation) {
      state.confirmation = confirmation;
      if (state.failConfirmation) throw new Error('synthetic confirmation failure');
      state.configured = true;
      state.unlocked = true;
      return { ok: true };
    },
    cancelSetup() {},
    async setupState() {
      if (state.requireLockForStateRead && !stateForLocks) {
        throw new Error('setup state read outside initialization lock');
      }
      return state.configured ? 'configured' : 'not_configured';
    },
    async unlock(secret) {
      state.unlockCalls += 1;
      if (state.failUnlock || secret.kind !== 'passphrase' || secret.passphrase !== state.credential) {
        return { ok: false, error: 'wrong_secret' };
      }
      state.unlocked = true;
      return { ok: true };
    },
    lock() {
      state.unlocked = false;
    },
    isUnlocked() {
      return state.unlocked;
    },
    onLock() {
      return () => undefined;
    },
    async changePassphrase() {
      return { ok: false, error: 'locked' };
    },
    storeKeys() {
      return { ok: false, error: 'locked' };
    },
  };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    values,
  };
}

function queuedLocks(): {
  readonly runExclusive: NonNullable<UnlockedPreviewOptions['runExclusive']>;
  readonly names: string[];
} {
  let tail = Promise.resolve();
  const names: string[] = [];
  const runExclusive: NonNullable<UnlockedPreviewOptions['runExclusive']> = (name, operation) => {
    names.push(name);
    const current = tail.then(async () => {
      const previous = stateForLocks;
      stateForLocks = true;
      try {
        return await operation();
      } finally {
        stateForLocks = previous;
      }
    });
    tail = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  };
  return { runExclusive, names };
}

let stateForLocks = false;

function options(
  storage: ReturnType<typeof memoryStorage>,
  runExclusive: NonNullable<UnlockedPreviewOptions['runExclusive']>,
): UnlockedPreviewOptions {
  return {
    storage,
    runExclusive,
    isFreshStore: async () => true,
    fillRandomValues(target) {
      expect(stateForLocks).toBe(true);
      target.fill(0xab);
    },
  };
}

describe('unlocked preview configuration', () => {
  it('only enables the named development mode or the explicit preview build flag', () => {
    expect(isUnlockedPreviewEnabled({ DEV: true, MODE: 'unlocked-preview' })).toBe(true);
    expect(isUnlockedPreviewEnabled({ DEV: false, MODE: 'unlocked-preview' })).toBe(false);
    expect(
      isUnlockedPreviewEnabled({
        DEV: false,
        MODE: 'production',
        VITE_FLO_UNLOCKED_PREVIEW: 'true',
      }),
    ).toBe(true);
    expect(
      isUnlockedPreviewEnabled({ DEV: false, MODE: 'production', VITE_FLO_UNLOCKED_PREVIEW: 'false' }),
    ).toBe(false);
  });
});

describe('unlocked preview bootstrap', () => {
  it('sets up the preview LockService, confirms recovery and stores only a generated credential', async () => {
    const state = sharedState();
    state.requireLockForStateRead = true;
    const service = fakeService(state);
    const storage = memoryStorage();
    const locks = queuedLocks();

    const result = await initializeUnlockedPreview(service, options(storage, locks.runExclusive));

    expect(result).toEqual({ status: 'ready', firstRun: true });
    expect(locks.names).toEqual([PREVIEW_INITIALIZATION_LOCK_NAME]);
    expect(state.setupCalls).toBe(1);
    expect(state.credential).toBe(syntheticCredential);
    expect(state.confirmation).toEqual(['A', 'F', 'M', 'Z']);
    expect(state.configured).toBe(true);
    expect(state.unlocked).toBe(true);
    expect(storage.values.get(credentialStorageKey)).toBe(
      JSON.stringify({ version: 1, credential: syntheticCredential }),
    );
    expect(storage.values.has('flo.unlocked-preview.storage-probe.v1')).toBe(false);
  });

  it('reuses the stored credential on a later launch without creating new lock material', async () => {
    const state = sharedState();
    const firstService = fakeService(state);
    const storage = memoryStorage();
    const locks = queuedLocks();
    await initializeUnlockedPreview(firstService, options(storage, locks.runExclusive));
    firstService.lock('cold_start');

    const nextService = fakeService(state);
    const result = await initializeUnlockedPreview(nextService, options(storage, locks.runExclusive));

    expect(result).toEqual({ status: 'ready', firstRun: false });
    expect(state.setupCalls).toBe(1);
    expect(state.unlockCalls).toBe(1);
    expect(state.unlocked).toBe(true);
  });

  it('serializes same-origin first launches and the waiting service reads setup state after the lock', async () => {
    const state = sharedState();
    state.requireLockForStateRead = true;
    const storage = memoryStorage();
    const locks = queuedLocks();

    const results = await Promise.all([
      initializeUnlockedPreview(fakeService(state), options(storage, locks.runExclusive)),
      initializeUnlockedPreview(fakeService(state), options(storage, locks.runExclusive)),
    ]);

    expect(results).toEqual([
      { status: 'ready', firstRun: true },
      { status: 'ready', firstRun: false },
    ]);
    expect(state.setupCalls).toBe(1);
    expect(state.unlockCalls).toBe(1);
    expect(locks.names).toEqual([PREVIEW_INITIALIZATION_LOCK_NAME, PREVIEW_INITIALIZATION_LOCK_NAME]);
  });

  it('fails visibly when credential storage is missing or malformed and preserves existing values', async () => {
    const state = sharedState();
    const service = fakeService(state);
    const locks = queuedLocks();
    const unavailable = {
      getItem() {
        throw new Error('synthetic storage unavailable');
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    expect(
      await initializeUnlockedPreview(service, {
        storage: unavailable,
        runExclusive: locks.runExclusive,
      }),
    ).toEqual({ status: 'error', reason: 'storage_unavailable' });
    expect(state.setupCalls).toBe(0);

    const malformed = memoryStorage({ [credentialStorageKey]: '{broken' });
    expect(
      await initializeUnlockedPreview(service, options(malformed, locks.runExclusive)),
    ).toEqual({ status: 'error', reason: 'inconsistent_state' });
    expect(malformed.values.get(credentialStorageKey)).toBe('{broken');
    expect(state.setupCalls).toBe(0);
  });

  it('does not reconfigure a configured store if its preview credential is missing', async () => {
    const state = sharedState();
    state.configured = true;
    const service = fakeService(state);
    const storage = memoryStorage();
    const locks = queuedLocks();

    expect(await initializeUnlockedPreview(service, options(storage, locks.runExclusive))).toEqual({
      status: 'error',
      reason: 'inconsistent_state',
    });
    expect(state.setupCalls).toBe(0);
    expect(storage.values.size).toBe(0);
  });

  it('reuses a saved credential after an interrupted first setup', async () => {
    const state = sharedState();
    state.failSetup = true;
    const service = fakeService(state);
    const storage = memoryStorage();
    const locks = queuedLocks();
    const settings = options(storage, locks.runExclusive);
    const random = vi.fn(settings.fillRandomValues!);

    expect(await initializeUnlockedPreview(service, { ...settings, fillRandomValues: random })).toEqual(
      { status: 'error', reason: 'setup_failed' },
    );
    expect(storage.values.get(credentialStorageKey)).toBe(
      JSON.stringify({ version: 1, credential: syntheticCredential }),
    );
    state.failSetup = false;
    expect(await initializeUnlockedPreview(service, { ...settings, fillRandomValues: random })).toEqual(
      { status: 'ready', firstRun: true },
    );
    expect(random).toHaveBeenCalledOnce();
    expect(state.credential).toBe(syntheticCredential);
  });

  it('does not create new lock material over a nonempty unconfigured preview store', async () => {
    const state = sharedState();
    const service = fakeService(state);
    const storage = memoryStorage({
      [credentialStorageKey]: JSON.stringify({ version: 1, credential: syntheticCredential }),
    });
    const locks = queuedLocks();

    expect(
      await initializeUnlockedPreview(service, {
        ...options(storage, locks.runExclusive),
        isFreshStore: async () => false,
      }),
    ).toEqual({ status: 'error', reason: 'inconsistent_state' });
    expect(state.setupCalls).toBe(0);
    expect(storage.values.get(credentialStorageKey)).toBe(
      JSON.stringify({ version: 1, credential: syntheticCredential }),
    );
  });

  it('does not create a lock configuration when the credential cannot be saved', async () => {
    const state = sharedState();
    const locks = queuedLocks();
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('synthetic storage full');
      },
    };

    expect(
      await initializeUnlockedPreview(fakeService(state), {
        ...options(memoryStorage(), locks.runExclusive),
        storage,
      }),
    ).toEqual({ status: 'error', reason: 'storage_unavailable' });
    expect(state.setupCalls).toBe(0);
    expect(state.configured).toBe(false);
  });

  it('does not start setup after its waiting initialization has been cancelled', async () => {
    const state = sharedState();
    const storage = memoryStorage();
    const controller = new AbortController();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runExclusive: NonNullable<UnlockedPreviewOptions['runExclusive']> = async (
      _name,
      operation,
    ) => {
      await waiting;
      return operation();
    };
    const result = initializeUnlockedPreview(fakeService(state), {
      ...options(storage, runExclusive),
      signal: controller.signal,
    });

    controller.abort();
    release();
    expect(await result).toEqual({ status: 'error', reason: 'cancelled' });
    expect(storage.values.size).toBe(0);
    expect(state.setupCalls).toBe(0);
  });

  it('fails closed on setup, recovery confirmation, unlock and Web Lock errors', async () => {
    const locks = queuedLocks();
    const storage = memoryStorage();
    const setupFailure = sharedState();
    setupFailure.failSetup = true;
    expect(
      await initializeUnlockedPreview(
        fakeService(setupFailure),
        options(storage, locks.runExclusive),
      ),
    ).toEqual({ status: 'error', reason: 'setup_failed' });

    const confirmFailure = sharedState();
    confirmFailure.failConfirmation = true;
    expect(
      await initializeUnlockedPreview(
        fakeService(confirmFailure),
        options(memoryStorage(), locks.runExclusive),
      ),
    ).toEqual({ status: 'error', reason: 'setup_failed' });

    const unlockFailure = sharedState();
    unlockFailure.configured = true;
    unlockFailure.credential = syntheticCredential;
    const existing = memoryStorage({
      [credentialStorageKey]: JSON.stringify({ version: 1, credential: syntheticCredential }),
    });
    unlockFailure.failUnlock = true;
    expect(
      await initializeUnlockedPreview(
        fakeService(unlockFailure),
        options(existing, locks.runExclusive),
      ),
    ).toEqual({ status: 'error', reason: 'unlock_failed' });

    const noLocksService = fakeService(sharedState());
    const setupStateSpy = vi.spyOn(noLocksService, 'setupState');
    expect(
      await initializeUnlockedPreview(noLocksService, {
        storage: memoryStorage(),
        runExclusive: async () => {
          throw new Error('synthetic lock unavailable');
        },
      }),
    ).toEqual({ status: 'error', reason: 'lock_unavailable' });
    expect(setupStateSpy).not.toHaveBeenCalled();
  });
});
