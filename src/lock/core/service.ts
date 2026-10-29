import type { Bytes } from '../../contracts/brand.ts';
import type { CryptoApi, KekSource, WrappedKey } from '../../contracts/crypto.ts';
import type {
  LockService,
  LockReason,
  ConfirmSetupResult,
  RecoveryConfirmPositions,
  RecoveryConfirmation,
  UnlockSecret,
  UnlockedStoreKeys,
} from '../../contracts/lock.ts';
import type {
  RecordKeyMaterial,
  RecordKeyProvider,
  StoredRecordRow,
} from '../../contracts/store.ts';
import { ENTITY_RECORD_TYPE, type LogicalRecord } from '../../contracts/store.ts';
import type { RecordType } from '../../contracts/enums.ts';
import { createCryptoApi } from '../../crypto/primitives/index.ts';
import { decodeBase64Url, encodeBase64Url, utf8 } from '../../crypto/primitives/encoding.ts';
import { getWebCrypto, randomBytes } from '../../crypto/primitives/webcrypto.ts';
import {
  HKDF_SALT_BYTES,
  PBKDF2_ITERATIONS,
  PBKDF2_SALT_BYTES,
} from '../../crypto/primitives/kdf.ts';
import {
  createLocalMasterKey,
  unwrapLocalMasterKey,
  wrapLocalMasterKey,
} from '../../crypto/keyring/lmk.ts';
import {
  IndexedDbLockPersistence,
  type LockConfiguration,
  type LockPersistence,
} from './persistence.ts';

const RECOVERY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RECOVERY_CODE_CHARACTERS = 24;
const PDK_INFO = utf8('flo/private-records/pdk/v1');
const IDX_INFO = utf8('flo/opaque-record-ids/index/v1');
const DERIVATION_SALT = utf8('flo/local-master-key/derived-keys/v1');

interface PendingSetup {
  readonly controller: AbortController;
  readonly positions: RecoveryConfirmPositions;
  lmkBytes: Bytes | null;
  recoveryCode: string | null;
  configuration: LockConfiguration | null;
  confirmationInFlight: Promise<ConfirmSetupResult> | null;
}

interface SessionKeys {
  readonly indexKey: CryptoKey;
  readonly recordKey: CryptoKey;
}

interface UnlockSession extends SessionKeys {
  readonly lmkBytes: Bytes;
}

export interface LockServiceOptions {
  readonly databaseName?: string;
  readonly persistence?: LockPersistence;
  readonly crypto?: CryptoApi;
}

export function canonicalizePassphrase(value: string): string {
  return value.normalize('NFC');
}

export function isPassphraseLengthAllowed(value: string): boolean {
  const normalized = canonicalizePassphrase(value);
  return Array.from(normalized.trim()).length >= 10;
}

function canonicalizeRecoveryCharacters(value: string): string {
  return value.replace(/[\s-]/gu, '').toUpperCase();
}

export function canonicalizeRecoveryCode(value: string): string {
  const normalized = canonicalizeRecoveryCharacters(value);
  if (normalized.length !== RECOVERY_CODE_CHARACTERS || !/^[A-Z2-7]{24}$/u.test(normalized)) {
    throw new TypeError('Invalid recovery code');
  }
  return normalized;
}

function encodeRecoveryCode(bytes: Uint8Array): string {
  let accumulator = 0;
  let bits = 0;
  let result = '';
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += RECOVERY_ALPHABET[(accumulator >> bits) & 31];
    }
  }
  if (bits !== 0 || result.length !== RECOVERY_CODE_CHARACTERS) {
    throw new TypeError('Recovery code entropy must be 120 bits');
  }
  return result;
}

function formatRecoveryCode(code: string): string {
  return code.match(/.{4}/gu)?.join('-') ?? code;
}

function randomBelow(maximum: number): number {
  const ceiling = Math.floor(256 / maximum) * maximum;
  let sample = 0;
  do {
    sample = randomBytes(1)[0] ?? 0;
  } while (sample >= ceiling);
  return sample % maximum;
}

function chooseConfirmationPositions(): RecoveryConfirmPositions {
  const positions = Array.from({ length: RECOVERY_CODE_CHARACTERS }, (_, index) => index + 1);
  for (let index = positions.length - 1; index > 0; index -= 1) {
    const selected = randomBelow(index + 1);
    [positions[index], positions[selected]] = [positions[selected]!, positions[index]!];
  }
  const selected = positions.slice(0, 4).sort((left, right) => left - right);
  return [selected[0]!, selected[1]!, selected[2]!, selected[3]!];
}

function abortError(): DOMException {
  return new DOMException('Lock operation was cancelled', 'AbortError');
}

function equalBytes(left: Bytes, right: Bytes): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function deriveStoreKeys(lmkBytes: Bytes): Promise<SessionKeys> {
  const subtle = getWebCrypto().subtle;
  const lmk = await subtle.importKey('raw', lmkBytes, 'HKDF', false, ['deriveKey']);
  const algorithm: HkdfParams = {
    name: 'HKDF',
    hash: 'SHA-256',
    salt: DERIVATION_SALT,
    info: IDX_INFO,
  };
  const indexKey = await subtle.deriveKey(
    algorithm,
    lmk,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign'],
  );
  const recordKey = await subtle.deriveKey(
    { ...algorithm, info: PDK_INFO },
    lmk,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { indexKey, recordKey };
}

function sourceForSecret(
  configuration: LockConfiguration,
  secret: UnlockSecret,
):
  | {
      readonly source: KekSource;
      readonly wrapped: WrappedKey;
    }
  | undefined {
  if (secret.kind === 'passphrase') {
    return {
      source: {
        kind: 'passphrase',
        passphrase: canonicalizePassphrase(secret.passphrase),
        params: {
          iterations: configuration.passphrase.iterations,
          salt: decodeBase64Url(configuration.passphrase.salt),
        },
      },
      wrapped: configuration.passphrase.wrapped,
    };
  }
  if (secret.kind === 'recovery_code') {
    return {
      source: {
        kind: 'recovery_code',
        code: canonicalizeRecoveryCode(secret.code),
        salt: decodeBase64Url(configuration.recoveryCode.salt),
      },
      wrapped: configuration.recoveryCode.wrapped,
    };
  }
  return undefined;
}

export function createLockService(options: LockServiceOptions = {}): LockService {
  const persistence = options.persistence ?? new IndexedDbLockPersistence(options.databaseName);
  const crypto = options.crypto ?? createCryptoApi();
  let configuration: LockConfiguration | undefined;
  let configurationLoaded = false;
  let pending: PendingSetup | null = null;
  let setupCommitInFlight: Promise<ConfirmSetupResult> | null = null;
  let session: UnlockSession | null = null;
  let generation = 0;
  const listeners = new Set<(reason: LockReason) => void>();
  const activeChanges = new Set<AbortController>();
  const invalidateHandles = new Set<() => void>();

  const loadConfiguration = async (): Promise<LockConfiguration | undefined> => {
    if (configurationLoaded) return configuration;
    const stored = await persistence.read();
    configuration = stored;
    configurationLoaded = true;
    return configuration;
  };

  const makeKeyHandle = (keys: UnlockSession): UnlockedStoreKeys => {
    let valid = true;
    const assertValid = () => {
      if (!valid) throw new DOMException('The lock session has ended', 'InvalidStateError');
    };
    const material: RecordKeyMaterial = { key: keys.recordKey, epoch: 0 };
    const provider: RecordKeyProvider = Object.freeze({
      get snapshotKey(): CryptoKey {
        assertValid();
        return keys.recordKey;
      },
      forWrite(record: LogicalRecord): RecordKeyMaterial {
        assertValid();
        if (typeof record.entity !== 'string') throw new TypeError('Record entity is required');
        const type = ENTITY_RECORD_TYPE[record.entity];
        if (type === 'proj' || type === 'couple') {
          throw new DOMException('This session does not hold that record key', 'NotSupportedError');
        }
        return material;
      },
      forRead(type: RecordType, row: StoredRecordRow): readonly RecordKeyMaterial[] {
        assertValid();
        return row.type === type && type !== 'proj' && type !== 'couple' ? [material] : [];
      },
    });
    const handle: UnlockedStoreKeys = Object.freeze({
      get indexKey(): CryptoKey {
        assertValid();
        return keys.indexKey;
      },
      get keyProvider(): RecordKeyProvider {
        assertValid();
        return provider;
      },
      isValid(): boolean {
        return valid;
      },
    });
    invalidateHandles.add(() => {
      valid = false;
    });
    return handle;
  };

  const clearPending = (setup: PendingSetup): void => {
    if (!setup.controller.signal.aborted) setup.controller.abort();
    setup.lmkBytes?.fill(0);
    setup.lmkBytes = null;
    setup.recoveryCode = null;
    setup.configuration = null;
    if (pending === setup) pending = null;
  };

  const service: LockService = {
    async setup(passphrase: string) {
      const canonicalPassphrase = canonicalizePassphrase(passphrase);
      if (!isPassphraseLengthAllowed(canonicalPassphrase)) {
        throw new RangeError('Use at least 10 characters after trimming');
      }
      const startGeneration = generation;
      let stored = await loadConfiguration();
      if (stored) throw new Error('Lock setup is already confirmed on this device');
      const confirmationInFlight = setupCommitInFlight;
      if (confirmationInFlight) {
        await confirmationInFlight;
        stored = configurationLoaded ? configuration : await loadConfiguration();
        if (stored) throw new Error('Lock setup is already confirmed on this device');
      }
      if (generation !== startGeneration) throw abortError();
      if (pending) clearPending(pending);

      const recoveryBytes = randomBytes(15);
      const recoveryCode = encodeRecoveryCode(recoveryBytes);
      recoveryBytes.fill(0);
      const setup: PendingSetup = {
        controller: new AbortController(),
        positions: chooseConfirmationPositions(),
        lmkBytes: createLocalMasterKey(),
        recoveryCode,
        configuration: null,
        confirmationInFlight: null,
      };
      pending = setup;
      const stillPending = () => pending === setup && generation === startGeneration;

      try {
        const passphraseSalt = randomBytes(PBKDF2_SALT_BYTES);
        const recoverySalt = randomBytes(HKDF_SALT_BYTES);
        const passphraseKek = await crypto.deriveKek({
          kind: 'passphrase',
          passphrase: canonicalPassphrase,
          params: { iterations: PBKDF2_ITERATIONS, salt: passphraseSalt },
        });
        if (!stillPending()) throw abortError();
        const recoveryKek = await crypto.deriveKek({
          kind: 'recovery_code',
          code: recoveryCode,
          salt: recoverySalt,
        });
        if (!stillPending()) throw abortError();
        const lmkBytes = setup.lmkBytes;
        if (!lmkBytes) throw abortError();
        const [passphraseWrapped, recoveryWrapped] = await Promise.all([
          wrapLocalMasterKey(lmkBytes, passphraseKek),
          wrapLocalMasterKey(lmkBytes, recoveryKek),
        ]);
        if (!stillPending()) throw abortError();
        setup.configuration = {
          version: 1,
          passphrase: {
            salt: encodeBase64Url(passphraseSalt),
            iterations: PBKDF2_ITERATIONS,
            wrapped: passphraseWrapped,
          },
          recoveryCode: { salt: encodeBase64Url(recoverySalt), wrapped: recoveryWrapped },
        };
        return {
          recoveryCode: formatRecoveryCode(recoveryCode),
          confirmPositions: setup.positions,
        };
      } catch (error) {
        if (pending === setup) clearPending(setup);
        throw error;
      }
    },

    async confirmSetup(confirmation: RecoveryConfirmation) {
      const setup = pending;
      if (!setup?.configuration || !setup.recoveryCode || !setup.lmkBytes) {
        return { ok: false, error: 'no_pending_setup' };
      }
      if (setup.confirmationInFlight) return setup.confirmationInFlight;
      if (!Array.isArray(confirmation) || confirmation.length !== 4) {
        return { ok: false, error: 'wrong_confirmation' };
      }
      const supplied = confirmation.map(canonicalizeRecoveryCharacters);
      const normalized = canonicalizeRecoveryCharacters(setup.recoveryCode);
      const matches = setup.positions.every(
        (position, index) =>
          supplied[index]?.length === 1 && supplied[index] === normalized[position - 1],
      );
      if (!matches) return { ok: false, error: 'wrong_confirmation' };

      const setupGeneration = generation;
      const committedConfiguration = setup.configuration;
      const lmkBytes = setup.lmkBytes;
      const confirmationInFlight = (async (): Promise<ConfirmSetupResult> => {
        const keys = await deriveStoreKeys(lmkBytes);
        if (pending !== setup || generation !== setupGeneration || setup.lmkBytes === null) {
          return { ok: false, error: 'no_pending_setup' };
        }
        let committed = false;
        try {
          await persistence.commit(committedConfiguration, setup.controller.signal, () => {
            committed = true;
            configuration = committedConfiguration;
            configurationLoaded = true;
            if (pending === setup && generation === setupGeneration) {
              pending = null;
              setup.recoveryCode = null;
              setup.configuration = null;
              setup.lmkBytes = null;
              session = { lmkBytes, ...keys };
            } else {
              setup.lmkBytes?.fill(0);
              setup.lmkBytes = null;
              setup.recoveryCode = null;
              setup.configuration = null;
            }
          });
        } catch (error) {
          if (committed) return { ok: true };
          if (pending !== setup || generation !== setupGeneration) {
            return { ok: false, error: 'no_pending_setup' };
          }
          throw error;
        }
        return committed ? { ok: true } : { ok: false, error: 'no_pending_setup' };
      })();
      setup.confirmationInFlight = confirmationInFlight;
      setupCommitInFlight = confirmationInFlight;
      try {
        return await confirmationInFlight;
      } finally {
        if (setup.confirmationInFlight === confirmationInFlight) {
          setup.confirmationInFlight = null;
        }
        if (setupCommitInFlight === confirmationInFlight) setupCommitInFlight = null;
      }
    },
    cancelSetup() {
      if (!pending) return;
      generation += 1;
      clearPending(pending);
    },

    async setupState() {
      if (pending) return 'pending_confirmation';
      return (await loadConfiguration()) ? 'configured' : 'not_configured';
    },

    async unlock(secret: UnlockSecret) {
      const startGeneration = generation;
      const stored = await loadConfiguration();
      if (generation !== startGeneration) return { ok: false, error: 'wrong_secret' };
      if (!stored) return { ok: false, error: 'unsupported' };
      let keySource: ReturnType<typeof sourceForSecret>;
      try {
        keySource = sourceForSecret(stored, secret);
      } catch {
        return { ok: false, error: 'wrong_secret' };
      }
      if (!keySource) return { ok: false, error: 'unsupported' };
      let lmkResult: Awaited<ReturnType<typeof unwrapLocalMasterKey>>;
      try {
        const kek = await crypto.deriveKek(keySource.source);
        if (generation !== startGeneration) return { ok: false, error: 'wrong_secret' };
        lmkResult = await unwrapLocalMasterKey(keySource.wrapped, kek);
      } catch {
        return { ok: false, error: 'wrong_secret' };
      }
      if (!lmkResult.ok) return { ok: false, error: 'wrong_secret' };
      const lmkBytes = lmkResult.value;
      if (generation !== startGeneration) {
        lmkBytes.fill(0);
        return { ok: false, error: 'wrong_secret' };
      }
      try {
        const keys = await deriveStoreKeys(lmkBytes);
        if (generation !== startGeneration) {
          lmkBytes.fill(0);
          return { ok: false, error: 'wrong_secret' };
        }
        if (session) {
          const sameLmk = equalBytes(session.lmkBytes, lmkBytes);
          lmkBytes.fill(0);
          return sameLmk ? { ok: true } : { ok: false, error: 'wrong_secret' };
        }
        session = { lmkBytes, ...keys };
        return { ok: true };
      } catch {
        lmkBytes.fill(0);
        return { ok: false, error: 'wrong_secret' };
      }
    },

    lock(reason: LockReason) {
      generation += 1;
      for (const controller of activeChanges) controller.abort();
      activeChanges.clear();
      for (const invalidate of invalidateHandles) invalidate();
      invalidateHandles.clear();
      const unlocked = session;
      session = null;
      unlocked?.lmkBytes.fill(0);
      if (pending) clearPending(pending);
      for (const listener of [...listeners]) {
        try {
          listener(reason);
        } catch {
          // One cleanup listener cannot prevent the others from running.
        }
      }
    },

    isUnlocked() {
      return session !== null;
    },

    onLock(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async changePassphrase(authorization: UnlockSecret, newPassphrase: string) {
      const current = session;
      if (!current) return { ok: false, error: 'locked' };
      const canonicalNewPassphrase = canonicalizePassphrase(newPassphrase);
      if (!isPassphraseLengthAllowed(canonicalNewPassphrase)) {
        throw new RangeError('Use at least 10 characters after trimming');
      }
      const operationGeneration = generation;
      const isCurrentSession = () => session === current && generation === operationGeneration;
      const controller = new AbortController();
      activeChanges.add(controller);
      let authorizationLmk: Bytes | null = null;
      let committed = false;
      try {
        const stored = await loadConfiguration();
        if (!isCurrentSession()) return { ok: false, error: 'locked' };
        if (!stored) return { ok: false, error: 'wrong_secret' };
        let source: ReturnType<typeof sourceForSecret>;
        try {
          source = sourceForSecret(stored, authorization);
        } catch {
          return { ok: false, error: 'wrong_secret' };
        }
        if (!source) return { ok: false, error: 'wrong_secret' };
        try {
          const kek = await crypto.deriveKek(source.source);
          if (!isCurrentSession()) return { ok: false, error: 'locked' };
          const unwrapped = await unwrapLocalMasterKey(source.wrapped, kek);
          if (!unwrapped.ok) return { ok: false, error: 'wrong_secret' };
          authorizationLmk = unwrapped.value;
        } catch {
          return isCurrentSession()
            ? { ok: false, error: 'wrong_secret' }
            : { ok: false, error: 'locked' };
        }
        if (!isCurrentSession()) return { ok: false, error: 'locked' };
        if (!equalBytes(current.lmkBytes, authorizationLmk)) {
          return { ok: false, error: 'wrong_secret' };
        }

        const salt = randomBytes(PBKDF2_SALT_BYTES);
        const newKek = await crypto.deriveKek({
          kind: 'passphrase',
          passphrase: canonicalNewPassphrase,
          params: { iterations: PBKDF2_ITERATIONS, salt },
        });
        if (!isCurrentSession()) return { ok: false, error: 'locked' };
        const wrapped = await wrapLocalMasterKey(current.lmkBytes, newKek);
        if (!isCurrentSession()) return { ok: false, error: 'locked' };
        const updated: LockConfiguration = {
          ...stored,
          passphrase: {
            salt: encodeBase64Url(salt),
            iterations: PBKDF2_ITERATIONS,
            wrapped,
          },
        };
        await persistence.commit(updated, controller.signal, () => {
          committed = true;
          configuration = updated;
          configurationLoaded = true;
        });
        return committed ? { ok: true } : { ok: false, error: 'locked' };
      } catch (error) {
        if (committed) return { ok: true };
        if (!isCurrentSession()) return { ok: false, error: 'locked' };
        throw error;
      } finally {
        authorizationLmk?.fill(0);
        activeChanges.delete(controller);
      }
    },

    storeKeys() {
      if (!session) return { ok: false, error: 'locked' };
      return { ok: true, keys: makeKeyHandle(session) };
    },
  };

  return service;
}
