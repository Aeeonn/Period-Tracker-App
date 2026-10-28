import type { LogicalId } from '../../../src/contracts/brand.ts';
import type { EntityName } from '../../../src/contracts/entities.ts';
import type { LogicalRecord, Migration, MigrationOutcome } from '../../../src/contracts/store.ts';
import type { LocalDate } from '../../../src/contracts/localdate.ts';
import { createCryptoApi } from '../../../src/crypto/primitives/index.ts';
import { createMigrationRunner } from '../../../src/data/migrations/index.ts';
import { openRecordStore, type OpenRecordStore } from '../../../src/data/store/store.ts';
import type { RecordKeyProvider } from '../../../src/data/store/codec.ts';
import { transactionDone } from '../../../src/data/store/idb.ts';
import { createUpdateWriteGate, type UpdateWriteGate } from '../../../src/sw/client.ts';
import schemaV0 from '../../fixtures/schema/v0.json';

declare global {
  interface Window {
    floDbTest: FixtureApi;
  }
}

const cryptoApi = createCryptoApi();
const fixture = schemaV0 as unknown as {
  readonly synthetic: true;
  readonly canary: string;
  readonly nextDate: LocalDate;
  readonly record: LogicalRecord;
};
const canary = fixture.canary;
const dataKeyPromise = crypto.subtle.importKey(
  'raw',
  new Uint8Array(32).fill(17),
  'AES-GCM',
  false,
  ['encrypt', 'decrypt'],
);
const indexKeyPromise = crypto.subtle.importKey(
  'raw',
  new Uint8Array(32).fill(29),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign'],
);

export interface FixtureApi {
  open(databaseName: string, schemaVersion: number): Promise<string>;
  close(): void;
  put(record: LogicalRecord): Promise<void>;
  get(logicalId: string): Promise<LogicalRecord | undefined>;
  getEntity(entity: EntityName, logicalId: string): Promise<LogicalRecord | undefined>;
  list(): Promise<readonly LogicalRecord[]>;
  rawDump(databaseName?: string): Promise<string>;
  seedNewer(databaseName: string): Promise<void>;
  runMigration(
    databaseName: string,
    schemaVersion: number,
    failWrite?: boolean,
    failMigrateAt?: number,
  ): Promise<MigrationOutcome>;
  setMigrationPending(databaseName: string): Promise<void>;
  setSchemaVersionWithoutNotification(databaseName: string, version: number): Promise<void>;
  startPausedMigration(databaseName: string, schemaVersion: number): void;
  migrationPreparationReached(): boolean;
  releaseMigrationPreparation(): Promise<MigrationOutcome | undefined>;
  migrationFailure(): string | undefined;
  holdRawConnection(): Promise<void>;
  releaseRawConnection(): void;
  startHeldWrite(record: LogicalRecord): Promise<void>;
  releaseHeldWrite(): Promise<void>;
  simulateVersionChange(newVersion: number): void;
  startPrepare(): void;
  prepareSettled(): boolean;
  prepareReady(): boolean;
  startUpgrade(databaseName: string, schemaVersion: number): void;
  migrationSettled(): boolean;
  migrationResult(): MigrationOutcome | undefined;
  blockedCount(): number;
  reloadNeeded(): boolean;
  reloadVersion(): number | null | undefined;
  currentDatabaseVersion(): number | undefined;
}

const dataKey = await dataKeyPromise;
const indexKey = await indexKeyPromise;
let migrationPause: Promise<void> | undefined;
let releaseMigrationPause: (() => void) | undefined;
let migrationPreparationWasReached = false;

const keyProvider: RecordKeyProvider = {
  snapshotKey: dataKey,
  forWrite: () => ({ key: dataKey, epoch: 0 }),
  async forRead() {
    if (migrationPause) {
      migrationPreparationWasReached = true;
      await migrationPause;
    }
    return [{ key: dataKey, epoch: 0 }];
  },
};

let store: OpenRecordStore | undefined;
let gate: UpdateWriteGate | undefined;
let reloadNeeded = false;
let reloadVersion: number | null | undefined;
let blockedCount = 0;
let heldRelease: (() => void) | undefined;
let heldWrite: Promise<void> | undefined;
let heldEntered: (() => void) | undefined;
let prepareResult: unknown;
let migrationPromise: Promise<MigrationOutcome> | undefined;
let migrationOutcome: MigrationOutcome | undefined;
let migrationError: string | undefined;
let rawBlocker: IDBDatabase | undefined;

function createGate(): UpdateWriteGate {
  return createUpdateWriteGate({ onPreparing() {}, onLocked() {}, onCancelled() {} });
}

function steps(failMigrateAt?: number): readonly Migration[] {
  return [
    {
      from: 0,
      to: 1,
      migrate(records) {
        if (failMigrateAt === 0) throw new Error('synthetic injected migration failure');
        return records.map((record) => {
          if (record.entity !== 'DayBundle' || record.deleted) return record;
          return {
            ...record,
            body: { ...record.body, localDate: fixture.nextDate },
          } as LogicalRecord;
        });
      },
    },
    {
      from: 1,
      to: 2,
      migrate(records) {
        if (failMigrateAt === 1) throw new Error('synthetic injected migration failure');
        return records.map((record) => {
          if (record.entity !== 'DayBundle' || record.deleted) return record;
          return {
            ...record,
            body: { ...record.body, localDate: fixture.nextDate },
          } as LogicalRecord;
        });
      },
    },
  ];
}

async function openHandle(databaseName: string, schemaVersion: number): Promise<OpenRecordStore> {
  store?.close();
  gate = createGate();
  reloadNeeded = false;
  reloadVersion = undefined;
  store = await openRecordStore({
    databaseName,
    schemaVersion,
    crypto: cryptoApi,
    indexKey,
    keyProvider,
    writeCoordinator: gate,
    onReloadNeeded: (newVersion) => {
      reloadNeeded = true;
      reloadVersion = newVersion;
    },
  });
  return store;
}

const api: FixtureApi = {
  async open(databaseName, schemaVersion) {
    return (await openHandle(databaseName, schemaVersion)).status;
  },
  close() {
    store?.close();
    store = undefined;
  },
  async put(record) {
    if (!store) throw new Error('Open the database before writing');
    await store.put(record);
  },
  async get(logicalId) {
    if (!store) throw new Error('Open the database before reading');
    return store.get('DayBundle', logicalId as LogicalId);
  },
  async getEntity(entity, logicalId) {
    if (!store) throw new Error('Open the database before reading');
    return store.get(entity, logicalId as LogicalId);
  },
  async list() {
    if (!store) throw new Error('Open the database before listing');
    return store.list('DayBundle', { includeDeleted: true });
  },
  async rawDump(databaseName = 'app') {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const names = Array.from(database.objectStoreNames);
    const transaction = database.transaction(names, 'readonly');
    const done = transactionDone(transaction);
    const entries = await Promise.all(
      names.map(async (name) => {
        const request = transaction.objectStore(name).getAll();
        const values = await new Promise<unknown[]>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result as unknown[]);
          request.onerror = () => reject(request.error);
        });
        return [name, values] as const;
      }),
    );
    await done;
    database.close();
    return JSON.stringify(Object.fromEntries(entries));
  },
  async seedNewer(databaseName) {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        const transaction = request.transaction;
        if (!transaction) throw new Error('Missing versionchange transaction');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('records')) {
          const records = db.createObjectStore('records', { keyPath: 'id' });
          records.createIndex('type', 'type');
        }
        if (!db.objectStoreNames.contains('outbox'))
          db.createObjectStore('outbox', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('snapshots'))
          db.createObjectStore('snapshots', { keyPath: 'id' });
        transaction.objectStore('meta').put({ key: 'schemaVersion', value: 2 });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    database.close();
  },
  async runMigration(databaseName, schemaVersion, failWrite = false, failMigrateAt) {
    gate = createGate();
    const runner = createMigrationRunner({
      databaseName,
      schemaVersion,
      steps: steps(failMigrateAt).filter((step) => step.to <= schemaVersion),
      crypto: cryptoApi,
      indexKey,
      keyProvider,
      writeCoordinator: gate,
    });
    if (!failWrite) return runner.run();

    const objectStorePrototype = IDBObjectStore.prototype as unknown as {
      put: (this: IDBObjectStore, value: unknown, key?: IDBValidKey) => IDBRequest<IDBValidKey>;
    };
    const originalPut = objectStorePrototype.put;
    let recordPuts = 0;
    objectStorePrototype.put = function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ): IDBRequest<IDBValidKey> {
      if (this.name === 'records' && recordPuts === 1) {
        throw new DOMException('synthetic injected IndexedDB write failure', 'UnknownError');
      }
      if (this.name === 'records') recordPuts += 1;
      return Reflect.apply(
        originalPut,
        this,
        key === undefined ? [value] : [value, key],
      ) as IDBRequest<IDBValidKey>;
    };
    try {
      return await runner.run();
    } finally {
      objectStorePrototype.put = originalPut;
    }
  },
  async setMigrationPending(databaseName) {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction('meta', 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore('meta').put({ key: 'migrationPending', value: true });
    await done;
    database.close();
  },
  async setSchemaVersionWithoutNotification(databaseName, version) {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const transaction = database.transaction('meta', 'readwrite');
    const done = transactionDone(transaction);
    transaction.objectStore('meta').put({ key: 'schemaVersion', value: version });
    await done;
    database.close();
  },
  startPausedMigration(databaseName, schemaVersion) {
    migrationPreparationWasReached = false;
    migrationOutcome = undefined;
    migrationError = undefined;
    migrationPause = new Promise<void>((resolve) => {
      releaseMigrationPause = resolve;
    });
    gate = createGate();
    const runner = createMigrationRunner({
      databaseName,
      schemaVersion,
      steps: steps().filter((step) => step.to <= schemaVersion),
      crypto: cryptoApi,
      indexKey,
      keyProvider,
      writeCoordinator: gate,
    });
    migrationPromise = runner.run().then((result) => {
      migrationOutcome = result;
      return result;
    });
    void migrationPromise.catch((error: unknown) => {
      migrationError = error instanceof Error ? error.message : String(error);
    });
  },
  migrationPreparationReached() {
    return migrationPreparationWasReached;
  },
  async releaseMigrationPreparation() {
    releaseMigrationPause?.();
    releaseMigrationPause = undefined;
    migrationPause = undefined;
    try {
      return await migrationPromise;
    } catch {
      return undefined;
    }
  },
  migrationFailure() {
    return migrationError;
  },
  async holdRawConnection() {
    rawBlocker = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('app');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  },
  releaseRawConnection() {
    rawBlocker?.close();
    rawBlocker = undefined;
  },
  async startHeldWrite(record) {
    if (!store) throw new Error('Open the database before writing');
    const entered = new Promise<void>((resolve) => {
      heldEntered = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      heldRelease = resolve;
    });
    heldWrite = store.transaction(async (transaction) => {
      await transaction.put(record);
      heldEntered?.();
      await hold;
    });
    await entered;
  },
  async releaseHeldWrite() {
    heldRelease?.();
    await heldWrite;
    heldRelease = undefined;
    heldWrite = undefined;
  },
  simulateVersionChange(newVersion) {
    if (!store) throw new Error('Open the database before simulating versionchange');
    const database = (store as unknown as { database: IDBDatabase }).database;
    const event = new Event('versionchange');
    Object.defineProperty(event, 'newVersion', { value: newVersion });
    database.dispatchEvent(event);
  },
  startPrepare() {
    if (!gate) throw new Error('The update gate is unavailable');
    void gate.prepareForRestart().then((result) => {
      prepareResult = result;
    });
  },
  prepareSettled() {
    return prepareResult !== undefined;
  },
  prepareReady() {
    return (
      typeof prepareResult === 'object' &&
      prepareResult !== null &&
      'writesBlocked' in prepareResult
    );
  },
  startUpgrade(databaseName, schemaVersion) {
    migrationOutcome = undefined;
    migrationError = undefined;
    gate = createGate();
    const runner = createMigrationRunner({
      databaseName,
      schemaVersion,
      steps: steps().filter((step) => step.to <= schemaVersion),
      crypto: cryptoApi,
      indexKey,
      keyProvider,
      writeCoordinator: gate,
      onBlocked() {
        blockedCount += 1;
      },
    });
    migrationPromise = runner.run().then((result) => {
      migrationOutcome = result;
      return result;
    });
    void migrationPromise.catch((error: unknown) => {
      migrationError = error instanceof Error ? error.message : String(error);
      migrationOutcome = undefined;
    });
  },
  migrationSettled() {
    return migrationOutcome !== undefined;
  },
  migrationResult() {
    return migrationOutcome;
  },
  blockedCount() {
    return blockedCount;
  },
  reloadNeeded() {
    return reloadNeeded;
  },
  reloadVersion() {
    return reloadVersion;
  },
  currentDatabaseVersion() {
    return store?.databaseVersion;
  },
};

window.floDbTest = api;
const status = document.querySelector('#status');
if (status) status.textContent = fixture.synthetic ? `${canary} ready` : 'invalid fixture';
