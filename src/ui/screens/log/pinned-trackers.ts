import { TRACKERS, type Tracker } from '../../../contracts/enums.ts';
import type { SettingsRepo } from '../../../contracts/store.ts';

type ProfileStore = Pick<SettingsRepo, 'getProfile' | 'putProfile'>;

/**
 * Keeps only known tracker names, once each, in their stored order. `heavy_detail`
 * is edited inside Flow and is never a pin. Returns `undefined` when nothing was stored.
 */
export function readPinnedTrackers(stored: unknown): readonly Tracker[] | undefined {
  if (!Array.isArray(stored)) return undefined;
  const known = new Set<string>(TRACKERS);
  const seen = new Set<string>();
  const pinned: Tracker[] = [];
  for (const item of stored) {
    if (typeof item !== 'string' || !known.has(item) || item === 'heavy_detail') continue;
    if (seen.has(item)) continue;
    seen.add(item);
    pinned.push(item as Tracker);
  }
  return pinned;
}

/** The pins saved in the profile, or `undefined` when she has not chosen any yet. */
export async function loadPinnedTrackers(
  settingsRepo: ProfileStore,
): Promise<readonly Tracker[] | undefined> {
  const profile = await settingsRepo.getProfile();
  return readPinnedTrackers(profile?.pinnedTrackers);
}

/**
 * Saves the pins into the latest stored profile, so a concurrent settings change
 * is not overwritten. Does nothing before a profile exists (setup not finished).
 */
export async function savePinnedTrackers(
  settingsRepo: ProfileStore,
  trackers: readonly Tracker[],
): Promise<void> {
  const profile = await settingsRepo.getProfile();
  if (profile === undefined) return;
  const pinnedTrackers = readPinnedTrackers(trackers) ?? [];
  await settingsRepo.putProfile({ ...profile, pinnedTrackers });
}
