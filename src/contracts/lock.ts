/**
 * `LockService` (architecture.md §3 `lock`; security-privacy.md §3). The
 * local master key (LMK) exists only in memory while unlocked.
 */
import type { Bytes } from './brand.ts';
import type { Unsubscribe } from './store.ts';

/** Secret used to unlock. A PIN is not offered (AP-07). */
export type UnlockSecret =
  | { readonly kind: 'passphrase'; readonly passphrase: string }
  | { readonly kind: 'recovery_code'; readonly code: string }
  | { readonly kind: 'passkey_prf'; readonly prfOutput: Bytes };

export type UnlockResult =
  { readonly ok: true } | { readonly ok: false; readonly error: 'wrong_secret' | 'unsupported' };

export type LockReason = 'manual' | 'quick_hide' | 'timeout' | 'cold_start';

export interface LockSetupResult {
  /** 120-bit recovery code, shown once (storage-sync-decision.md §7). */
  readonly recoveryCode: string;
}

export interface LockService {
  /** First run: sets the passphrase and creates the recovery code. */
  setup(passphrase: string): Promise<LockSetupResult>;
  unlock(secret: UnlockSecret): Promise<UnlockResult>;
  /** Drops every key from memory immediately (CR-21). */
  lock(reason: LockReason): void;
  isUnlocked(): boolean;
  onLock(listener: (reason: LockReason) => void): Unsubscribe;
}
