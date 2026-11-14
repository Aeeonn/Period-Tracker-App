import { describe, expect, it } from 'vitest';
import { lockTimeoutMsForSetting } from '../../src/app/runtime.tsx';

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
