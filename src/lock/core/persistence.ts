import type { Base64Url } from '../../contracts/brand.ts';
import type { WrappedKey } from '../../contracts/crypto.ts';
import { DATABASE_NAME, META_STORE, type MetaRow } from '../../data/store/schema.ts';
import { openDatabase, requestResult } from '../../data/store/idb.ts';
import { decodeBase64Url } from '../../crypto/primitives/encoding.ts';

export const LOCK_META_KEY = 'lockConfiguration';

export interface LockConfiguration {
  readonly version: 1;
  readonly passphrase: {
    readonly salt: Base64Url;
    readonly iterations: number;
    readonly wrapped: WrappedKey;
  };
  readonly recoveryCode: {
    readonly salt: Base64Url;
    readonly wrapped: WrappedKey;
  };
}

export interface LockPersistence {
  read(): Promise<LockConfiguration | undefined>;
  commit(
    configuration: LockConfiguration,
    signal: AbortSignal,
    onCommitted: () => void,
  ): Promise<void>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isWrappedKey(value: unknown): value is WrappedKey {
  return isObject(value) && typeof value.iv === 'string' && typeof value.ct === 'string';
}

function validateConfiguration(value: unknown): LockConfiguration {
  if (!isObject(value) || value.version !== 1) {
    throw new DOMException('Lock metadata is invalid', 'DataError');
  }
  const passphrase = value.passphrase;
  const recoveryCode = value.recoveryCode;
  if (
    !isObject(passphrase) ||
    !isObject(recoveryCode) ||
    typeof passphrase.salt !== 'string' ||
    passphrase.iterations !== 600_000 ||
    !isWrappedKey(passphrase.wrapped) ||
    typeof recoveryCode.salt !== 'string' ||
    !isWrappedKey(recoveryCode.wrapped)
  ) {
    throw new DOMException('Lock metadata is invalid', 'DataError');
  }
  try {
    if (decodeBase64Url(passphrase.salt).length !== 16) throw new TypeError();
    if (decodeBase64Url(recoveryCode.salt).length !== 16) throw new TypeError();
  } catch {
    throw new DOMException('Lock metadata is invalid', 'DataError');
  }
  return value as unknown as LockConfiguration;
}

function abortError(): DOMException {
  return new DOMException('Lock operation was cancelled', 'AbortError');
}

export class IndexedDbLockPersistence implements LockPersistence {
  constructor(private readonly databaseName = DATABASE_NAME) {}

  async read(): Promise<LockConfiguration | undefined> {
    const database = await openDatabase({
      databaseName: this.databaseName,
      initialSchemaVersion: 1,
    });
    try {
      const transaction = database.transaction(META_STORE, 'readonly');
      const row = await requestResult(
        transaction.objectStore(META_STORE).get(LOCK_META_KEY) as IDBRequest<MetaRow | undefined>,
      );
      await new Promise<void>((resolve, reject) => {
        transaction.addEventListener('complete', () => resolve(), { once: true });
        transaction.addEventListener(
          'abort',
          () =>
            reject(transaction.error ?? new DOMException('Metadata read aborted', 'AbortError')),
          { once: true },
        );
      });
      return row === undefined ? undefined : validateConfiguration(row.value);
    } finally {
      database.close();
    }
  }

  async commit(
    configuration: LockConfiguration,
    signal: AbortSignal,
    onCommitted: () => void,
  ): Promise<void> {
    if (signal.aborted) throw abortError();
    const database = await openDatabase({
      databaseName: this.databaseName,
      initialSchemaVersion: 1,
    });
    try {
      if (signal.aborted) throw abortError();
      const transaction = database.transaction(META_STORE, 'readwrite');
      const abortTransaction = () => {
        try {
          transaction.abort();
        } catch {
          // A completed transaction has already won the commit race.
        }
      };
      signal.addEventListener('abort', abortTransaction, { once: true });
      let complete = false;
      const done = new Promise<void>((resolve, reject) => {
        transaction.addEventListener(
          'complete',
          () => {
            complete = true;
            onCommitted();
            resolve();
          },
          { once: true },
        );
        transaction.addEventListener(
          'abort',
          () =>
            reject(transaction.error ?? new DOMException('Metadata commit aborted', 'AbortError')),
          { once: true },
        );
        transaction.addEventListener(
          'error',
          () =>
            reject(transaction.error ?? new DOMException('Metadata commit failed', 'UnknownError')),
          { once: true },
        );
      });
      try {
        transaction.objectStore(META_STORE).put({
          key: LOCK_META_KEY,
          value: configuration,
        } satisfies MetaRow);
        if (signal.aborted) abortTransaction();
        await done;
      } catch (error) {
        if (complete) return;
        throw error;
      } finally {
        signal.removeEventListener('abort', abortTransaction);
      }
    } finally {
      database.close();
    }
  }
}
