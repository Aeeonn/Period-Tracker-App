import type { LockService } from '../../contracts/lock.ts';

export interface AutoLockOptions {
  readonly timeoutMs?: number;
  readonly document?: Pick<
    Document,
    'visibilityState' | 'addEventListener' | 'removeEventListener'
  >;
  readonly monotonicNow?: () => number;
  readonly wallNow?: () => number;
  readonly setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/** Locks on cold start and after a continuous hidden interval reaches the configured timeout. */
export function attachAutoLock(service: LockService, options: AutoLockOptions = {}): () => void {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) {
    throw new RangeError('Auto-lock timeout must be a non-negative integer');
  }
  const documentRef = options.document ?? globalThis.document;
  if (!documentRef) throw new DOMException('Document is unavailable', 'NotSupportedError');
  const monotonicNow = options.monotonicNow ?? (() => globalThis.performance?.now() ?? Date.now());
  const wallNow = options.wallNow ?? (() => Date.now());
  const setTimer =
    options.setTimer ?? ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
  const clearTimer = options.clearTimer ?? ((timer) => globalThis.clearTimeout(timer));
  let hiddenAtMonotonic: number | null = null;
  let hiddenAtWall: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const hiddenElapsed = () => {
    if (hiddenAtMonotonic === null || hiddenAtWall === null) return 0;
    return Math.max(monotonicNow() - hiddenAtMonotonic, wallNow() - hiddenAtWall);
  };
  const clearScheduledLock = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const scheduleLock = (delayMs: number) => {
    clearScheduledLock();
    timer = setTimer(lockForTimeout, Math.max(0, delayMs));
  };
  const lockForTimeout = () => {
    timer = null;
    if (disposed || hiddenAtMonotonic === null || hiddenAtWall === null) return;
    if (documentRef.visibilityState !== 'hidden') return;
    const remaining = timeoutMs - hiddenElapsed();
    if (remaining > 0) {
      scheduleLock(remaining);
      return;
    }
    hiddenAtMonotonic = null;
    hiddenAtWall = null;
    service.lock('timeout');
  };
  const becameHidden = () => {
    if (hiddenAtMonotonic !== null) return;
    hiddenAtMonotonic = monotonicNow();
    hiddenAtWall = wallNow();
    if (timeoutMs === 0) {
      lockForTimeout();
      return;
    }
    scheduleLock(timeoutMs);
  };
  const onVisibilityChange = () => {
    if (documentRef.visibilityState === 'hidden') {
      becameHidden();
      return;
    }
    if (hiddenAtMonotonic === null || hiddenAtWall === null) return;
    const elapsed = hiddenElapsed();
    hiddenAtMonotonic = null;
    hiddenAtWall = null;
    clearScheduledLock();
    if (elapsed >= timeoutMs) service.lock('timeout');
  };

  service.lock('cold_start');
  documentRef.addEventListener('visibilitychange', onVisibilityChange);
  if (documentRef.visibilityState === 'hidden') becameHidden();

  return () => {
    if (disposed) return;
    disposed = true;
    hiddenAtMonotonic = null;
    hiddenAtWall = null;
    clearScheduledLock();
    documentRef.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
