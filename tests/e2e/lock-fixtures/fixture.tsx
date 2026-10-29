import { render } from 'preact';
import type { LockReason } from '../../../src/contracts/lock.ts';
import type { LogicalRecord } from '../../../src/contracts/store.ts';
import { createCryptoApi } from '../../../src/crypto/primitives/index.ts';
import { openDatabase, requestResult, transactionDone } from '../../../src/data/store/idb.ts';
import { openRecordStore } from '../../../src/data/store/store.ts';
import { META_STORE, RECORDS_STORE, type MetaRow } from '../../../src/data/store/schema.ts';
import {
  attachAutoLock,
  createLockService,
  createLockStoreLifecycle,
  IndexedDbLockPersistence,
} from '../../../src/lock/core/index.ts';
import type { LockConfiguration } from '../../../src/lock/core/persistence.ts';
import { LockScreen } from '../../../src/ui/screens/lock/core/lock-screen.tsx';

const databaseName = new URLSearchParams(location.search).get('db') ?? 'synthetic-lock-fixture';
const timeoutMs = Number(new URLSearchParams(location.search).get('timeout')) || 60_000;
const service = createLockService({ databaseName });
const persistence = new IndexedDbLockPersistence(databaseName);
const stopAutoLock = attachAutoLock(service, { timeoutMs });
const lifecycle = createLockStoreLifecycle(service, (keys) =>
  openRecordStore({
    databaseName,
    crypto: createCryptoApi(),
    indexKey: keys.indexKey,
    keyProvider: keys.keyProvider,
    writeCoordinator: { beginWrite: () => () => undefined },
  }),
);

export interface LockFixtureApi {
  state(): Promise<string>;
  lock(reason?: LockReason): void;
  openStore(): Promise<void>;
  saveSyntheticRecord(record: LogicalRecord): Promise<void>;
  rawRecords(): Promise<string>;
  rawDump(): Promise<string>;
  lockConfiguration(): Promise<LockConfiguration | undefined>;
  attemptSetup(passphrase: string): Promise<boolean>;
  lockOnNextMetaCommitComplete(): void;
  hasOpenStore(): boolean;
}

declare global {
  interface Window {
    floLockDemo: LockFixtureApi;
  }
}

window.floLockDemo = {
  async state() {
    return `${await service.setupState()}:${service.isUnlocked() ? 'unlocked' : 'locked'}`;
  },
  lock(reason = 'manual') {
    service.lock(reason);
  },
  async openStore() {
    await lifecycle.open();
  },
  async saveSyntheticRecord(record) {
    const store = await lifecycle.open();
    await store.put(record);
  },
  async rawRecords() {
    const database = await openDatabase({ databaseName, initialSchemaVersion: 1 });
    try {
      const transaction = database.transaction(RECORDS_STORE, 'readonly');
      const done = transactionDone(transaction);
      const rows = await requestResult(transaction.objectStore(RECORDS_STORE).getAll());
      await done;
      return JSON.stringify(rows);
    } finally {
      database.close();
    }
  },
  async rawDump() {
    const database = await openDatabase({ databaseName, initialSchemaVersion: 1 });
    try {
      const names = Array.from(database.objectStoreNames);
      const transaction = database.transaction(names, 'readonly');
      const done = transactionDone(transaction);
      const rows = await Promise.all(
        names.map((name) => requestResult(transaction.objectStore(name).getAll())),
      );
      await done;
      const dump: Record<string, unknown> = {};
      names.forEach((name, index) => {
        dump[name] = rows[index] ?? [];
      });
      const metadata = dump[META_STORE] as MetaRow[];
      if (!metadata.every((row) => typeof row.key === 'string' && 'value' in row)) {
        throw new TypeError('Synthetic metadata dump is malformed');
      }
      return JSON.stringify(dump);
    } finally {
      database.close();
    }
  },
  async lockConfiguration() {
    return persistence.read();
  },
  async attemptSetup(passphrase) {
    try {
      await service.setup(passphrase);
      return true;
    } catch {
      return false;
    }
  },
  lockOnNextMetaCommitComplete() {
    const prototype = IDBDatabase.prototype;
    const original = prototype.transaction;
    let intercepted = false;
    const wrapped = function (
      this: IDBDatabase,
      storeNames: string | string[],
      mode?: IDBTransactionMode,
      options?: IDBTransactionOptions,
    ): IDBTransaction {
      const transaction = Reflect.apply(original, this, [
        storeNames,
        mode,
        options,
      ]) as IDBTransaction;
      const names = typeof storeNames === 'string' ? [storeNames] : Array.from(storeNames);
      if (!intercepted && mode === 'readwrite' && names.includes(META_STORE)) {
        intercepted = true;
        transaction.addEventListener(
          'complete',
          () => {
            service.lock('manual');
            Object.defineProperty(prototype, 'transaction', {
              configurable: true,
              writable: true,
              value: original,
            });
          },
          { once: true },
        );
      }
      return transaction;
    };
    Object.defineProperty(prototype, 'transaction', {
      configurable: true,
      writable: true,
      value: wrapped,
    });
  },
  hasOpenStore() {
    return lifecycle.current !== null;
  },
};

render(<LockScreen service={service} />, document.getElementById('root')!);
window.addEventListener('pagehide', () => {
  lifecycle.dispose();
  stopAutoLock();
});
