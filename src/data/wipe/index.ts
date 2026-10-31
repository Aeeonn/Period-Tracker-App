import type { WrappedKey } from '../../contracts/crypto.ts';
import { encodeBase64Url } from '../../crypto/primitives/encoding.ts';
import { randomBytes } from '../../crypto/primitives/webcrypto.ts';
import { LOCK_META_KEY, type LockConfiguration } from '../../lock/core/persistence.ts';
import { DATABASE_NAME, META_STORE, type MetaRow } from '../store/schema.ts';
import { openDatabase, requestResult, transactionDone } from '../store/idb.ts';

export const DELETE_ALL_REQUEST_EVENT = 'flo:delete-all-request';

export const WIPE_STEPS = [
  'Crypto-erasure',
  'IndexedDB databases',
  'OPFS',
  'Cache Storage',
  'localStorage',
  'sessionStorage',
  'service workers',
] as const;

export type WipeStep = (typeof WIPE_STEPS)[number];

export interface LocalWipeResult {
  readonly success: boolean;
  readonly failures: readonly WipeStep[];
}

export interface LocalWipeOperations {
  readonly eraseKeyMaterial: () => Promise<void>;
  readonly deleteIndexedDbDatabases: () => Promise<void>;
  readonly clearOpfs: () => Promise<void>;
  readonly clearCacheStorage: () => Promise<void>;
  readonly clearLocalStorage: () => Promise<void>;
  readonly clearSessionStorage: () => Promise<void>;
  readonly unregisterServiceWorkers: () => Promise<void>;
}

function randomWrappedKey(): WrappedKey {
  return {
    iv: encodeBase64Url(randomBytes(12)),
    ct: encodeBase64Url(randomBytes(48)),
  };
}

function overwrittenLockConfiguration(): LockConfiguration {
  return {
    version: 1,
    passphrase: {
      salt: encodeBase64Url(randomBytes(16)),
      iterations: 600_000,
      wrapped: randomWrappedKey(),
    },
    recoveryCode: {
      salt: encodeBase64Url(randomBytes(16)),
      wrapped: randomWrappedKey(),
    },
  };
}

async function eraseLockMetadata(): Promise<void> {
  if (typeof globalThis.indexedDB === 'undefined') {
    throw new Error('IndexedDB is unavailable.');
  }

  const database = await openDatabase({
    databaseName: DATABASE_NAME,
    initialSchemaVersion: 1,
  });
  try {
    const readTransaction = database.transaction(META_STORE, 'readonly');
    const readDone = transactionDone(readTransaction);
    const existing = await requestResult(
      readTransaction.objectStore(META_STORE).get(LOCK_META_KEY) as IDBRequest<MetaRow | undefined>,
    );
    await readDone;
    if (!existing) return;

    const overwriteTransaction = database.transaction(META_STORE, 'readwrite');
    const overwriteDone = transactionDone(overwriteTransaction);
    overwriteTransaction.objectStore(META_STORE).put({
      key: LOCK_META_KEY,
      value: overwrittenLockConfiguration(),
    } satisfies MetaRow);
    await overwriteDone;

    const deleteTransaction = database.transaction(META_STORE, 'readwrite');
    const deleteDone = transactionDone(deleteTransaction);
    deleteTransaction.objectStore(META_STORE).delete(LOCK_META_KEY);
    await deleteDone;
  } finally {
    database.close();
  }
}

function deleteDatabase(factory: IDBFactory, name: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.addEventListener('success', () => resolve(), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new DOMException('Database deletion failed', 'UnknownError')),
      { once: true },
    );
    request.addEventListener(
      'blocked',
      () => reject(new DOMException('Database deletion was blocked', 'BlockedError')),
      { once: true },
    );
  });
}

async function deleteAllDatabases(): Promise<void> {
  if (typeof globalThis.indexedDB === 'undefined') {
    throw new Error('IndexedDB is unavailable.');
  }
  const factory = globalThis.indexedDB;
  let names: string[] = [DATABASE_NAME];
  let inventoryComplete = true;
  try {
    if (typeof factory.databases !== 'function') {
      inventoryComplete = false;
    } else {
      const databases = await factory.databases();
      names = [
        ...new Set([...databases.flatMap((database) => database.name ?? []), DATABASE_NAME]),
      ];
    }
  } catch {
    inventoryComplete = false;
  }

  let deletionFailed = false;
  for (const name of names) {
    try {
      await deleteDatabase(factory, name);
    } catch {
      deletionFailed = true;
    }
  }
  if (!inventoryComplete || deletionFailed) {
    throw new Error('Not every IndexedDB database could be confirmed deleted.');
  }
}

async function clearOpfsStorage(): Promise<void> {
  const getDirectory = globalThis.navigator?.storage?.getDirectory;
  if (typeof getDirectory !== 'function') throw new Error('OPFS is unavailable.');
  const root = await getDirectory.call(globalThis.navigator.storage);
  const names: string[] = [];
  for await (const name of root.keys()) names.push(name);

  let deletionFailed = false;
  for (const name of names) {
    try {
      await root.removeEntry(name, { recursive: true });
    } catch {
      deletionFailed = true;
    }
  }
  if (deletionFailed) throw new Error('Some OPFS entries could not be removed.');
}

async function clearAppCaches(): Promise<void> {
  if (typeof globalThis.caches === 'undefined') throw new Error('Cache Storage is unavailable.');
  const names = (await globalThis.caches.keys()).filter((name) => name.startsWith('flo-static-'));
  let deletionFailed = false;
  for (const name of names) {
    try {
      await globalThis.caches.delete(name);
    } catch {
      deletionFailed = true;
    }
  }
  if (deletionFailed) throw new Error('Some app caches could not be removed.');
}

function clearLocalStorage(): void {
  if (typeof globalThis.localStorage === 'undefined')
    throw new Error('localStorage is unavailable.');
  globalThis.localStorage.clear();
}

function clearSessionStorage(): void {
  if (typeof globalThis.sessionStorage === 'undefined') {
    throw new Error('sessionStorage is unavailable.');
  }
  globalThis.sessionStorage.clear();
}

async function unregisterAllServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in globalThis.navigator)) {
    throw new Error('Service workers are unavailable.');
  }
  const registrations = await globalThis.navigator.serviceWorker.getRegistrations();
  let unregisterFailed = false;
  for (const registration of registrations) {
    try {
      if (!(await registration.unregister())) unregisterFailed = true;
    } catch {
      unregisterFailed = true;
    }
  }
  if (unregisterFailed) throw new Error('Some service workers could not be unregistered.');
}

function browserOperations(): LocalWipeOperations {
  return {
    eraseKeyMaterial: eraseLockMetadata,
    deleteIndexedDbDatabases: deleteAllDatabases,
    clearOpfs: clearOpfsStorage,
    clearCacheStorage: clearAppCaches,
    clearLocalStorage: async () => clearLocalStorage(),
    clearSessionStorage: async () => clearSessionStorage(),
    unregisterServiceWorkers: unregisterAllServiceWorkers,
  };
}

export async function runLocalDataWipe(
  operations: LocalWipeOperations = browserOperations(),
): Promise<LocalWipeResult> {
  const actions: readonly (readonly [WipeStep, () => Promise<void>])[] = [
    ['Crypto-erasure', operations.eraseKeyMaterial],
    ['IndexedDB databases', operations.deleteIndexedDbDatabases],
    ['OPFS', operations.clearOpfs],
    ['Cache Storage', operations.clearCacheStorage],
    ['localStorage', operations.clearLocalStorage],
    ['sessionStorage', operations.clearSessionStorage],
    ['service workers', operations.unregisterServiceWorkers],
  ];
  const failures: WipeStep[] = [];
  for (const [step, action] of actions) {
    try {
      await action();
    } catch {
      failures.push(step);
    }
  }
  return { success: failures.length === 0, failures };
}
