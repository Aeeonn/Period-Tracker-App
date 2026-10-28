import type { RecordType } from '../../contracts/enums.ts';

export const DATABASE_NAME = 'app';
export const SCHEMA_VERSION = 1;
export const META_STORE = 'meta';
export const RECORDS_STORE = 'records';
export const OUTBOX_STORE = 'outbox';
export const SNAPSHOTS_STORE = 'snapshots';
export const RECORD_TYPE_INDEX = 'type';
export const META_SCHEMA_VERSION = 'schemaVersion';
export const META_MIGRATION_PENDING = 'migrationPending';
export const META_MIGRATION_COMPLETED = 'migrationCompletedVersion';
export const KEEPALIVE_META_KEY = '__transaction_keepalive__';

export interface MetaRow {
  readonly key: string;
  readonly value: unknown;
}

export interface SnapshotRow {
  readonly id: string;
  readonly iv: string;
  readonly ct: string;
}

export function ensureDatabaseSchema(
  database: IDBDatabase,
  transaction: IDBTransaction,
  initialSchemaVersion: number,
): void {
  const meta = database.objectStoreNames.contains(META_STORE)
    ? transaction.objectStore(META_STORE)
    : database.createObjectStore(META_STORE, { keyPath: 'key' });
  const records = database.objectStoreNames.contains(RECORDS_STORE)
    ? transaction.objectStore(RECORDS_STORE)
    : database.createObjectStore(RECORDS_STORE, { keyPath: 'id' });
  if (!records.indexNames.contains(RECORD_TYPE_INDEX)) {
    records.createIndex(RECORD_TYPE_INDEX, 'type', { unique: false });
  }
  if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
    database.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
  }
  if (!database.objectStoreNames.contains(SNAPSHOTS_STORE)) {
    database.createObjectStore(SNAPSHOTS_STORE, { keyPath: 'id' });
  }
  if (transaction.db.version === 1) {
    meta.put({ key: META_SCHEMA_VERSION, value: initialSchemaVersion } satisfies MetaRow);
  }
}

export function isMigrationPending(value: unknown): boolean {
  return value === true || (typeof value === 'object' && value !== null && 'attemptId' in value);
}

export function recordTypeIndex(type: RecordType): string {
  return type;
}
