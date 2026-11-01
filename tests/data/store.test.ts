import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpaqueId, LogicalId, DeviceId } from '../../src/contracts/brand.ts';
import type { LogicalRecord, StoredRecordRow } from '../../src/contracts/store.ts';
import type { LocalDate } from '../../src/contracts/localdate.ts';
import { createCryptoApi } from '../../src/crypto/primitives/index.ts';
import { openDatabase, writeMetaValue } from '../../src/data/store/idb.ts';
import { META_SCHEMA_VERSION } from '../../src/data/store/schema.ts';
import { openRecordStore, type OpenRecordStore } from '../../src/data/store/store.ts';
import {
  encodeRecordRow,
  decodeRecordRow,
  type RecordKeyProvider,
} from '../../src/data/store/codec.ts';
import { persistStorage } from '../../src/data/store/storage-persistence.ts';

const cryptoApi = createCryptoApi();
const canary = 'SYNTHETIC-CANARY-P0-DB-73';

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

function makeRecord(): LogicalRecord {
  const deviceId = 'synthetic-device-p0' as DeviceId;
  return {
    entity: 'DayBundle',
    logicalId: 'synthetic-p0-store-day' as LogicalId,
    authorDevice: deviceId,
    hlc: { wallMs: 1740000000000, counter: 0, deviceId },
    deleted: false,
    body: {
      localDate: '2031-02-03' as LocalDate,
      flow: 'medium',
      notes: canary,
      fieldHlc: {},
    },
  } as LogicalRecord;
}

function keyProvider(dataKey: CryptoKey): RecordKeyProvider {
  return {
    snapshotKey: dataKey,
    forWrite: () => ({ key: dataKey, epoch: 0 }),
    forRead: () => [{ key: dataKey, epoch: 0 }],
  };
}

async function encryptedRow(
  dataKey: CryptoKey,
  payload: string,
  deleted = false,
): Promise<StoredRecordRow> {
  const id = 'synthetic-row-opaque-id' as OpaqueId;
  const box = await cryptoApi.seal(dataKey, new TextEncoder().encode(payload), {
    recordId: id,
    type: 'day',
    schemaVersion: 1,
    epoch: 0,
  });
  return { id, type: 'day', hlc: makeRecord().hlc, deleted, ...box };
}

describe('encrypted record codec', () => {
  it('uses a 128-bit opaque HMAC id and keeps logical fields inside ciphertext', async () => {
    const { dataKey, indexKey } = await keys();
    const options = { crypto: cryptoApi, indexKey, keyProvider: keyProvider(dataKey) };
    const record = makeRecord();
    const row = await encodeRecordRow(record, 1, options);

    expect(row.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(row.id).not.toContain(record.logicalId);
    expect(JSON.stringify(row)).not.toContain(canary);
    expect(JSON.stringify(row)).not.toContain('2031-02-03');
    expect(await decodeRecordRow(row, 1, options)).toEqual(record);
  });

  it('domain-separates opaque ids by entity', async () => {
    const { dataKey, indexKey } = await keys();
    const options = { crypto: cryptoApi, indexKey, keyProvider: keyProvider(dataKey) };
    const day = makeRecord();
    const override = { ...day, entity: 'PeriodOverride' } as unknown as LogicalRecord;

    const dayRow = await encodeRecordRow(day, 1, options);
    const overrideRow = await encodeRecordRow(override, 1, options);

    expect(dayRow.id).not.toBe(overrideRow.id);
  });

  it('rejects ciphertext modified outside the sealed envelope', async () => {
    const { dataKey, indexKey } = await keys();
    const options = { crypto: cryptoApi, indexKey, keyProvider: keyProvider(dataKey) };
    const row = await encodeRecordRow(makeRecord(), 1, options);
    const tampered = {
      ...row,
      ct: `${row.ct.slice(0, -1)}${row.ct.endsWith('A') ? 'B' : 'A'}` as typeof row.ct,
    };

    await expect(decodeRecordRow(tampered, 1, options)).rejects.toThrow(
      'Record authentication failed',
    );
  });

  it('rejects authenticated rows with malformed JSON, identity, or a missing body', async () => {
    const { dataKey, indexKey } = await keys();
    const options = { crypto: cryptoApi, indexKey, keyProvider: keyProvider(dataKey) };
    const malformedRows = [
      await encryptedRow(dataKey, '{'),
      await encryptedRow(
        dataKey,
        JSON.stringify({
          entity: 'UnknownEntity',
          logicalId: 'synthetic-id',
          authorDevice: 'synthetic-device',
          body: {},
        }),
      ),
      await encryptedRow(
        dataKey,
        JSON.stringify({
          entity: 'DayBundle',
          logicalId: 'synthetic-id',
          authorDevice: 'synthetic-device',
        }),
      ),
    ];

    await expect(decodeRecordRow(malformedRows[0]!, 1, options)).rejects.toBeInstanceOf(
      SyntaxError,
    );
    await expect(decodeRecordRow(malformedRows[1]!, 1, options)).rejects.toThrow(
      'Invalid encrypted record identity',
    );
    await expect(decodeRecordRow(malformedRows[2]!, 1, options)).rejects.toThrow(
      'Encrypted record body is missing',
    );
  });

  it('decodes authenticated tombstones and rejects record-type substitution', async () => {
    const { dataKey, indexKey } = await keys();
    const options = { crypto: cryptoApi, indexKey, keyProvider: keyProvider(dataKey) };
    const identity = {
      entity: 'DayBundle',
      logicalId: 'synthetic-deleted-record',
      authorDevice: 'synthetic-device',
    };
    const tombstone = await decodeRecordRow(
      await encryptedRow(dataKey, JSON.stringify(identity), true),
      1,
      options,
    );
    expect(tombstone).toMatchObject({
      entity: 'DayBundle',
      logicalId: identity.logicalId,
      deleted: true,
    });

    const substituted = await encryptedRow(
      dataKey,
      JSON.stringify({
        ...identity,
        entity: 'Profile',
        body: {},
      }),
    );
    await expect(decodeRecordRow(substituted, 1, options)).rejects.toThrow(
      'Encrypted record type mismatch',
    );
  });

  it('fails closed when no candidate decryption keys are available', async () => {
    const { dataKey, indexKey } = await keys();
    const row = await encodeRecordRow(makeRecord(), 1, {
      crypto: cryptoApi,
      indexKey,
      keyProvider: keyProvider(dataKey),
    });
    const noReadKeys: RecordKeyProvider = {
      ...keyProvider(dataKey),
      forRead: () => [],
    };

    await expect(
      decodeRecordRow(row, 1, { crypto: cryptoApi, indexKey, keyProvider: noReadKeys }),
    ).rejects.toMatchObject({ name: 'DataError' });
  });
});

describe('storage persistence helper', () => {
  it('reports unsupported storage without requesting persistence', async () => {
    await expect(persistStorage(undefined)).resolves.toEqual({
      supported: false,
      persisted: false,
      requested: false,
    });
  });

  describe('encrypted IndexedDB record store lifecycle', () => {
    const stores: OpenRecordStore[] = [];

    beforeEach(() => {
      vi.stubGlobal('indexedDB', new IDBFactory());
      vi.stubGlobal('BroadcastChannel', undefined);
      stores.length = 0;
    });

    afterEach(() => {
      for (const store of stores.splice(0)) store.close();
      vi.unstubAllGlobals();
    });

    async function openStore(
      writeCoordinator = { beginWrite: () => () => undefined },
      databaseName = 'synthetic-record-store',
      schemaVersion = 1,
      onReloadNeeded?: (newVersion: number | null) => void,
    ): Promise<OpenRecordStore> {
      const { dataKey, indexKey } = await keys();
      const store = await openRecordStore({
        databaseName,
        schemaVersion,
        crypto: cryptoApi,
        indexKey,
        keyProvider: keyProvider(dataKey),
        writeCoordinator,
        ...(onReloadNeeded === undefined ? {} : { onReloadNeeded }),
      });
      stores.push(store);
      return store;
    }

    it('commits transactional writes and reads, then stores a visible tombstone on delete', async () => {
      const events: string[] = [];
      const store = await openStore({
        beginWrite() {
          events.push('begin');
          return () => {
            events.push('release');
          };
        },
      });
      const record = makeRecord();

      await expect(
        store.transaction(async (transaction) => {
          await expect(
            transaction.get('DayBundle', 'synthetic-missing-day' as LogicalId),
          ).resolves.toBeUndefined();
          await transaction.put(record);
          await expect(transaction.list('DayBundle')).resolves.toEqual([record]);
          return transaction.get('DayBundle', record.logicalId);
        }),
      ).resolves.toEqual(record);
      expect(await store.get('DayBundle', record.logicalId)).toEqual(record);
      expect(await store.list('DayBundle')).toEqual([record]);
      await store.put(record);

      await store.delete('DayBundle', record.logicalId, record.hlc);
      await store.transaction(async (transaction) => {
        await expect(transaction.list('DayBundle')).resolves.toEqual([]);
        await expect(transaction.list('DayBundle', { includeDeleted: true })).resolves.toMatchObject([
          { entity: 'DayBundle', logicalId: record.logicalId, deleted: true },
        ]);
      });

      expect(await store.list('DayBundle')).toEqual([]);
      expect(await store.list('DayBundle', { includeDeleted: true })).toMatchObject([
        { entity: 'DayBundle', logicalId: record.logicalId, deleted: true },
      ]);
      expect(events).toEqual([
        'begin',
        'release',
        'begin',
        'release',
        'begin',
        'release',
        'begin',
        'release',
        'begin',
        'release',
      ]);
    });

    it('rejects a write when a migration marker appears after the store was opened', async () => {
      const databaseName = 'synthetic-store-migration-race';
      const events: string[] = [];
      const store = await openStore(
        {
          beginWrite() {
            events.push('begin');
            return () => {
              events.push('release');
            };
          },
        },
        databaseName,
      );
      const database = await openDatabase({ databaseName, initialSchemaVersion: 1 });
      await writeMetaValue(database, 'migrationPending', {
        attemptId: 'synthetic-concurrent-migration',
        from: 1,
        to: 2,
      });
      database.close();

      await expect(store.put(makeRecord())).rejects.toMatchObject({
        name: 'MigrationInProgressError',
        message: 'A schema migration is in progress. Retry after the database is ready.',
      });
      expect(await store.get('DayBundle', makeRecord().logicalId)).toBeUndefined();
      expect(events).toEqual(['begin', 'release', 'begin', 'release']);
    });

    it('aborts all writes after a transaction callback failure and releases the write lease', async () => {
      const events: string[] = [];
      const store = await openStore({
        beginWrite() {
          events.push('begin');
          return () => {
            events.push('release');
          };
        },
      });
      const record = makeRecord();
      const failure = new Error('synthetic transaction callback failure');

      await expect(
        store.transaction(async (transaction) => {
          await transaction.put(record);
          throw failure;
        }),
      ).rejects.toBe(failure);

      expect(await store.get('DayBundle', record.logicalId)).toBeUndefined();
      expect(events).toEqual(['begin', 'release', 'begin', 'release']);
    });

    it('uses a read-only status for a newer database and rejects writes with the status code', async () => {
      const database = await openDatabase({
        databaseName: 'synthetic-newer-schema',
        version: 2,
        initialSchemaVersion: 1,
      });
      database.close();

      const store = await openStore(undefined, 'synthetic-newer-schema');

      expect(store.status).toBe('NEWER_SCHEMA');
      expect(store.readOnly).toBe(true);
      await expect(store.put(makeRecord())).rejects.toMatchObject({
        name: 'StoreWriteUnavailableError',
        code: 'NEWER_SCHEMA',
      });
    });

    it('closes idempotently and rejects later reads without accessing the database', async () => {
      const store = await openStore();
      store.close();
      store.close();

      await expect(store.get('DayBundle', makeRecord().logicalId)).rejects.toMatchObject({
        name: 'InvalidStateError',
        message: 'Database connection is closing',
      });
      await expect(store.list('DayBundle')).rejects.toMatchObject({
        name: 'InvalidStateError',
      });
    });

    it('keeps older and in-progress schemas read-only with explicit write status codes', async () => {
      const olderName = 'synthetic-store-migration-required';
      const olderDatabase = await openDatabase({
        databaseName: olderName,
        initialSchemaVersion: 1,
      });
      olderDatabase.close();
      const older = await openStore(undefined, olderName, 2);
      expect(older.status).toBe('MIGRATION_REQUIRED');
      expect(older.readOnly).toBe(true);
      await expect(older.put(makeRecord())).rejects.toMatchObject({
        name: 'StoreWriteUnavailableError',
        code: 'MIGRATION_REQUIRED',
      });
      older.close();

      const pendingName = 'synthetic-store-migration-in-progress';
      const pendingDatabase = await openDatabase({
        databaseName: pendingName,
        initialSchemaVersion: 1,
      });
      await writeMetaValue(pendingDatabase, 'migrationPending', {
        attemptId: 'synthetic-attempt',
        from: 0,
        to: 1,
      });
      pendingDatabase.close();
      const pending = await openStore(undefined, pendingName);
      expect(pending.status).toBe('MIGRATION_IN_PROGRESS');
      expect(pending.readOnly).toBe(true);
      await expect(pending.put(makeRecord())).rejects.toMatchObject({
        name: 'StoreWriteUnavailableError',
        code: 'MIGRATION_IN_PROGRESS',
      });
      pending.close();
    });

    it('signals a version reload only after an active transaction finishes', async () => {
      const databaseName = 'synthetic-store-versionchange-drain';
      const onReloadNeeded = vi.fn();
      const store = await openStore(
        { beginWrite: () => () => undefined },
        databaseName,
        1,
        onReloadNeeded,
      );
      let announceWrite: (() => void) | undefined;
      const writeStarted = new Promise<void>((resolve) => {
        announceWrite = resolve;
      });
      let releaseTransaction: (() => void) | undefined;
      const transactionGate = new Promise<void>((resolve) => {
        releaseTransaction = resolve;
      });
      const write = store.transaction(async (transaction) => {
        await transaction.put(makeRecord());
        announceWrite?.();
        await transactionGate;
        return 'committed';
      });
      await writeStarted;

      const upgrade = openDatabase({
        databaseName,
        version: 2,
        initialSchemaVersion: 1,
      });
      await Promise.resolve();
      expect(onReloadNeeded).not.toHaveBeenCalled();
      releaseTransaction?.();
      await expect(write).resolves.toBe('committed');
      const upgraded = await upgrade;
      expect(upgraded.version).toBe(2);
      upgraded.close();
      expect(onReloadNeeded).toHaveBeenCalledOnce();
      expect(onReloadNeeded).toHaveBeenCalledWith(2);

      await expect(store.get('DayBundle', makeRecord().logicalId)).rejects.toMatchObject({
        name: 'InvalidStateError',
      });
    });

    it('closes and signals on a matching cross-context schema change only', async () => {
      class TestBroadcastChannel extends EventTarget {
        static readonly channels: TestBroadcastChannel[] = [];
        readonly name: string;
        closed = false;

        constructor(name: string) {
          super();
          this.name = name;
          TestBroadcastChannel.channels.push(this);
        }

        close(): void {
          this.closed = true;
        }

        send(data: unknown): void {
          this.dispatchEvent(new MessageEvent('message', { data }));
        }
      }
      vi.stubGlobal('BroadcastChannel', TestBroadcastChannel);
      const databaseName = 'synthetic-store-broadcast-schema-change';
      const onReloadNeeded = vi.fn();
      const store = await openStore(undefined, databaseName, 1, onReloadNeeded);
      const channel = TestBroadcastChannel.channels.at(-1);
      if (!channel) throw new Error('Expected the store schema-change channel');

      channel.send({ databaseName: 'synthetic-other-database', schemaVersion: 2 });
      channel.send({ databaseName, schemaVersion: 1 });
      channel.send({ databaseName, schemaVersion: 1.5 });
      expect(onReloadNeeded).not.toHaveBeenCalled();

      channel.send({ databaseName, schemaVersion: 2 });
      expect(onReloadNeeded).toHaveBeenCalledOnce();
      expect(onReloadNeeded).toHaveBeenCalledWith(2);
      expect(channel.closed).toBe(true);
      await expect(store.get('DayBundle', makeRecord().logicalId)).rejects.toMatchObject({
        name: 'InvalidStateError',
      });
    });

    it('fails closed when a write observes newer stored schema metadata', async () => {
      const databaseName = 'synthetic-store-newer-stored-schema';
      const onReloadNeeded = vi.fn();
      const store = await openStore(undefined, databaseName, 1, onReloadNeeded);
      const database = await openDatabase({ databaseName, initialSchemaVersion: 1 });
      await writeMetaValue(database, META_SCHEMA_VERSION, 2);
      database.close();

      await expect(store.transaction(async () => 'must-not-commit')).rejects.toMatchObject({
        name: 'InvalidStateError',
        message: 'Database schema changed; reload required',
      });
      expect(onReloadNeeded).toHaveBeenCalledOnce();
      expect(onReloadNeeded).toHaveBeenCalledWith(2);
      await expect(store.get('DayBundle', makeRecord().logicalId)).rejects.toMatchObject({
        name: 'InvalidStateError',
      });
    });
  });

  it('requests persistence and reports the resulting browser status', async () => {
    let persisted = false;
    const storage = {
      async persisted() {
        return persisted;
      },
      async persist() {
        persisted = true;
        return true;
      },
    };

    await expect(persistStorage(storage)).resolves.toEqual({
      supported: true,
      persisted: true,
      requested: true,
    });
  });

  it('requests persistence even when the initial status probe throws', async () => {
    let probes = 0;
    let requests = 0;
    const storage = {
      async persisted() {
        probes += 1;
        if (probes === 1) throw new Error('synthetic status probe failure');
        return false;
      },
      async persist() {
        requests += 1;
        return true;
      },
    };

    await expect(persistStorage(storage)).resolves.toEqual({
      supported: true,
      persisted: false,
      requested: true,
    });
    expect(requests).toBe(1);
    expect(probes).toBe(2);
  });

  it('does not request storage again when it is already persistent', async () => {
    let requests = 0;
    const storage = {
      async persisted() {
        return true;
      },
      async persist() {
        requests += 1;
        return true;
      },
    };

    await expect(persistStorage(storage)).resolves.toEqual({
      supported: true,
      persisted: true,
      requested: false,
    });
    expect(requests).toBe(0);
  });

  it('reports the resulting persisted status even when the browser request rejects', async () => {
    let probes = 0;
    const storage = {
      async persisted() {
        probes += 1;
        return probes > 1;
      },
      async persist() {
        throw new Error('synthetic persistence permission denial');
      },
    };

    await expect(persistStorage(storage)).resolves.toEqual({
      supported: true,
      persisted: true,
      requested: true,
    });
    expect(probes).toBe(2);
  });
});
