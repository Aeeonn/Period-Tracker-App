import type { CryptoApi } from '../../contracts/crypto.ts';
import type { LogicalId, OpaqueId } from '../../contracts/brand.ts';
import type { EntityName } from '../../contracts/entities.ts';
import type {
  LogicalRecord,
  RecordStore,
  RecordTransaction,
  StoredRecordRow,
} from '../../contracts/store.ts';
import { ENTITY_RECORD_TYPE } from '../../contracts/store.ts';
import {
  decodeRecordRow,
  encodeRecordRow,
  recordIdentityInput,
  type RecordKeyProvider,
} from './codec.ts';
import {
  DB_SCHEMA_CHANGE_CHANNEL,
  openSchemaDatabase,
  requestResult,
  transactionDone,
} from './idb.ts';
import {
  DATABASE_NAME,
  KEEPALIVE_META_KEY,
  isMigrationPending,
  META_MIGRATION_PENDING,
  META_SCHEMA_VERSION,
  META_STORE,
  RECORDS_STORE,
  RECORD_TYPE_INDEX,
  SCHEMA_VERSION,
  type MetaRow,
} from './schema.ts';

export interface UpdateWriteLeaseCoordinator {
  beginWrite(): () => void;
}

export type RecordStoreStatus =
  'READY' | 'MIGRATION_REQUIRED' | 'MIGRATION_IN_PROGRESS' | 'NEWER_SCHEMA';

export interface RecordStoreOptions {
  readonly databaseName?: string;
  readonly schemaVersion?: number;
  readonly crypto: CryptoApi;
  readonly indexKey: CryptoKey;
  readonly keyProvider: RecordKeyProvider;
  readonly writeCoordinator: UpdateWriteLeaseCoordinator;
  readonly onReloadNeeded?: (newVersion: number | null) => void;
}

export interface OpenRecordStore extends RecordStore {
  readonly status: RecordStoreStatus;
  readonly schemaVersion: number;
  readonly databaseVersion: number;
  readonly readOnly: boolean;
  close(): void;
}

export class StoreWriteUnavailableError extends Error {
  readonly code: RecordStoreStatus;

  constructor(status: RecordStoreStatus) {
    super(status === 'NEWER_SCHEMA' ? 'NEWER_SCHEMA' : `Record store is ${status.toLowerCase()}`);
    this.name = 'StoreWriteUnavailableError';
    this.code = status;
  }
}

export class MigrationInProgressError extends Error {
  constructor() {
    super('A schema migration is in progress. Retry after the database is ready.');
    this.name = 'MigrationInProgressError';
  }
}

class EncryptedRecordStore implements OpenRecordStore {
  readonly status: RecordStoreStatus;
  readonly schemaVersion: number;
  readonly databaseVersion: number;
  readonly readOnly: boolean;
  private closing = false;
  private closed = false;
  private activeWrites = 0;
  private reloadSignalled = false;
  private pendingReloadVersion: number | null | undefined;
  private schemaChangeChannel: BroadcastChannel | undefined;

  constructor(
    private readonly database: IDBDatabase,
    private readonly options: Required<Pick<RecordStoreOptions, 'databaseName' | 'schemaVersion'>> &
      RecordStoreOptions,
    storedSchemaVersion: number,
    migrationPending: boolean,
    pendingVersionChange: number | null | undefined,
  ) {
    this.databaseVersion = database.version;
    this.schemaVersion = storedSchemaVersion;
    this.pendingReloadVersion = pendingVersionChange;
    this.status =
      (options.schemaVersion > 0 && database.version > options.schemaVersion) ||
      storedSchemaVersion > options.schemaVersion
        ? 'NEWER_SCHEMA'
        : migrationPending
          ? 'MIGRATION_IN_PROGRESS'
          : storedSchemaVersion < options.schemaVersion
            ? 'MIGRATION_REQUIRED'
            : 'READY';
    this.readOnly = this.status !== 'READY';
    if (pendingVersionChange !== undefined) this.closing = true;
    database.addEventListener('versionchange', (event) =>
      this.handleVersionChange(event as IDBVersionChangeEvent),
    );
    if (typeof BroadcastChannel !== 'undefined') {
      this.schemaChangeChannel = new BroadcastChannel(DB_SCHEMA_CHANGE_CHANNEL);
      this.schemaChangeChannel.addEventListener('message', (event: MessageEvent<unknown>) => {
        const message = event.data as { databaseName?: unknown; schemaVersion?: unknown } | null;
        if (
          message?.databaseName === options.databaseName &&
          typeof message.schemaVersion === 'number' &&
          Number.isSafeInteger(message.schemaVersion) &&
          message.schemaVersion > storedSchemaVersion
        ) {
          this.handleSchemaChange(message.schemaVersion);
        }
      });
    }
    if (pendingVersionChange !== undefined) this.signalReloadIfDrained();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.closing = true;
    this.schemaChangeChannel?.close();
    this.database.close();
  }

  async get<E extends EntityName>(
    entity: E,
    logicalId: LogicalId,
  ): Promise<LogicalRecord<E> | undefined> {
    this.assertOpen();
    const id = await this.options.crypto.opaqueId(
      this.options.indexKey,
      recordIdentityInput(entity, logicalId),
    );
    const transaction = this.database.transaction(RECORDS_STORE, 'readonly');
    const done = transactionDone(transaction);
    const row = await requestResult(
      transaction.objectStore(RECORDS_STORE).get(id) as IDBRequest<StoredRecordRow | undefined>,
    );
    await done;
    if (!row) return undefined;
    const record = await decodeRecordRow(row, this.schemaVersion, this.options);
    return record.entity === entity ? (record as LogicalRecord<E>) : undefined;
  }

  async put<E extends EntityName>(record: LogicalRecord<E>): Promise<void> {
    await this.transaction((transaction) => transaction.put(record));
  }

  async delete(entity: EntityName, logicalId: LogicalId, hlc: LogicalRecord['hlc']): Promise<void> {
    await this.transaction((transaction) => transaction.delete(entity, logicalId, hlc));
  }

  async list<E extends EntityName>(
    entity: E,
    options?: { readonly includeDeleted?: boolean },
  ): Promise<readonly LogicalRecord<E>[]> {
    this.assertOpen();
    const type = ENTITY_RECORD_TYPE[entity];
    const transaction = this.database.transaction(RECORDS_STORE, 'readonly');
    const done = transactionDone(transaction);
    const request = transaction.objectStore(RECORDS_STORE).index(RECORD_TYPE_INDEX).getAll(type);
    const rows = await requestResult(request as IDBRequest<StoredRecordRow[]>);
    await done;
    const records = await Promise.all(
      rows.map((row) => decodeRecordRow(row, this.schemaVersion, this.options)),
    );
    return records.filter(
      (record) => record.entity === entity && (options?.includeDeleted === true || !record.deleted),
    ) as unknown as readonly LogicalRecord<E>[];
  }

  async transaction<R>(work: (tx: RecordTransaction) => Promise<R>): Promise<R> {
    this.assertWritable();
    const releaseLease = this.options.writeCoordinator.beginWrite();
    let transaction: IDBTransaction | undefined;
    let done: Promise<void> | undefined;
    let pump = true;
    let scheduledOperations: Array<{ run(): void; reject(error: unknown): void }> = [];
    this.activeWrites += 1;
    try {
      this.assertWritable();
      transaction = this.database.transaction([META_STORE, RECORDS_STORE], 'readwrite');
      done = transactionDone(transaction);
      let transactionFailure: unknown;
      scheduledOperations = [];
      const rejectScheduledOperations = (error: unknown) => {
        transactionFailure = error;
        pump = false;
        for (const operation of scheduledOperations.splice(0)) operation.reject(error);
      };
      void done.catch(rejectScheduledOperations);
      const keepAlive = () => {
        if (!pump || !transaction) return;
        try {
          const request = transaction.objectStore(META_STORE).get(KEEPALIVE_META_KEY);
          request.addEventListener(
            'success',
            () => {
              for (const operation of scheduledOperations.splice(0)) operation.run();
              keepAlive();
            },
            { once: true },
          );
          request.addEventListener(
            'error',
            () => {
              rejectScheduledOperations(
                request.error ?? new DOMException('IndexedDB keepalive failed', 'UnknownError'),
              );
            },
            { once: true },
          );
        } catch (error) {
          rejectScheduledOperations(error);
        }
      };
      const inTransaction = <T>(operation: () => T): Promise<T> =>
        new Promise<T>((resolve, reject) => {
          if (!pump) {
            reject(
              transactionFailure ??
                new DOMException(
                  'IndexedDB transaction is no longer active',
                  'TransactionInactiveError',
                ),
            );
            return;
          }
          scheduledOperations.push({
            run() {
              try {
                resolve(operation());
              } catch (error) {
                reject(error);
              }
            },
            reject,
          });
        });
      keepAlive();

      const meta = transaction.objectStore(META_STORE);
      const [pending, schema] = await Promise.all([
        requestResult(
          meta.get(META_MIGRATION_PENDING) as IDBRequest<{ value?: unknown } | undefined>,
        ),
        requestResult(meta.get(META_SCHEMA_VERSION) as IDBRequest<{ value?: unknown } | undefined>),
      ]);
      if (isMigrationPending(pending?.value)) throw new MigrationInProgressError();
      const observedSchemaVersion =
        typeof schema?.value === 'number' && Number.isSafeInteger(schema.value)
          ? schema.value
          : this.database.version;
      if (observedSchemaVersion !== this.schemaVersion) {
        if (observedSchemaVersion > this.schemaVersion) {
          this.handleSchemaChange(observedSchemaVersion);
        }
        throw new DOMException('Database schema changed; reload required', 'InvalidStateError');
      }

      const records = transaction.objectStore(RECORDS_STORE);
      const { options: storeOptions, schemaVersion: activeSchemaVersion } = this;
      const api: RecordTransaction = {
        async get<E extends EntityName>(entity: E, logicalId: LogicalId) {
          const id = await storeOptions.crypto.opaqueId(
            storeOptions.indexKey,
            recordIdentityInput(entity, logicalId),
          );
          const row = await inTransaction(() =>
            requestResult(records.get(id) as IDBRequest<StoredRecordRow | undefined>),
          );
          if (!row) return undefined;
          const record = await decodeRecordRow(row, activeSchemaVersion, storeOptions);
          return record.entity === entity ? (record as LogicalRecord<E>) : undefined;
        },
        async put<E extends EntityName>(record: LogicalRecord<E>) {
          const row = await encodeRecordRow(
            record as LogicalRecord,
            activeSchemaVersion,
            storeOptions,
          );
          await inTransaction(() => requestResult(records.put(row)));
        },
        async delete(entity: EntityName, logicalId: LogicalId, hlc: LogicalRecord['hlc']) {
          const record: LogicalRecord = {
            entity,
            logicalId,
            authorDevice: hlc.deviceId,
            hlc,
            deleted: true,
          } as LogicalRecord;
          const row = await encodeRecordRow(
            record as LogicalRecord,
            activeSchemaVersion,
            storeOptions,
          );
          await inTransaction(() => requestResult(records.put(row)));
        },
        async list<E extends EntityName>(
          entity: E,
          listOptions?: { readonly includeDeleted?: boolean },
        ): Promise<readonly LogicalRecord<E>[]> {
          const rows = await inTransaction(() =>
            requestResult(
              records.index(RECORD_TYPE_INDEX).getAll(ENTITY_RECORD_TYPE[entity]) as IDBRequest<
                StoredRecordRow[]
              >,
            ),
          );
          const decoded = await Promise.all(
            rows.map((row) => decodeRecordRow(row, activeSchemaVersion, storeOptions)),
          );
          return decoded.filter(
            (record) =>
              record.entity === entity && (listOptions?.includeDeleted === true || !record.deleted),
          ) as unknown as readonly LogicalRecord<E>[];
        },
      };

      const result = await work(api);
      pump = false;
      await done;
      return result;
    } catch (error) {
      pump = false;
      for (const operation of scheduledOperations.splice(0)) operation.reject(error);
      try {
        transaction?.abort();
      } catch {
        // It may already have completed or aborted.
      }
      await done?.catch(() => undefined);
      throw error;
    } finally {
      pump = false;
      this.activeWrites -= 1;
      releaseLease();
      this.signalReloadIfDrained();
    }
  }

  private assertOpen(): void {
    if (this.closed || this.closing)
      throw new DOMException('Database connection is closing', 'InvalidStateError');
  }

  private assertWritable(): void {
    this.assertOpen();
    if (this.readOnly) throw new StoreWriteUnavailableError(this.status);
  }

  private handleVersionChange(event: IDBVersionChangeEvent): void {
    this.pendingReloadVersion = event.newVersion;
    this.closing = true;
    this.database.close();
    this.signalReloadIfDrained();
  }

  private handleSchemaChange(newVersion: number): void {
    this.pendingReloadVersion = newVersion;
    this.closing = true;
    this.schemaChangeChannel?.close();
    this.database.close();
    this.signalReloadIfDrained();
  }

  private signalReloadIfDrained(): void {
    if (
      !this.closing ||
      this.activeWrites !== 0 ||
      this.reloadSignalled ||
      this.pendingReloadVersion === undefined
    ) {
      return;
    }
    this.reloadSignalled = true;
    this.options.onReloadNeeded?.(this.pendingReloadVersion);
  }
}

export async function openRecordStore(options: RecordStoreOptions): Promise<OpenRecordStore> {
  const databaseName = options.databaseName ?? DATABASE_NAME;
  const schemaVersion = options.schemaVersion ?? SCHEMA_VERSION;
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 0) {
    throw new RangeError('Schema version must be a non-negative safe integer');
  }
  const releaseLease = options.writeCoordinator.beginWrite();
  let database: IDBDatabase;
  try {
    database = await openSchemaDatabase(databaseName, schemaVersion);
  } finally {
    releaseLease();
  }
  let pendingVersionChange: number | null | undefined;
  const onEarlyVersionChange = (event: Event) => {
    pendingVersionChange = (event as IDBVersionChangeEvent).newVersion;
    database.close();
  };
  database.addEventListener('versionchange', onEarlyVersionChange);
  try {
    const transaction = database.transaction(META_STORE, 'readonly');
    const done = transactionDone(transaction);
    void done.catch(() => undefined);
    const meta = transaction.objectStore(META_STORE);
    const storedRow = requestResult(
      meta.get(META_SCHEMA_VERSION) as IDBRequest<MetaRow | undefined>,
    );
    const pendingRow = requestResult(
      meta.get(META_MIGRATION_PENDING) as IDBRequest<MetaRow | undefined>,
    );
    const [stored, pending] = await Promise.all([storedRow, pendingRow]);
    await done;
    const storedSchemaVersion =
      typeof stored?.value === 'number' && Number.isSafeInteger(stored.value)
        ? stored.value
        : database.version;
    const opened = new EncryptedRecordStore(
      database,
      { ...options, databaseName, schemaVersion },
      storedSchemaVersion,
      isMigrationPending(pending?.value),
      pendingVersionChange,
    );
    database.removeEventListener('versionchange', onEarlyVersionChange);
    return opened;
  } catch (error) {
    database.removeEventListener('versionchange', onEarlyVersionChange);
    database.close();
    throw error;
  }
}

export type { OpaqueId };
