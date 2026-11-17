/** The "Lock after inactivity" choices offered in Settings (security-privacy.md T3). */
export const LOCK_TIMEOUT_CHOICES_SEC: readonly number[] = [0, 60, 300, 900];

/**
 * A stored timeout that is not one of the offered choices (for example from an
 * imported file) becomes the longest offered choice that is not longer than it,
 * so the app never waits longer to lock than the stored value asked for.
 * Anything that is not a non-negative number becomes `undefined`.
 */
export function snapLockTimeoutSec(seconds: unknown): number | undefined {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return undefined;
  let snapped = LOCK_TIMEOUT_CHOICES_SEC[0] ?? 0;
  for (const choice of LOCK_TIMEOUT_CHOICES_SEC) {
    if (choice <= seconds && choice > snapped) snapped = choice;
  }
  return snapped;
}
