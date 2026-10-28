import type { CryptoApi } from '../../contracts/crypto.ts';
import type { LogicalId } from '../../contracts/brand.ts';
import type {
  LogicalRecord,
  Migration,
  MigrationOutcome,
  Migrations,
  StoredRecordRow,
} from '../../contracts/store.ts';
import {
  decodeRecordRow,
  encodeRecordRow,
  migrationSnapshotAad,
  type RecordKeyProvider,
} from '../store/codec.ts';
import {
  notifySchemaChanged,
  openDatabase,
  openSchemaDatabase,
  readMetaValue,
  requestResult,
  transactionDone,
} from '../store/idb.ts';
import {
  DATABASE_NAME,
  META_MIGRATION_COMPLETED,
  META_MIGRATION_PENDING,
  isMigrationPending,
  META_SCHEMA_VERSION,
  META_STORE,
  RECORDS_STORE,
  SCHEMA_VERSION,
  SNAPSHOTS_STORE,
  type MetaRow,
  type SnapshotRow,
} from '../store/schema.ts';
import type { UpdateWriteLeaseCoordinator } from '../store/store.ts';
import { utf8 } from '../../crypto/primitives/encoding.ts';

export interface MigrationRunnerOptions {
  readonly databaseName?: string;
  readonly schemaVersion?: number;
  readonly steps: readonly Migration[];
  readonly crypto: CryptoApi;
  readonly indexKey: CryptoKey;
  readonly keyProvider: RecordKeyProvider;
  readonly writeCoordinator: UpdateWriteLeaseCoordinator;
  readonly onBlocked?: (from: number, to: number) => void;
}

export type SchemaVersionDecision = 'up_to_date' | 'migrate' | 'newer';

export function decideSchemaVersion(
  databaseVersion: number,
  storedSchemaVersion: number,
  codeSchemaVersion: number,
): SchemaVersionDecision {
  if (
    storedSchemaVersion > codeSchemaVersion ||
    (codeSchemaVersion > 0 && databaseVersion > codeSchemaVersion)
  ) {
    return 'newer';
  }
  return storedSchemaVersion < codeSchemaVersion ? 'migrate' : 'up_to_date';
}
export function applyMigrationSteps(
  records: readonly LogicalRecord[],
  from: number,
  to: number,
  steps: readonly Migration[],
): readonly LogicalRecord[] {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to < from) {
    throw new RangeError('Invalid migration version range');
  }
  let current = from;
  let result = records;
  while (current < to) {
    const step = steps.find((candidate) => candidate.from === current);
    if (!step || step.to !== current + 1) {
      throw new Error(`Missing contiguous migration ${current} -> ${current + 1}`);
    }
    result = step.migrate(result);
    current = step.to;
  }
  return result;
}

function validateSteps(steps: readonly Migration[], schemaVersion: number): void {
  const sorted = [...steps].sort((a, b) => a.from - b.from);
  for (let index = 0; index < sorted.length; index += 1) {
    const step = sorted[index];
    if (!step || step.to !== step.from + 1 || (index > 0 && step.from !== sorted[index - 1]?.to)) {
      throw new Error('Migration steps must be ordered, contiguous vN -> vN+1 functions');
    }
  }
  if (sorted.length > 0 && sorted[sorted.length - 1]?.to !== schemaVersion) {
    throw new Error('Migration steps must end at the code schema version');
  }
}

async function getRecords(database: IDBDatabase): Promise<readonly StoredRecordRow[]> {
  const transaction = database.transaction(RECORDS_STORE, 'readonly');
  const done = transactionDone(transaction);
  const rows = await requestResult(
    transaction.objectStore(RECORDS_STORE).getAll() as IDBRequest<StoredRecordRow[]>,
  );
  await done;
  return rows;
}

async function setMigrationPending(
  database: IDBDatabase,
  attemptId: string,
  from: number,
  to: number,
): Promise<void> {
  const transaction = database.transaction(META_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const meta = transaction.objectStore(META_STORE);
  const current = await requestResult(
    meta.get(META_MIGRATION_PENDING) as IDBRequest<MetaRow | undefined>,
  );
  if (isMigrationPending(current?.value)) {
    transaction.abort();
    await done.catch(() => undefined);
    throw new Error('A schema migration is already in progress');
  }
  meta.put({
    key: META_MIGRATION_PENDING,
    value: { attemptId, from, to },
  } satisfies MetaRow);
  await done;
}

async function clearMigrationPending(database: IDBDatabase): Promise<void> {
  const transaction = database.transaction(META_STORE, 'readwrite');
  const done = transactionDone(transaction);
  transaction
    .objectStore(META_STORE)
    .put({ key: META_MIGRATION_PENDING, value: false } satisfies MetaRow);
  await done;
}

async function saveSnapshot(
  database: IDBDatabase,
  from: number,
  to: number,
  records: readonly LogicalRecord[],
  options: MigrationRunnerOptions,
): Promise<void> {
  const logicalId = `migration-snapshot:${from}:${to}` as LogicalId;
  const id = await options.crypto.opaqueId(options.indexKey, logicalId);
  const aad = migrationSnapshotAad(id, from);
  const payload = utf8(JSON.stringify({ from, to, records }));
  const box = await options.crypto.seal(options.keyProvider.snapshotKey, payload, aad);
  const transaction = database.transaction(SNAPSHOTS_STORE, 'readwrite');
  const done = transactionDone(transaction);
  transaction
    .objectStore(SNAPSHOTS_STORE)
    .put({ id, iv: box.iv, ct: box.ct } satisfies SnapshotRow);
  await done;
}

async function clearSnapshotsAfterSuccessfulStart(database: IDBDatabase): Promise<void> {
  const transaction = database.transaction([META_STORE, SNAPSHOTS_STORE], 'readwrite');
  const done = transactionDone(transaction);
  const meta = transaction.objectStore(META_STORE);
  const rows = await requestResult(
    meta.get(META_MIGRATION_COMPLETED) as IDBRequest<MetaRow | undefined>,
  );
  if (rows?.value !== undefined) {
    transaction.objectStore(SNAPSHOTS_STORE).clear();
    meta.delete(META_MIGRATION_COMPLETED);
  }
  await done;
}

async function prepareStep(
  database: IDBDatabase,
  step: Migration,
  options: MigrationRunnerOptions,
  onSnapshotSaved: () => void,
): Promise<{
  readonly previous: readonly LogicalRecord[];
  readonly nextRows: readonly StoredRecordRow[];
}> {
  const rows = await getRecords(database);
  const from = step.from;
  const previous = await Promise.all(
    rows.map((row) =>
      decodeRecordRow(row, from, {
        crypto: options.crypto,
        indexKey: options.indexKey,
        keyProvider: options.keyProvider,
      }),
    ),
  );
  await saveSnapshot(database, step.from, step.to, previous, options);
  onSnapshotSaved();
  const migrated = step.migrate(previous);
  const nextRows = await Promise.all(
    migrated.map((record) => encodeRecordRow(record, step.to, options)),
  );
  return { previous, nextRows };
}

async function applyStep(
  database: IDBDatabase,
  step: Migration,
  nextRows: readonly StoredRecordRow[],
  options: MigrationRunnerOptions,
): Promise<IDBDatabase> {
  const blocked = () => options.onBlocked?.(step.from, step.to);
  if (database.version < step.to) {
    database.close();
    const upgraded = await openDatabase({
      databaseName: options.databaseName ?? DATABASE_NAME,
      version: step.to,
      initialSchemaVersion: options.schemaVersion ?? SCHEMA_VERSION,
      onBlocked: blocked,
      onUpgrade: (upgradeDb, transaction) => {
        const records = transaction.objectStore(RECORDS_STORE);
        records.clear();
        for (const row of nextRows) records.put(row);
        const meta = transaction.objectStore(META_STORE);
        meta.put({ key: META_SCHEMA_VERSION, value: step.to } satisfies MetaRow);
        meta.put({ key: META_MIGRATION_PENDING, value: false } satisfies MetaRow);
        meta.put({ key: META_MIGRATION_COMPLETED, value: step.to } satisfies MetaRow);
      },
    });
    return upgraded;
  }

  const transaction = database.transaction([META_STORE, RECORDS_STORE], 'readwrite');
  const done = transactionDone(transaction);
  try {
    const records = transaction.objectStore(RECORDS_STORE);
    records.clear();
    for (const row of nextRows) records.put(row);
    const meta = transaction.objectStore(META_STORE);
    meta.put({ key: META_SCHEMA_VERSION, value: step.to } satisfies MetaRow);
    meta.put({ key: META_MIGRATION_PENDING, value: false } satisfies MetaRow);
    meta.put({ key: META_MIGRATION_COMPLETED, value: step.to } satisfies MetaRow);
    await done;
    notifySchemaChanged(options.databaseName ?? DATABASE_NAME, step.to);
    return database;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // It may already have completed or aborted.
    }
    await done.catch(() => undefined);
    throw error;
  }
}

async function clearPendingAfterFailure(
  databaseName: string,
  existing: IDBDatabase | undefined,
  initialSchemaVersion: number,
): Promise<void> {
  if (existing) {
    try {
      await clearMigrationPending(existing);
      return;
    } catch {
      // A failed versionchange may have closed this connection; reopen below.
    }
  }
  let reopened: IDBDatabase | undefined;
  try {
    reopened = await openDatabase({ databaseName, initialSchemaVersion });
    await clearMigrationPending(reopened);
  } catch {
    // The failed upgrade transaction may have rolled back the lock marker already.
  } finally {
    reopened?.close();
  }
}

interface MigrationLockManager {
  request<T>(
    name: string,
    options: { readonly mode: 'exclusive' },
    callback: () => Promise<T>,
  ): Promise<T>;
}

function withMigrationLock<T>(databaseName: string, operation: () => Promise<T>): Promise<T> {
  const lockManager = (globalThis.navigator as Navigator & { locks?: MigrationLockManager }).locks;
  if (!lockManager) {
    return Promise.reject(
      new DOMException(
        'The Web Locks API is required for safe schema migrations',
        'NotSupportedError',
      ),
    );
  }
  return lockManager.request(
    `flo:db-store:migration:${databaseName}`,
    { mode: 'exclusive' },
    operation,
  );
}

function createMigrationAttemptId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createMigrationRunner(options: MigrationRunnerOptions): Migrations {
  const schemaVersion = options.schemaVersion ?? SCHEMA_VERSION;
  const databaseName = options.databaseName ?? DATABASE_NAME;
  validateSteps(options.steps, schemaVersion);

  async function runLocked(): Promise<MigrationOutcome> {
    const attemptId = createMigrationAttemptId();
    let database: IDBDatabase | undefined;
    let releaseLease: (() => void) | undefined;
    let pendingVersion: number | undefined;
    let pendingSnapshotSaved = false;
    try {
      releaseLease = options.writeCoordinator.beginWrite();
      database = await openSchemaDatabase(databaseName, schemaVersion);
      const storedValue = await readMetaValue<number>(database, META_SCHEMA_VERSION);
      const storedVersion =
        typeof storedValue === 'number' && Number.isSafeInteger(storedValue)
          ? storedValue
          : database.version;
      const decision = decideSchemaVersion(database.version, storedVersion, schemaVersion);
      if (decision === 'newer') {
        database.close();
        return {
          status: 'read_only_newer_schema',
          stored: Math.max(database.version, storedVersion),
          code: schemaVersion,
        };
      }
      const pending = await readMetaValue<unknown>(database, META_MIGRATION_PENDING);
      if (isMigrationPending(pending)) await clearMigrationPending(database);
      if (storedVersion === schemaVersion) {
        await clearSnapshotsAfterSuccessfulStart(database);
        database.close();
        return { status: 'up_to_date', schemaVersion };
      }
      if (decision === 'migrate' && storedVersion > schemaVersion) {
        database.close();
        return { status: 'read_only_newer_schema', stored: storedVersion, code: schemaVersion };
      }

      const from = storedVersion;
      const neededSteps = options.steps.filter(
        (step) => step.from >= from && step.to <= schemaVersion,
      );
      let checkVersion = from;
      while (checkVersion < schemaVersion) {
        const next = neededSteps.find((candidate) => candidate.from === checkVersion);
        if (!next || next.to !== checkVersion + 1)
          throw new Error(`Missing contiguous migration ${checkVersion} -> ${checkVersion + 1}`);
        checkVersion = next.to;
      }
      let currentVersion = from;
      while (currentVersion < schemaVersion) {
        const step = neededSteps.find((candidate) => candidate.from === currentVersion);
        if (!step) throw new Error(`Missing contiguous migration from schema ${currentVersion}`);
        pendingSnapshotSaved = false;
        await setMigrationPending(database, attemptId, step.from, step.to);
        pendingVersion = step.from;
        const prepared = await prepareStep(database, step, options, () => {
          pendingSnapshotSaved = true;
        });
        database = await applyStep(database, step, prepared.nextRows, options);
        currentVersion = step.to;
        pendingVersion = undefined;
        pendingSnapshotSaved = false;
      }
      database.close();
      return { status: 'migrated', from, to: schemaVersion };
    } catch (error) {
      if (pendingVersion !== undefined) {
        await clearPendingAfterFailure(databaseName, database, schemaVersion);
      }
      if (database && database.version > schemaVersion) {
        const stored = await readMetaValue<number>(database, META_SCHEMA_VERSION).catch(
          () => database?.version ?? schemaVersion,
        );
        database.close();
        return {
          status: 'read_only_newer_schema',
          stored: stored ?? schemaVersion,
          code: schemaVersion,
        };
      }
      if (database && !database.objectStoreNames.length) database.close();
      if (pendingVersion !== undefined && pendingSnapshotSaved) {
        return { status: 'failed', from: pendingVersion, snapshotKept: true };
      }
      throw error;
    } finally {
      database?.close();
      releaseLease?.();
    }
  }

  return {
    steps: options.steps,
    schemaVersion,
    run(): Promise<MigrationOutcome> {
      return withMigrationLock(databaseName, runLocked);
    },
  };
}
