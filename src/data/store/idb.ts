import {
  DATABASE_NAME,
  ensureDatabaseSchema,
  META_SCHEMA_VERSION,
  META_STORE,
  type MetaRow,
} from './schema.ts';

export interface OpenDatabaseOptions {
  readonly databaseName?: string;
  readonly version?: number;
  readonly initialSchemaVersion: number;
  readonly onBlocked?: () => void;
  readonly onUpgrade?: (
    database: IDBDatabase,
    transaction: IDBTransaction,
    oldVersion: number,
  ) => void;
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new DOMException('IndexedDB request failed', 'UnknownError')),
      { once: true },
    );
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () =>
        reject(
          transaction.error ?? new DOMException('IndexedDB transaction aborted', 'AbortError'),
        ),
      { once: true },
    );
  });
}

export function openDatabase(
  options: OpenDatabaseOptions = { initialSchemaVersion: 1 },
): Promise<IDBDatabase> {
  const databaseName = options.databaseName ?? DATABASE_NAME;
  const request =
    options.version === undefined
      ? indexedDB.open(databaseName)
      : indexedDB.open(databaseName, options.version);

  return new Promise<IDBDatabase>((resolve, reject) => {
    request.addEventListener('upgradeneeded', (event) => {
      const transaction = request.transaction;
      if (!transaction) {
        reject(new DOMException('Missing IndexedDB versionchange transaction', 'UnknownError'));
        return;
      }
      try {
        ensureDatabaseSchema(request.result, transaction, options.initialSchemaVersion);
        if ((event as IDBVersionChangeEvent).oldVersion === 0) {
          transaction.objectStore(META_STORE).put({
            key: 'schemaVersion',
            value: options.initialSchemaVersion,
          } satisfies MetaRow);
        }
        options.onUpgrade?.(
          request.result,
          transaction,
          (event as IDBVersionChangeEvent).oldVersion,
        );
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The versionchange transaction may already have aborted.
        }
        reject(error);
      }
    });
    request.addEventListener('blocked', () => options.onBlocked?.());
    request.addEventListener('error', () =>
      reject(request.error ?? new DOMException('Unable to open IndexedDB', 'UnknownError')),
    );
    request.addEventListener('success', () => resolve(request.result));
  });
}

export const DB_SCHEMA_CHANGE_CHANNEL = 'flo:db-schema-change';

export async function openSchemaDatabase(
  databaseName: string,
  schemaVersion: number,
): Promise<IDBDatabase> {
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 0) {
    throw new RangeError('Schema version must be a non-negative safe integer');
  }

  let created = false;
  const database = await openDatabase({
    databaseName,
    initialSchemaVersion: schemaVersion === 0 ? 0 : 1,
    onUpgrade: (_upgradeDb, _transaction, oldVersion) => {
      created = oldVersion === 0;
    },
  });
  if (!created || schemaVersion <= database.version) return database;

  database.close();
  return openDatabase({
    databaseName,
    version: schemaVersion,
    initialSchemaVersion: schemaVersion,
    onUpgrade: (_upgradeDb, transaction) => {
      transaction.objectStore(META_STORE).put({
        key: META_SCHEMA_VERSION,
        value: schemaVersion,
      } satisfies MetaRow);
    },
  });
}

export function notifySchemaChanged(databaseName: string, schemaVersion: number): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(DB_SCHEMA_CHANGE_CHANNEL);
    channel.postMessage({ databaseName, schemaVersion });
    channel.close();
  } catch {
    // The transaction-level schema check remains the safety fallback.
  }
}

export async function readMetaValue<T>(database: IDBDatabase, key: string): Promise<T | undefined> {
  const transaction = database.transaction(META_STORE, 'readonly');
  const done = transactionDone(transaction);
  const row = await requestResult(
    transaction.objectStore(META_STORE).get(key) as IDBRequest<MetaRow | undefined>,
  );
  await done;
  return row?.value as T | undefined;
}

export async function writeMetaValue(
  database: IDBDatabase,
  key: string,
  value: unknown,
): Promise<void> {
  const transaction = database.transaction(META_STORE, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(META_STORE).put({ key, value } satisfies MetaRow);
  await done;
}
