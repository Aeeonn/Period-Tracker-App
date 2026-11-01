import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, writeMetaValue } from '../../../src/data/store/idb.ts';
import { DATABASE_NAME } from '../../../src/data/store/schema.ts';
import { LOCK_META_KEY } from '../../../src/lock/core/persistence.ts';
import { runLocalDataWipe } from '../../../src/data/wipe/index.ts';

describe('browser-backed local data wipe', () => {
  let factory: IDBFactory;
  let removeEntry: ReturnType<typeof vi.fn>;
  let deleteCache: ReturnType<typeof vi.fn>;
  let clearLocal: ReturnType<typeof vi.fn>;
  let clearSession: ReturnType<typeof vi.fn>;
  let unregister: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    factory = new IDBFactory();
    removeEntry = vi.fn(async () => undefined);
    deleteCache = vi.fn(async () => true);
    clearLocal = vi.fn();
    clearSession = vi.fn();
    unregister = vi.fn(async () => true);
    vi.stubGlobal('indexedDB', factory);
    vi.stubGlobal('navigator', {
      storage: {
        async getDirectory() {
          return {
            async *keys() {
              yield 'synthetic-file';
              yield 'synthetic-directory';
            },
            removeEntry,
          };
        },
      },
      serviceWorker: {
        async getRegistrations() {
          return [{ unregister }];
        },
      },
    });
    vi.stubGlobal('caches', {
      async keys() {
        return ['flo-static-synthetic-v1', 'unrelated-cache'];
      },
      delete: deleteCache,
    });
    vi.stubGlobal('localStorage', { clear: clearLocal });
    vi.stubGlobal('sessionStorage', { clear: clearSession });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function seedDatabase(name: string, withLockMaterial = false): Promise<void> {
    const database = await openDatabase({ databaseName: name, initialSchemaVersion: 1 });
    try {
      if (withLockMaterial) {
        await writeMetaValue(database, LOCK_META_KEY, {
          syntheticLockMetadata: 'synthetic-key-material-canary',
        });
      }
    } finally {
      database.close();
    }
  }

  it('erases lock-bearing app storage, deletes every database, and clears supported browser stores', async () => {
    await seedDatabase(DATABASE_NAME, true);
    await seedDatabase('synthetic-secondary-database');

    await expect(runLocalDataWipe()).resolves.toEqual({ success: true, failures: [] });

    await expect(factory.databases()).resolves.toEqual([]);
    expect(removeEntry.mock.calls).toEqual([
      ['synthetic-file', { recursive: true }],
      ['synthetic-directory', { recursive: true }],
    ]);
    expect(deleteCache.mock.calls).toEqual([['flo-static-synthetic-v1']]);
    expect(clearLocal).toHaveBeenCalledOnce();
    expect(clearSession).toHaveBeenCalledOnce();
    expect(unregister).toHaveBeenCalledOnce();
  });

  it('reports failed destructive steps in order but still attempts later cleanup', async () => {
    await seedDatabase(DATABASE_NAME, true);
    await seedDatabase('synthetic-failed-delete');
    const originalDelete = factory.deleteDatabase.bind(factory);
    vi.spyOn(factory, 'deleteDatabase').mockImplementation((name) => {
      if (name === 'synthetic-failed-delete') throw new Error('synthetic delete failure');
      return originalDelete(name);
    });
    removeEntry.mockImplementation(async (name: string) => {
      if (name === 'synthetic-directory') throw new Error('synthetic OPFS failure');
    });
    deleteCache.mockRejectedValue(new Error('synthetic cache failure'));
    clearLocal.mockImplementation(() => {
      throw new Error('synthetic local storage failure');
    });
    unregister.mockResolvedValue(false);

    await expect(runLocalDataWipe()).resolves.toEqual({
      success: false,
      failures: [
        'IndexedDB databases',
        'OPFS',
        'Cache Storage',
        'localStorage',
        'service workers',
      ],
    });

    expect(clearSession).toHaveBeenCalledOnce();
    expect(removeEntry).toHaveBeenCalledTimes(2);
    expect(deleteCache).toHaveBeenCalledOnce();
    expect(unregister).toHaveBeenCalledOnce();
    await expect(factory.databases()).resolves.toEqual([
      expect.objectContaining({ name: 'synthetic-failed-delete' }),
    ]);
  });

  it('fails closed when the browser cannot enumerate every IndexedDB database', async () => {
    vi.spyOn(factory, 'databases').mockRejectedValue(
      new Error('synthetic database inventory unavailable'),
    );

    await expect(runLocalDataWipe()).resolves.toEqual({
      success: false,
      failures: ['IndexedDB databases'],
    });
    expect(factory.databases).toHaveBeenCalledOnce();
  });

  it('fails closed when IndexedDB lacks the database inventory method', async () => {
    vi.stubGlobal(
      'indexedDB',
      {
        open: factory.open.bind(factory),
        deleteDatabase: factory.deleteDatabase.bind(factory),
        cmp: factory.cmp.bind(factory),
      } as unknown as IDBFactory,
    );

    await expect(runLocalDataWipe()).resolves.toEqual({
      success: false,
      failures: ['IndexedDB databases'],
    });
    await expect(factory.databases()).resolves.toEqual([]);
  });

  it('reports unsupported browser cleanup APIs without skipping other wipe steps', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('caches', undefined);
    vi.stubGlobal('localStorage', undefined);
    vi.stubGlobal('sessionStorage', undefined);

    await expect(runLocalDataWipe()).resolves.toEqual({
      success: false,
      failures: ['OPFS', 'Cache Storage', 'localStorage', 'sessionStorage', 'service workers'],
    });
    await expect(factory.databases()).resolves.toEqual([]);
  });

  it('reports blocked database deletion while an open client still holds the database', async () => {
    const databaseName = 'synthetic-blocked-wipe-delete';
    await seedDatabase(databaseName);
    const blockingClient = await openDatabase({
      databaseName,
      initialSchemaVersion: 1,
    });

    try {
      await expect(runLocalDataWipe()).resolves.toEqual({
        success: false,
        failures: ['IndexedDB databases'],
      });
    } finally {
      blockingClient.close();
    }
  });
});
