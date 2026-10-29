import type { LockService, UnlockedStoreKeys } from '../../contracts/lock.ts';

export interface ClosableStore {
  close(): void;
}

export class LockRequiredError extends Error {
  constructor() {
    super('An unlocked session is required to open the store');
    this.name = 'LockRequiredError';
  }
}

export interface LockStoreLifecycle<TStore extends ClosableStore> {
  open(): Promise<TStore>;
  close(): void;
  dispose(): void;
  readonly current: TStore | null;
}

/** Owns all stores created with lock-service keys and closes them synchronously on lock. */
export function createLockStoreLifecycle<TStore extends ClosableStore>(
  service: LockService,
  openStore: (keys: UnlockedStoreKeys) => TStore | Promise<TStore>,
): LockStoreLifecycle<TStore> {
  const stores = new Set<TStore>();
  let currentStore: TStore | null = null;
  let generation = 0;
  let disposed = false;

  const closeAll = () => {
    generation += 1;
    for (const store of stores) {
      try {
        store.close();
      } catch {
        // A failing close cannot keep other session stores reachable.
      }
    }
    stores.clear();
    currentStore = null;
  };
  const unsubscribe = service.onLock(closeAll);

  return {
    async open() {
      if (disposed) throw new LockRequiredError();
      const result = service.storeKeys();
      if (!result.ok) throw new LockRequiredError();
      const startedAt = generation;
      const store = await openStore(result.keys);
      if (disposed || generation !== startedAt || !result.keys.isValid()) {
        store.close();
        throw new LockRequiredError();
      }
      stores.add(store);
      currentStore = store;
      return store;
    },
    close: closeAll,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      closeAll();
    },
    get current() {
      return currentStore;
    },
  };
}
