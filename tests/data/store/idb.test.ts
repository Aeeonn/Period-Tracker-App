import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notifySchemaChanged,
  openDatabase,
  openSchemaDatabase,
  readMetaValue,
  requestResult,
  transactionDone,
  writeMetaValue,
} from '../../../src/data/store/idb.ts';
import {
  META_SCHEMA_VERSION,
  META_STORE,
  RECORDS_STORE,
} from '../../../src/data/store/schema.ts';

describe('IndexedDB request and schema helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('BroadcastChannel', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves committed transactions and reports request and transaction failures', async () => {
    const database = await openDatabase({
      databaseName: 'synthetic-idb-request-results',
      initialSchemaVersion: 1,
    });
    try {
      const committed = database.transaction(META_STORE, 'readwrite');
      const committedDone = transactionDone(committed);
      const store = committed.objectStore(META_STORE);
      await requestResult(store.add({ key: 'synthetic-key', value: 1 }));
      await expect(committedDone).resolves.toBeUndefined();

      const aborted = database.transaction(META_STORE, 'readwrite');
      const abortedDone = transactionDone(aborted);
      const metadata = aborted.objectStore(META_STORE);
      await requestResult(metadata.add({ key: 'duplicate-key', value: 1 }));
      const duplicate = metadata.add({ key: 'duplicate-key', value: 2 });
      await expect(requestResult(duplicate)).rejects.toMatchObject({
        name: 'ConstraintError',
      });
      await expect(abortedDone).rejects.toMatchObject({ name: 'ConstraintError' });
    } finally {
      database.close();
    }
  });

  it('runs initial upgrades and leaves no partial database when an upgrade callback fails', async () => {
    const upgrades: Array<{ oldVersion: number; version: number }> = [];
    const database = await openDatabase({
      databaseName: 'synthetic-idb-upgrade',
      initialSchemaVersion: 1,
      onUpgrade(upgraded, transaction, oldVersion) {
        upgrades.push({ oldVersion, version: upgraded.version });
        expect(transaction.objectStoreNames.contains(META_STORE)).toBe(true);
      },
    });
    expect(upgrades).toEqual([{ oldVersion: 0, version: 1 }]);
    expect(database.objectStoreNames.contains(RECORDS_STORE)).toBe(true);
    database.close();

    const failure = new Error('synthetic IDB upgrade failure');
    await expect(
      openDatabase({
        databaseName: 'synthetic-idb-failed-upgrade',
        initialSchemaVersion: 1,
        onUpgrade() {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
    const recovered = await openDatabase({
      databaseName: 'synthetic-idb-failed-upgrade',
      initialSchemaVersion: 1,
    });
    expect(await readMetaValue(recovered, META_SCHEMA_VERSION)).toBe(1);
    recovered.close();
  });

  it('notifies blocked version upgrades and completes them when the old connection closes', async () => {
    const name = 'synthetic-idb-blocked-upgrade';
    const existing = await openDatabase({ databaseName: name, initialSchemaVersion: 1 });
    let observeBlocked: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      observeBlocked = resolve;
    });
    const upgrade = openDatabase({
      databaseName: name,
      version: 2,
      initialSchemaVersion: 1,
      onBlocked() {
        observeBlocked?.();
      },
    });

    await blocked;
    existing.close();
    const upgraded = await upgrade;
    expect(upgraded.version).toBe(2);
    upgraded.close();
  });

  it('creates a new database at the requested schema version and rejects invalid versions', async () => {
    const database = await openSchemaDatabase('synthetic-idb-schema-v3', 3);
    try {
      expect(database.version).toBe(3);
      expect(await readMetaValue(database, META_SCHEMA_VERSION)).toBe(3);
    } finally {
      database.close();
    }
    await expect(openSchemaDatabase('synthetic-idb-negative-version', -1)).rejects.toThrow(
      'Schema version must be a non-negative safe integer',
    );
    await expect(openSchemaDatabase('synthetic-idb-fractional-version', 1.5)).rejects.toThrow(
      'Schema version must be a non-negative safe integer',
    );
  });

  it('reads and writes metadata through complete transactions and tolerates unavailable channels', async () => {
    const database = await openDatabase({
      databaseName: 'synthetic-idb-metadata',
      initialSchemaVersion: 1,
    });
    try {
      await writeMetaValue(database, 'synthetic-value', { ready: true });
      await expect(readMetaValue(database, 'synthetic-value')).resolves.toEqual({ ready: true });
      expect(notifySchemaChanged('synthetic-idb-metadata', 2)).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('does not throw if BroadcastChannel construction is unavailable', () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('synthetic channel construction failure');
        }
      },
    );

    expect(() => notifySchemaChanged('synthetic-channel-failure', 2)).not.toThrow();
  });
});
