import { describe, expect, it } from 'vitest';
import type { LockService, LockReason } from '../../src/contracts/lock.ts';
import { attachAutoLock } from '../../src/lock/core/auto-lock.ts';

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';

  setVisibility(state: DocumentVisibilityState): void {
    this.visibilityState = state;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

function setupHarness() {
  const document = new FakeDocument();
  const locks: LockReason[] = [];
  let monotonic = 0;
  let wall = 0;
  let scheduled: (() => void) | null = null;
  let scheduledDelay = -1;
  let timerCleared = false;
  const service = {
    lock(reason: LockReason) {
      locks.push(reason);
    },
  } as LockService;
  const stop = attachAutoLock(service, {
    document,
    timeoutMs: 60_000,
    monotonicNow: () => monotonic,
    wallNow: () => wall,
    setTimer(callback, delay) {
      scheduled = callback;
      scheduledDelay = delay;
      timerCleared = false;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer() {
      timerCleared = true;
      scheduled = null;
    },
  });
  return {
    document,
    locks,
    stop,
    setNow(value: number) {
      monotonic = value;
      wall = value;
    },
    setClocks(monotonicValue: number, wallValue: number) {
      monotonic = monotonicValue;
      wall = wallValue;
    },
    fireTimer() {
      scheduled?.();
    },
    get scheduledDelay() {
      return scheduledDelay;
    },
    get timerCleared() {
      return timerCleared;
    },
  };
}

describe('auto-lock visibility lifecycle', () => {
  it('locks synchronously on cold start and leaves a shorter hidden interval unlocked', () => {
    const harness = setupHarness();
    expect(harness.locks).toEqual(['cold_start']);
    harness.document.setVisibility('hidden');
    expect(harness.scheduledDelay).toBe(60_000);
    harness.setNow(59_999);
    harness.document.setVisibility('visible');
    expect(harness.timerCleared).toBe(true);
    expect(harness.locks).toEqual(['cold_start']);
    harness.stop();
  });

  it('uses the 60-second default timeout', () => {
    const document = new FakeDocument();
    const locks: LockReason[] = [];
    let delay = 0;
    const service = { lock: (reason: LockReason) => locks.push(reason) } as unknown as LockService;
    const stop = attachAutoLock(service, {
      document,
      setTimer(_callback, delayMs) {
        delay = delayMs;
        return 2 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer() {},
    });
    document.setVisibility('hidden');
    expect(delay).toBe(60_000);
    expect(locks).toEqual(['cold_start']);
    stop();
  });
  it('locks when hidden longer than the timeout, whether the timer fires or return is observed first', () => {
    const byTimer = setupHarness();
    byTimer.document.setVisibility('hidden');
    byTimer.setNow(60_001);
    byTimer.fireTimer();
    expect(byTimer.locks).toEqual(['cold_start', 'timeout']);
    byTimer.document.setVisibility('visible');
    expect(byTimer.locks).toEqual(['cold_start', 'timeout']);
    byTimer.stop();

    const byReturn = setupHarness();
    byReturn.document.setVisibility('hidden');
    byReturn.setNow(60_001);
    byReturn.document.setVisibility('visible');
    expect(byReturn.locks).toEqual(['cold_start', 'timeout']);
    expect(byReturn.timerCleared).toBe(true);
    byReturn.stop();
  });

  it('uses the greater elapsed time when monotonic and wall clocks diverge', () => {
    const wallClock = setupHarness();
    wallClock.document.setVisibility('hidden');
    wallClock.setClocks(100, 60_001);
    wallClock.fireTimer();
    expect(wallClock.locks).toEqual(['cold_start', 'timeout']);
    wallClock.stop();

    const monotonicClock = setupHarness();
    monotonicClock.document.setVisibility('hidden');
    monotonicClock.setClocks(60_001, 100);
    monotonicClock.fireTimer();
    expect(monotonicClock.locks).toEqual(['cold_start', 'timeout']);
    monotonicClock.stop();
  });

  it('re-arms an early timer for the remaining hidden duration', () => {
    const harness = setupHarness();
    harness.document.setVisibility('hidden');
    harness.setNow(20_000);
    harness.fireTimer();
    expect(harness.locks).toEqual(['cold_start']);
    expect(harness.scheduledDelay).toBe(40_000);
    harness.setNow(60_000);
    harness.fireTimer();
    expect(harness.locks).toEqual(['cold_start', 'timeout']);
    harness.stop();
  });
  it('starts the timeout immediately for a zero-duration setting and cancels listeners on dispose', () => {
    const document = new FakeDocument();
    const locks: LockReason[] = [];
    const service = { lock: (reason: LockReason) => locks.push(reason) } as unknown as LockService;
    const stop = attachAutoLock(service, { document, timeoutMs: 0 });
    document.setVisibility('hidden');
    expect(locks).toEqual(['cold_start', 'timeout']);
    stop();
    document.setVisibility('visible');
    expect(locks).toEqual(['cold_start', 'timeout']);
  });
});
