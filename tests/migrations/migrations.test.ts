import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogicalRecord, Migration, StoredRecordRow } from '../../src/contracts/store.ts';
import type { CryptoApi } from '../../src/contracts/crypto.ts';
import type { LocalDate } from '../../src/contracts/localdate.ts';
import type { RecordKeyProvider } from '../../src/contracts/store.ts';
import { createCryptoApi } from '../../src/crypto/primitives/index.ts';
import { decodeRecordRow, encodeRecordRow } from '../../src/data/store/codec.ts';
import {
  openDatabase,
  readMetaValue,
  requestResult,
  transactionDone,
  writeMetaValue,
} from '../../src/data/store/idb.ts';
import {
  META_MIGRATION_COMPLETED,
  META_MIGRATION_PENDING,
  META_SCHEMA_VERSION,
  RECORDS_STORE,
  SNAPSHOTS_STORE,
} from '../../src/data/store/schema.ts';
import {
  applyMigrationSteps,
  createMigrationRunner,
  decideSchemaVersion,
} from '../../src/data/migrations/index.ts';
import { MIGRATIONS, SCHEMA_VERSION } from '../../src/data/migrations/registry.ts';

type DayBundleRecord = Extract<LogicalRecord, { readonly entity: 'DayBundle' }> & {
  readonly deleted: false;
};

const initial = {
  entity: 'DayBundle',
  logicalId: 'synthetic-migration-day',
  authorDevice: 'synthetic-device-p0',
  hlc: { wallMs: 1740000000000, counter: 0, deviceId: 'synthetic-device-p0' },
  deleted: false,
  body: { localDate: '2031-02-03' as LocalDate, fieldHlc: {} },
} as unknown as DayBundleRecord;

const migration: Migration = {
  from: 0,
  to: 1,
  migrate(records) {
    return records.map((record) => {
      if (record.entity !== 'DayBundle' || record.deleted) return record;
      return {
        ...record,
        body: { ...record.body, localDate: '2031-02-04' as LocalDate },
      } as unknown as DayBundleRecord;
    });
  },
};

describe('schema migrations', () => {
  it('keeps the registered default migration contiguous and identity-preserving', () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS.map(({ from, to }) => [from, to])).toEqual([[0, 1]]);
    expect(MIGRATIONS[0]?.migrate([initial])).toEqual([initial]);
  });

  it('applies contiguous pure migration steps and preserves identity when repeated', () => {
    const once = applyMigrationSteps([initial], 0, 1, [migration]);
    expect(once[0]).toMatchObject({ body: { localDate: '2031-02-04' } });
    expect(applyMigrationSteps(once, 1, 1, [migration])).toEqual(once);
  });

  it('rejects a missing or discontinuous migration', () => {
    expect(() => applyMigrationSteps([initial], 0, 1, [])).toThrow('Missing contiguous migration');
    expect(() => applyMigrationSteps([initial], 0, 2, [migration])).toThrow(
      'Missing contiguous migration',
    );
  });

  it('propagates an injected migration failure without returning transformed records', () => {
    const failing: Migration = {
      from: 0,
      to: 1,
      migrate() {
        throw new Error('synthetic injected migration failure');
      },
    };
    expect(() => applyMigrationSteps([initial], 0, 1, [failing])).toThrow(
      'synthetic injected migration failure',
    );
    expect(initial.body).toMatchObject({ localDate: '2031-02-03' });
  });

  it('chooses migration or read-only newer-schema mode without downgrading', () => {
    expect(decideSchemaVersion(1, 0, 1)).toBe('migrate');
    expect(decideSchemaVersion(1, 1, 1)).toBe('up_to_date');
    expect(decideSchemaVersion(2, 2, 1)).toBe('newer');
    expect(decideSchemaVersion(2, 1, 1)).toBe('newer');
  });

  it('rejects invalid version ranges before applying any migration', () => {
    expect(() => applyMigrationSteps([initial], 0.5, 1, [migration])).toThrow(
      'Invalid migration version range',
    );
    expect(() => applyMigrationSteps([initial], 2, 1, [migration])).toThrow(
      'Invalid migration version range',
    );
  });

  it('validates migration step continuity and the declared final schema version', () => {
    const createRunner = (steps: readonly Migration[], schemaVersion: number) =>
      createMigrationRunner({
        schemaVersion,
        steps,
        crypto: {} as CryptoApi,
        indexKey: {} as CryptoKey,
        keyProvider: {} as RecordKeyProvider,
        writeCoordinator: { beginWrite: () => () => undefined },
      });
    const skippingVersion: Migration = {
      from: 0,
      to: 2,
      migrate(records) {
        return records;
      },
    };
    const gapAfterFirst: Migration = {
      from: 2,
      to: 3,
      migrate(records) {
        return records;
      },
    };

    expect(() => createRunner([skippingVersion], 2)).toThrow(
      'Migration steps must be ordered, contiguous vN -> vN+1 functions',
    );
    expect(() => createRunner([migration, gapAfterFirst], 3)).toThrow(
      'Migration steps must be ordered, contiguous vN -> vN+1 functions',
    );
    expect(() => createRunner([migration], 2)).toThrow(
      'Migration steps must end at the code schema version',
    );
  });

  it('fails closed before opening a database when Web Locks are unavailable', async () => {
    vi.stubGlobal('navigator', {});
    try {
      const runner = createMigrationRunner({
        schemaVersion: 1,
        steps: [migration],
        crypto: {} as CryptoApi,
        indexKey: {} as CryptoKey,
        keyProvider: {} as RecordKeyProvider,
        writeCoordinator: { beginWrite: () => () => undefined },
      });

      await expect(runner.run()).rejects.toMatchObject({
        name: 'NotSupportedError',
        message: 'The Web Locks API is required for safe schema migrations',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('IndexedDB migration runner lifecycle', () => {
  const cryptoApi = createCryptoApi();
  const writeEvents: string[] = [];
  const lockEvents: string[] = [];

  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.stubGlobal('BroadcastChannel', undefined);
    writeEvents.length = 0;
    lockEvents.length = 0;
    vi.stubGlobal('navigator', {
      locks: {
        request<T>(
          name: string,
          options: { readonly mode: 'exclusive' },
          operation: () => Promise<T>,
        ): Promise<T> {
          lockEvents.push(`${name}:${options.mode}`);
          return operation();
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function keys(): Promise<{ readonly dataKey: CryptoKey; readonly indexKey: CryptoKey }> {
    const dataKey = await globalThis.crypto.subtle.importKey(
      'raw',
      new Uint8Array(32).fill(17),
      'AES-GCM',
      false,
      ['encrypt', 'decrypt'],
    );
    const indexKey = await globalThis.crypto.subtle.importKey(
      'raw',
      new Uint8Array(32).fill(29),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    return { dataKey, indexKey };
  }

  function keyProvider(dataKey: CryptoKey): RecordKeyProvider {
    return {
      snapshotKey: dataKey,
      forWrite: () => ({ key: dataKey, epoch: 0 }),
      forRead: () => [{ key: dataKey, epoch: 0 }],
    };
  }

  async function seedVersionZero(
    databaseName: string,
    dataKey: CryptoKey,
    indexKey: CryptoKey,
  ): Promise<void> {
    const database = await openDatabase({ databaseName, initialSchemaVersion: 0 });
    const row = await encodeRecordRow(initial, 0, {
      crypto: cryptoApi,
      indexKey,
      keyProvider: keyProvider(dataKey),
    });
    const transaction = database.transaction(RECORDS_STORE, 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore(RECORDS_STORE).put(row);
    await done;
    database.close();
  }

  function runner(
    databaseName: string,
    dataKey: CryptoKey,
    indexKey: CryptoKey,
    steps: readonly Migration[] = [migration],
    schemaVersion = 1,
    onBlocked?: (from: number, to: number) => void,
  ) {
    return createMigrationRunner({
      databaseName,
      schemaVersion,
      steps,
      crypto: cryptoApi,
      indexKey,
      keyProvider: keyProvider(dataKey),
      ...(onBlocked === undefined ? {} : { onBlocked }),
      writeCoordinator: {
        beginWrite() {
          writeEvents.push('begin');
          return () => writeEvents.push('release');
        },
      },
    });
  }

  it('migrates encrypted records once, persists schema metadata and clears the snapshot on next start', async () => {
    const databaseName = 'synthetic-migration-success';
    const { dataKey, indexKey } = await keys();
    await seedVersionZero(databaseName, dataKey, indexKey);
    const run = runner(databaseName, dataKey, indexKey);

    await expect(run.run()).resolves.toEqual({ status: 'migrated', from: 0, to: 1 });
    expect(lockEvents).toEqual([`flo:db-store:migration:${databaseName}:exclusive`]);
    expect(writeEvents).toEqual(['begin', 'release']);

    const database = await openDatabase({ databaseName, initialSchemaVersion: 1 });
    try {
      expect(await readMetaValue(database, META_SCHEMA_VERSION)).toBe(1);
      expect(await readMetaValue(database, META_MIGRATION_PENDING)).toBe(false);
      expect(await readMetaValue(database, META_MIGRATION_COMPLETED)).toBe(1);
      const readTransaction = database.transaction(RECORDS_STORE, 'readonly');
      const readDone = transactionDone(readTransaction);
      const rows = await requestResult(
        readTransaction.objectStore(RECORDS_STORE).getAll(),
      );
      await readDone;
      const migrated = await decodeRecordRow(rows[0]!, 1, {
        crypto: cryptoApi,
        indexKey,
        keyProvider: keyProvider(dataKey),
      });
      expect(migrated).toMatchObject({ body: { localDate: '2031-02-04' } });

      const snapshotTransaction = database.transaction(SNAPSHOTS_STORE, 'readonly');
      const snapshotDone = transactionDone(snapshotTransaction);
      const snapshots = await requestResult(
        snapshotTransaction.objectStore(SNAPSHOTS_STORE).getAll(),
      );
      await snapshotDone;
      expect(snapshots).toHaveLength(1);
    } finally {
      database.close();
    }

    await expect(run.run()).resolves.toEqual({ status: 'up_to_date', schemaVersion: 1 });
    const afterRestart = await openDatabase({ databaseName, initialSchemaVersion: 1 });
    try {
      const transaction = afterRestart.transaction(SNAPSHOTS_STORE, 'readonly');
      const done = transactionDone(transaction);
      const snapshots = await requestResult(transaction.objectStore(SNAPSHOTS_STORE).getAll());
      await done;
      expect(snapshots).toHaveLength(0);
      expect(await readMetaValue(afterRestart, META_MIGRATION_COMPLETED)).toBeUndefined();
    } finally {
      afterRestart.close();
    }
    expect(writeEvents).toEqual(['begin', 'release', 'begin', 'release']);
  });

  it('upgrades an existing database one schema version at a time and waits for blocked clients', async () => {
    const databaseName = 'synthetic-migration-version-upgrade';
    const { dataKey, indexKey } = await keys();
    await seedVersionZero(databaseName, dataKey, indexKey);
    const blockingClient = await openDatabase({
      databaseName,
      initialSchemaVersion: 1,
    });
    const secondStep: Migration = {
      from: 1,
      to: 2,
      migrate(records) {
        return records;
      },
    };
    let unblock!: () => void;
    const blocked = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const onBlocked = vi.fn(() => unblock());
    const run = runner(databaseName, dataKey, indexKey, [migration, secondStep], 2, onBlocked);
    const outcome = run.run();

    await blocked;
    expect(onBlocked).toHaveBeenCalledWith(1, 2);
    blockingClient.close();
    await expect(outcome).resolves.toEqual({ status: 'migrated', from: 0, to: 2 });

    const migratedDatabase = await openDatabase({
      databaseName,
      initialSchemaVersion: 2,
    });
    try {
      expect(migratedDatabase.version).toBe(2);
      expect(await readMetaValue(migratedDatabase, META_SCHEMA_VERSION)).toBe(2);
      const transaction = migratedDatabase.transaction(RECORDS_STORE, 'readonly');
      const done = transactionDone(transaction);
      const rows = await requestResult(
        transaction.objectStore(RECORDS_STORE).getAll() as IDBRequest<StoredRecordRow[]>,
      );
      await done;
      await expect(
        decodeRecordRow(rows[0]!, 2, {
          crypto: cryptoApi,
          indexKey,
          keyProvider: keyProvider(dataKey),
        }),
      ).resolves.toMatchObject({ body: { localDate: '2031-02-04' } });
    } finally {
      migratedDatabase.close();
    }
  });

  it('keeps an encrypted recovery snapshot on migration failure and retries after clearing the lock marker', async () => {
    const databaseName = 'synthetic-migration-failure';
    const { dataKey, indexKey } = await keys();
    await seedVersionZero(databaseName, dataKey, indexKey);
    const failing: Migration = {
      from: 0,
      to: 1,
      migrate() {
        throw new Error('synthetic migration transform failure');
      },
    };

    await expect(runner(databaseName, dataKey, indexKey, [failing]).run()).resolves.toEqual({
      status: 'failed',
      from: 0,
      snapshotKept: true,
    });

    const database = await openDatabase({ databaseName, initialSchemaVersion: 1 });
    try {
      expect(await readMetaValue(database, META_SCHEMA_VERSION)).toBe(0);
      expect(await readMetaValue(database, META_MIGRATION_PENDING)).toBe(false);
      const transaction = database.transaction(SNAPSHOTS_STORE, 'readonly');
      const done = transactionDone(transaction);
      const snapshots = await requestResult(transaction.objectStore(SNAPSHOTS_STORE).getAll());
      await done;
      expect(snapshots).toHaveLength(1);
    } finally {
      database.close();
    }

    await expect(runner(databaseName, dataKey, indexKey).run()).resolves.toEqual({
      status: 'migrated',
      from: 0,
      to: 1,
    });
    expect(writeEvents).toEqual(['begin', 'release', 'begin', 'release']);
  });

  it('returns read-only-newer-schema without attempting a write migration', async () => {
    const databaseName = 'synthetic-migration-newer';
    const database = await openDatabase({
      databaseName,
      version: 2,
      initialSchemaVersion: 1,
    });
    database.close();
    const { dataKey, indexKey } = await keys();

    await expect(runner(databaseName, dataKey, indexKey).run()).resolves.toEqual({
      status: 'read_only_newer_schema',
      stored: 2,
      code: 1,
    });
    expect(writeEvents).toEqual(['begin', 'release']);
  });

  it('refuses a newer stored schema and clears a stale pending marker on the next safe start', async () => {
    const newerName = 'synthetic-migration-newer-stored-version';
    const newerDatabase = await openDatabase({
      databaseName: newerName,
      initialSchemaVersion: 1,
    });
    await writeMetaValue(newerDatabase, META_SCHEMA_VERSION, 2);
    newerDatabase.close();
    const { dataKey, indexKey } = await keys();
    await expect(runner(newerName, dataKey, indexKey).run()).resolves.toEqual({
      status: 'read_only_newer_schema',
      stored: 2,
      code: 1,
    });

    const pendingName = 'synthetic-migration-stale-pending-marker';
    const pendingDatabase = await openDatabase({
      databaseName: pendingName,
      initialSchemaVersion: 1,
    });
    await writeMetaValue(pendingDatabase, META_MIGRATION_PENDING, {
      attemptId: 'synthetic-abandoned-attempt',
      from: 0,
      to: 1,
    });
    pendingDatabase.close();
    await expect(runner(pendingName, dataKey, indexKey).run()).resolves.toEqual({
      status: 'up_to_date',
      schemaVersion: 1,
    });
    const recovered = await openDatabase({
      databaseName: pendingName,
      initialSchemaVersion: 1,
    });
    try {
      expect(await readMetaValue(recovered, META_MIGRATION_PENDING)).toBe(false);
    } finally {
      recovered.close();
    }
  });

  it('fails before starting an attempt when a previously validated step list no longer covers the stored version', async () => {
    const databaseName = 'synthetic-migration-step-list-changed';
    const { dataKey, indexKey } = await keys();
    await seedVersionZero(databaseName, dataKey, indexKey);
    const mutableSteps: Migration[] = [migration];
    const configured = runner(databaseName, dataKey, indexKey, mutableSteps);
    mutableSteps.splice(0, 1);

    await expect(configured.run()).rejects.toThrow('Missing contiguous migration 0 -> 1');
    expect(writeEvents).toEqual(['begin', 'release']);
  });

  it('reports an unsupported environment before acquiring a migration lease when Web Locks are absent', async () => {
    vi.stubGlobal('navigator', {});
    const { dataKey, indexKey } = await keys();

    await expect(
      runner('synthetic-migration-no-locks', dataKey, indexKey).run(),
    ).rejects.toMatchObject({
      name: 'NotSupportedError',
      message: 'The Web Locks API is required for safe schema migrations',
    });
    expect(writeEvents).toEqual([]);
  });
});
