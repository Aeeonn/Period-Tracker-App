/**
 * `LockService` (architecture.md §3 `lock`; security-privacy.md §3; ADR-0010).
 * The local master key (LMK) exists only in memory while unlocked and is never
 * exposed by this contract. Callers receive only the LMK-protected purpose
 * keys the record store needs (ADR-0004), and only while unlocked.
 */
import type { Bytes } from './brand.ts';
import type { RecordKeyProvider, Unsubscribe } from './store.ts';

/** Secret used to unlock. A PIN is not offered (AP-07). */
export type UnlockSecret =
  | { readonly kind: 'passphrase'; readonly passphrase: string }
  | { readonly kind: 'recovery_code'; readonly code: string }
  | { readonly kind: 'passkey_prf'; readonly prfOutput: Bytes };

/**
 * `unsupported` also covers an unlock method that is not configured on this
 * device, which includes every method until `confirmSetup` has succeeded.
 */
export type UnlockResult =
  { readonly ok: true } | { readonly ok: false; readonly error: 'wrong_secret' | 'unsupported' };

export type LockReason = 'manual' | 'quick_hide' | 'timeout' | 'cold_start';

/**
 * Four distinct 1-based positions in ascending order, counted over the
 * recovery code's characters without its group separators. The service
 * chooses them for each pending setup (ux-spec.md §3.1 "retype 4 characters").
 */
export type RecoveryConfirmPositions = readonly [number, number, number, number];

/** Result of setup phase 1. Nothing is final until `confirmSetup` succeeds. */
export interface LockSetupResult {
  /** 120-bit recovery code, shown once (storage-sync-decision.md §7). */
  readonly recoveryCode: string;
  /** The characters `confirmSetup` asks for; fixed for this pending setup. */
  readonly confirmPositions: RecoveryConfirmPositions;
}

/**
 * The characters at `confirmPositions`, in the same order. The service
 * compares them with the same canonicalization it applies to recovery-code
 * unlock.
 */
export type RecoveryConfirmation = readonly [string, string, string, string];

export type ConfirmSetupResult =
  /** Setup is final and the service is unlocked. */
  | { readonly ok: true }
  /** Mismatch. The pending setup and its positions are unchanged; retrying is allowed. */
  | { readonly ok: false; readonly error: 'wrong_confirmation' }
  /** Never started, cancelled, abandoned by `lock`, or already confirmed. Nothing changed. */
  | { readonly ok: false; readonly error: 'no_pending_setup' };

export type LockSetupState = 'not_configured' | 'pending_confirmation' | 'configured';

/**
 * Result of `changePassphrase`. Nothing changes unless `ok` is `true`.
 */
export type ChangePassphraseResult =
  | { readonly ok: true }
  /** No unlocked session, or the service locked before the commit. */
  | { readonly ok: false; readonly error: 'locked' }
  /**
   * The authorization does not open this device's LMK: it is wrong, malformed
   * or of a method not configured here. One error for every secret kind, so
   * the result reveals neither which kind failed nor which methods exist.
   */
  | { readonly ok: false; readonly error: 'wrong_secret' };

/**
 * Purpose keys handed to the composition layer for `RecordStore` and
 * `Migrations` while unlocked (ADR-0010). Every `CryptoKey` reachable from it
 * is non-extractable. Once the session is invalidated by `lock`, reading
 * `indexKey`, reading `keyProvider.snapshotKey` and calling
 * `keyProvider.forWrite`/`forRead` throw; nothing falls back to another key.
 */
export interface UnlockedStoreKeys {
  /** IDX: the HMAC-SHA-256 key for opaque record ids (architecture.md §6). */
  readonly indexKey: CryptoKey;
  /**
   * Serves the record keys of ADR-0004 that this session holds (PDK for her
   * private records). A record whose key it does not hold fails closed:
   * `forWrite` throws and `forRead` returns no candidates.
   */
  readonly keyProvider: RecordKeyProvider;
  /** `false` from the start of the next `lock`, and never `true` again. */
  isValid(): boolean;
}

export type StoreKeysResult =
  | { readonly ok: true; readonly keys: UnlockedStoreKeys }
  | { readonly ok: false; readonly error: 'locked' };

export interface LockService {
  /**
   * Setup phase 1: creates the LMK and the recovery code in memory only. The
   * service stays locked and persists nothing that a later start would treat
   * as a completed setup. Calling it again while a setup is pending abandons
   * that setup and starts a new one with a new code and new positions.
   * Rejects, changing nothing, once a setup has been confirmed on this device.
   */
  setup(passphrase: string): Promise<LockSetupResult>;
  /**
   * Setup phase 2: checks the four recovery-code characters. On success it
   * commits the passphrase and recovery-code wraps of the LMK atomically and
   * leaves the service unlocked. If the commit fails it rejects and the setup
   * stays pending. If `lock` runs first, the result is `no_pending_setup`.
   */
  confirmSetup(confirmation: RecoveryConfirmation): Promise<ConfirmSetupResult>;
  /** Abandons a pending setup and drops its keys and code; otherwise a no-op. */
  cancelSetup(): void;
  setupState(): Promise<LockSetupState>;
  unlock(secret: UnlockSecret): Promise<UnlockResult>;
  /**
   * Drops every key from memory immediately (CR-21), invalidates every
   * `UnlockedStoreKeys` handed out and abandons a pending setup, for every
   * reason including the auto-lock `timeout`: the recovery code shown for that
   * setup is then void, and a new `setup` issues a new code. Listeners of
   * `onLock` run synchronously after that and before `lock` returns.
   */
  lock(reason: LockReason): void;
  isUnlocked(): boolean;
  /**
   * The composition layer closes every store opened with `storeKeys()` keys
   * and drops its references in this listener.
   */
  onLock(listener: (reason: LockReason) => void): Unsubscribe;
  /**
   * Requires an unlocked session and re-authentication with exactly one
   * unlock secret of this device: the current passphrase, the recovery code
   * or the passkey PRF output (ADR-0010). The authorization is valid only if
   * the KEK derived from it unwraps this device's stored wrap for that method
   * to the LMK the session holds. After a recovery-code unlock, the recovery
   * code is the authorization, which completes the forgotten-passphrase flow
   * (security-privacy.md §3). Re-wraps the in-memory LMK under a KEK derived
   * from `newPassphrase` with a new salt (PBKDF2 parameters unchanged) and
   * atomically replaces only the stored passphrase wrap. The LMK, the
   * recovery-code and passkey wraps, every record and every key handed out
   * stay unchanged; no record is re-encrypted. On `locked` or `wrong_secret`
   * nothing changes, the old passphrase still works and a wrong
   * authorization does not end the session.
   */
  changePassphrase(
    authorization: UnlockSecret,
    newPassphrase: string,
  ): Promise<ChangePassphraseResult>;
  /**
   * The keys `RecordStore` and `Migrations` need, only while unlocked. The
   * LMK itself is never returned.
   */
  storeKeys(): StoreKeysResult;
}
