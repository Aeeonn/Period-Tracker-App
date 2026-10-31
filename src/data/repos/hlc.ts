import type { DeviceId } from '../../contracts/brand.ts';
import type { Hlc } from '../../contracts/entities.ts';

/** A device-local HLC source shared by repositories using the same store. */
export interface HlcClock {
  tick(observed?: readonly (Hlc | undefined)[]): Hlc;
}

/** Order stamps as defined by architecture.md §4.5. */
export function compareHlc(left: Hlc, right: Hlc): -1 | 0 | 1 {
  if (left.wallMs !== right.wallMs) return left.wallMs < right.wallMs ? -1 : 1;
  if (left.counter !== right.counter) return left.counter < right.counter ? -1 : 1;
  if (left.deviceId !== right.deviceId) return left.deviceId < right.deviceId ? -1 : 1;
  return 0;
}

/**
 * Produce monotonically increasing HLC stamps. `nowMs` is bookkeeping time,
 * never a health date; LocalDate values remain calendar strings throughout.
 */
export function createHlcClock(deviceId: DeviceId, nowMs: () => number = Date.now): HlcClock {
  let last: Hlc | undefined;

  return {
    tick(observed = []) {
      const known = [last, ...observed].filter((stamp): stamp is Hlc => stamp !== undefined);
      const wallMs = Math.max(nowMs(), ...known.map((stamp) => stamp.wallMs));
      let counter = 0;
      for (const stamp of known) {
        if (stamp.wallMs === wallMs) counter = Math.max(counter, stamp.counter + 1);
      }
      last = { wallMs, counter, deviceId };
      return last;
    },
  };
}
