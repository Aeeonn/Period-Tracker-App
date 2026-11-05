import type { LockService, RecoveryConfirmation } from '../contracts/lock.ts';
import { getWebCrypto } from '../crypto/primitives/webcrypto.ts';
import { openDatabase, requestResult, transactionDone } from '../data/store/idb.ts';
import {
  META_SCHEMA_VERSION,
  META_STORE,
  OUTBOX_STORE,
  PREVIEW_DATABASE_NAME,
  RECORDS_STORE,
  SNAPSHOTS_STORE,
} from '../data/store/schema.ts';

export { PREVIEW_DATABASE_NAME } from '../data/store/schema.ts';
export const PREVIEW_INITIALIZATION_LOCK_NAME = 'flo:unlocked-preview:initialization';
const CREDENTIAL_STORAGE_KEY = 'flo.unlocked-preview.credential.v1';
const CREDENTIAL_BYTES = 32;

export interface PreviewEnvironment {
  readonly DEV: boolean;
  readonly MODE: string;
  readonly VITE_FLO_UNLOCKED_PREVIEW?: string;
}

export function isUnlockedPreviewEnabled(
  environment: PreviewEnvironment = import.meta.env,
): boolean {
  return (
    (environment.DEV && environment.MODE === 'unlocked-preview') ||
    environment.VITE_FLO_UNLOCKED_PREVIEW === 'true'
  );
}

interface PreviewCredentialStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type PreviewBootstrapFailure =
  | 'cancelled'
  | 'lock_unavailable'
  | 'storage_unavailable'
  | 'state_unavailable'
  | 'inconsistent_state'
  | 'setup_failed'
  | 'unlock_failed';

export type PreviewBootstrapResult =
  | { readonly status: 'ready'; readonly firstRun: boolean }
  | { readonly status: 'error'; readonly reason: PreviewBootstrapFailure };

export interface UnlockedPreviewOptions {
  readonly storage?: PreviewCredentialStorage;
  readonly runExclusive?: <T>(
    name: string,
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ) => Promise<T>;
  readonly isFreshStore?: () => Promise<boolean>;
  readonly fillRandomValues?: (target: Uint8Array<ArrayBuffer>) => void;
  readonly signal?: AbortSignal;
}

interface SavedCredential {
  readonly version: 1;
  readonly credential: string;
}

function defaultStorage(): PreviewCredentialStorage {
  if (typeof globalThis.localStorage === 'undefined') {
    throw new DOMException('Preview credential storage is unavailable', 'NotSupportedError');
  }
  return globalThis.localStorage;
}

function runWithWebLock<T>(
  name: string,
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    return Promise.reject(
      new DOMException('Web Locks are required by the unlocked preview', 'NotSupportedError'),
    );
  }
  return navigator.locks.request(
    name,
    { mode: 'exclusive', ...(signal ? { signal } : {}) },
    operation,
  );
}

function parseCredential(value: string): SavedCredential | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    typeof candidate.credential !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(candidate.credential)
  ) {
    return null;
  }
  return { version: 1, credential: candidate.credential };
}

function makeCredential(fillRandomValues: (target: Uint8Array<ArrayBuffer>) => void): string {
  const bytes = new Uint8Array(CREDENTIAL_BYTES);
  try {
    fillRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } finally {
    bytes.fill(0);
  }
}

function recoveryConfirmation(
  recoveryCode: string,
  positions: readonly number[],
): RecoveryConfirmation | null {
  const characters = recoveryCode.replace(/[\s-]/gu, '').toUpperCase();
  if (characters.length !== 24 || positions.length !== 4) return null;
  const confirmation = positions.map((position) => {
    if (!Number.isSafeInteger(position) || position < 1 || position > characters.length) return '';
    return characters[position - 1] ?? '';
  });
  const [first, second, third, fourth] = confirmation;
  if (!first || !second || !third || !fourth) return null;
  return [first, second, third, fourth];
}

async function isFreshPreviewStore(): Promise<boolean> {
  const database = await openDatabase({
    databaseName: PREVIEW_DATABASE_NAME,
    initialSchemaVersion: 1,
  });
  try {
    const names = [META_STORE, RECORDS_STORE, OUTBOX_STORE, SNAPSHOTS_STORE];
    if (
      database.objectStoreNames.length !== names.length ||
      names.some((name) => !database.objectStoreNames.contains(name))
    ) {
      return false;
    }
    const transaction = database.transaction(names, 'readonly');
    const [, metadataKeys, records, outbox, snapshots] = await Promise.all([
      transactionDone(transaction),
      requestResult(transaction.objectStore(META_STORE).getAllKeys()),
      requestResult(transaction.objectStore(RECORDS_STORE).count()),
      requestResult(transaction.objectStore(OUTBOX_STORE).count()),
      requestResult(transaction.objectStore(SNAPSHOTS_STORE).count()),
    ]);
    return (
      metadataKeys.length === 1 &&
      metadataKeys[0] === META_SCHEMA_VERSION &&
      records === 0 &&
      outbox === 0 &&
      snapshots === 0
    );
  } finally {
    database.close();
  }
}

function error(reason: PreviewBootstrapFailure): PreviewBootstrapResult {
  return { status: 'error', reason };
}

/**
 * Creates or opens the isolated development store under a same-origin Web Lock.
 * The stored credential is a convenience only and provides no security boundary.
 */
export async function initializeUnlockedPreview(
  service: LockService,
  options: UnlockedPreviewOptions = {},
): Promise<PreviewBootstrapResult> {
  const runExclusive = options.runExclusive ?? runWithWebLock;
  const cancelled = () => options.signal?.aborted === true;
  let result: PreviewBootstrapResult;
  try {
    result = await runExclusive(PREVIEW_INITIALIZATION_LOCK_NAME, async () => {
      if (cancelled()) return error('cancelled');
      let storage: PreviewCredentialStorage;
      let savedValue: string | null;
      try {
        storage = options.storage ?? defaultStorage();
        savedValue = storage.getItem(CREDENTIAL_STORAGE_KEY);
      } catch {
        return error('storage_unavailable');
      }

      let setupState: Awaited<ReturnType<LockService['setupState']>>;
      try {
        // Read setup state only while holding the initialization lock. Another
        // same-origin tab may have completed setup while this one was waiting.
        setupState = await service.setupState();
      } catch {
        return error(cancelled() ? 'cancelled' : 'state_unavailable');
      }
      if (cancelled()) return error('cancelled');

      const saved = savedValue === null ? null : parseCredential(savedValue);
      if (savedValue !== null && saved === null) return error('inconsistent_state');

      if (setupState === 'configured') {
        if (saved === null) return error('inconsistent_state');
        try {
          const unlocked = await service.unlock({ kind: 'passphrase', passphrase: saved.credential });
          if (cancelled()) return error('cancelled');
          return unlocked.ok && service.isUnlocked()
            ? { status: 'ready', firstRun: false }
            : error('unlock_failed');
        } catch {
          return error(cancelled() ? 'cancelled' : 'unlock_failed');
        }
      }

      if (setupState !== 'not_configured') return error('inconsistent_state');
      try {
        if (!(await (options.isFreshStore ?? isFreshPreviewStore)())) {
          return error('inconsistent_state');
        }
      } catch {
        return error(cancelled() ? 'cancelled' : 'state_unavailable');
      }
      if (cancelled()) return error('cancelled');

      let credential = saved?.credential;
      if (credential === undefined) {
        try {
          credential = makeCredential(
            options.fillRandomValues ?? ((target) => getWebCrypto().getRandomValues(target)),
          );
        } catch {
          return error('setup_failed');
        }
        try {
          storage.setItem(
            CREDENTIAL_STORAGE_KEY,
            JSON.stringify({ version: 1, credential } satisfies SavedCredential),
          );
        } catch {
          return error('storage_unavailable');
        }
      }

      try {
        const setup = await service.setup(credential);
        if (cancelled()) {
          service.cancelSetup();
          return error('cancelled');
        }
        const confirmation = recoveryConfirmation(setup.recoveryCode, setup.confirmPositions);
        if (!confirmation) {
          service.cancelSetup();
          return error('setup_failed');
        }
        const confirmed = await service.confirmSetup(confirmation);
        if (cancelled()) return error('cancelled');
        if (!confirmed.ok || !service.isUnlocked()) {
          service.cancelSetup();
          return error('setup_failed');
        }
        return { status: 'ready', firstRun: true };
      } catch {
        service.cancelSetup();
        if (service.isUnlocked()) service.lock('manual');
        return error(cancelled() ? 'cancelled' : 'setup_failed');
      }
    }, options.signal);
  } catch {
    result = error(cancelled() ? 'cancelled' : 'lock_unavailable');
  }

  if (result.status === 'error' && service.isUnlocked()) service.lock('manual');
  return result;
}
