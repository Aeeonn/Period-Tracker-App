import { describe, expect, it, vi } from 'vitest';
import type { Profile } from '../../../../src/contracts/entities.ts';
import {
  loadPinnedTrackers,
  readPinnedTrackers,
  savePinnedTrackers,
} from '../../../../src/ui/screens/log/pinned-trackers.ts';

const PROFILE: Profile = {
  goal: 'track',
  lifeStage: 'cycle',
  units: { temp: 'celsius', weight: 'kg' },
  weekStart: 1,
  theme: 'system',
  lockTimeoutSec: 60,
  quickHideEnabled: false,
};

function profileStore(initial: Profile | undefined) {
  let stored = initial;
  return {
    getProfile: vi.fn(async () => stored),
    putProfile: vi.fn(async (next: Profile) => {
      stored = next;
    }),
    current: () => stored,
  };
}

describe('pinned trackers stored in the profile', () => {
  it('keeps known trackers once, in order, and never pins heavy-flow details', () => {
    expect(readPinnedTrackers(undefined)).toBeUndefined();
    expect(readPinnedTrackers('flow')).toBeUndefined();
    expect(readPinnedTrackers([])).toEqual([]);
    expect(
      readPinnedTrackers(['mood', 'flow', 'mood', 'heavy_detail', 'not-a-tracker', 7, 'notes']),
    ).toEqual(['mood', 'flow', 'notes']);
  });

  it('reports no saved choice until one is stored, then returns it', async () => {
    await expect(loadPinnedTrackers(profileStore(undefined))).resolves.toBeUndefined();
    await expect(loadPinnedTrackers(profileStore(PROFILE))).resolves.toBeUndefined();
    await expect(
      loadPinnedTrackers(profileStore({ ...PROFILE, pinnedTrackers: ['desire', 'sex'] })),
    ).resolves.toEqual(['desire', 'sex']);
    // An empty list is a real choice: she hid every tracker.
    await expect(
      loadPinnedTrackers(profileStore({ ...PROFILE, pinnedTrackers: [] })),
    ).resolves.toEqual([]);
  });

  it('saves into the latest stored profile and does nothing before setup finishes', async () => {
    const empty = profileStore(undefined);
    await savePinnedTrackers(empty, ['flow']);
    expect(empty.putProfile).not.toHaveBeenCalled();

    const store = profileStore({ ...PROFILE, theme: 'dark' });
    await savePinnedTrackers(store, ['mood', 'flow']);
    expect(store.current()).toEqual({ ...PROFILE, theme: 'dark', pinnedTrackers: ['mood', 'flow'] });
  });
});
