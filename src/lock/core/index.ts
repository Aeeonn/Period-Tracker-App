export { attachAutoLock } from './auto-lock.ts';
export type { AutoLockOptions } from './auto-lock.ts';
export {
  createLockService,
  canonicalizePassphrase,
  canonicalizeRecoveryCode,
  isPassphraseLengthAllowed,
} from './service.ts';
export type { LockServiceOptions } from './service.ts';
export { IndexedDbLockPersistence, LOCK_META_KEY } from './persistence.ts';
export type { LockConfiguration, LockPersistence } from './persistence.ts';
export { createLockStoreLifecycle, LockRequiredError } from './store-lifecycle.ts';
export type { ClosableStore, LockStoreLifecycle } from './store-lifecycle.ts';
