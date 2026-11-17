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
  /** Optional Face ID unlock (SR-03): the LMK wrapped under HKDF(passkey PRF output, salt). */
  readonly passkey?: LockPasskeyWrap;
}

export interface LockPasskeyWrap {
  readonly credentialId: Base64Url;
  /** 32-byte WebAuthn PRF input. */
  readonly prfSalt: Base64Url;
  /** 16-byte HKDF salt. */
  readonly salt: Base64Url;
  readonly wrapped: WrappedKey;
}

const MAX_CREDENTIAL_ID_BYTES = 1023;

function isValidPasskeyWrap(value: unknown): boolean {
  if (
    !isObject(value) ||
    typeof value.credentialId !== 'string' ||
    typeof value.prfSalt !== 'string' ||
    typeof value.salt !== 'string' ||
    !isWrappedKey(value.wrapped)
  ) {
    return false;
  }
  try {
    const credentialId = decodeBase64Url(value.credentialId);
    return (
      credentialId.length > 0 &&
      credentialId.length <= MAX_CREDENTIAL_ID_BYTES &&
      decodeBase64Url(value.prfSalt).length === 32 &&
      decodeBase64Url(value.salt).length === 16
    );
  } catch {
    return false;
  }
}

export function isValidPasskeyCredentialLength(length: number): boolean {
  return length > 0 && length <= MAX_CREDENTIAL_ID_BYTES;
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

/**
 * Checks stored lock metadata. Exported so the damaged-passkey path can be
 * tested without a real IndexedDB.
 */
export function validateConfiguration(value: unknown): LockConfiguration {
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
  if (value.passkey !== undefined && !isValidPasskeyWrap(value.passkey)) {
    // A damaged Face ID wrap can unlock nothing, so it is ignored: the passkey method
    // stays closed while the passphrase and recovery code keep working (ADR-0016).
    // The next configuration write drops the damaged field.
    const withoutPasskey = { ...value };
    delete withoutPasskey.passkey;
    return withoutPasskey as unknown as LockConfiguration;
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
