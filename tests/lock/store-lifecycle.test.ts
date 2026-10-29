import { describe, expect, it } from 'vitest';
import type { LockService } from '../../src/contracts/lock.ts';
import { createLockService } from '../../src/lock/core/service.ts';
import {
  createLockStoreLifecycle,
  LockRequiredError,
} from '../../src/lock/core/store-lifecycle.ts';
import { MemoryLockPersistence, confirmSetup } from './fixtures.ts';

interface TestStore {
  close(): void;
  readonly closed: boolean;
}

function testStore() {
  let closed = false;
  return {
    store: {
      close() {
        closed = true;
      },
      get closed() {
        return closed;
      },
    } satisfies TestStore,
  };
}

async function unlockedService(): Promise<LockService> {
  const service = createLockService({ persistence: new MemoryLockPersistence() });
  await confirmSetup(service);
  return service;
}

describe('lock-owned record store lifecycle', () => {
  it('closes stores and drops references synchronously from onLock', async () => {
    const service = await unlockedService();
    const opened = testStore();
    const lifecycle = createLockStoreLifecycle(service, () => opened.store);
    expect(await lifecycle.open()).toBe(opened.store);
    expect(lifecycle.current).toBe(opened.store);

    service.lock('timeout');
    expect(opened.store.closed).toBe(true);
    expect(lifecycle.current).toBeNull();
    await expect(lifecycle.open()).rejects.toBeInstanceOf(LockRequiredError);
    lifecycle.dispose();
  });

  it('closes a store that finishes opening after lock invalidated its key handle', async () => {
    const service = await unlockedService();
    const releaseOpen: { current?: () => void } = {};
    let announceStart: (() => void) | null = null;
    const started = new Promise<void>((resolve) => {
      announceStart = resolve;
    });
    const openingStore = testStore();
    const lifecycle = createLockStoreLifecycle(service, async () => {
      announceStart?.();
      await new Promise<void>((resolve) => {
        releaseOpen.current = resolve;
      });
      return openingStore.store;
    });

    const opening = lifecycle.open();
    await started;
    service.lock('manual');
    releaseOpen.current?.();
    await expect(opening).rejects.toBeInstanceOf(LockRequiredError);
    expect(openingStore.store.closed).toBe(true);
    expect(lifecycle.current).toBeNull();
    lifecycle.dispose();
  });
});
