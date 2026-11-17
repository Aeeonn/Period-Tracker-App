import { describe, expect, it } from 'vitest';
import { lockTimeoutMsForSetting, snapLockTimeoutSec } from '../../src/app/runtime.tsx';

describe('lockTimeoutMsForSetting', () => {
  it('accepts only the offered Lock after choices', () => {
    expect(lockTimeoutMsForSetting(0)).toBe(0);
    expect(lockTimeoutMsForSetting(60)).toBe(60_000);
    expect(lockTimeoutMsForSetting(300)).toBe(300_000);
    expect(lockTimeoutMsForSetting(900)).toBe(900_000);
    for (const invalid of [undefined, null, -1, 30, 86_400, Number.NaN, '60']) {
      expect(lockTimeoutMsForSetting(invalid)).toBeUndefined();
    }
  });
});

describe('snapLockTimeoutSec', () => {
  it('keeps offered choices and never lengthens a stored value', () => {
    for (const offered of [0, 60, 300, 900]) expect(snapLockTimeoutSec(offered)).toBe(offered);
    expect(snapLockTimeoutSec(30)).toBe(0);
    expect(snapLockTimeoutSec(120)).toBe(60);
    expect(snapLockTimeoutSec(600)).toBe(300);
    expect(snapLockTimeoutSec(86_400)).toBe(900);
    expect(snapLockTimeoutSec(Number.POSITIVE_INFINITY)).toBeUndefined();
    for (const invalid of [undefined, null, -1, Number.NaN, '60']) {
      expect(snapLockTimeoutSec(invalid)).toBeUndefined();
    }
  });

  it('turns a restored out-of-range value into a usable auto-lock timeout', () => {
    expect(lockTimeoutMsForSetting(snapLockTimeoutSec(120))).toBe(60_000);
    expect(lockTimeoutMsForSetting(snapLockTimeoutSec(7200))).toBe(900_000);
    expect(lockTimeoutMsForSetting(snapLockTimeoutSec(undefined))).toBeUndefined();
  });
});
