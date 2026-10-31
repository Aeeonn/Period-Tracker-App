import type { TemperatureUnit, Tracker } from '../../../../contracts/enums.ts';

export function convertTemperatureFromCelsius(celsius: number, unit: TemperatureUnit): number {
  return unit === 'fahrenheit' ? (celsius * 9) / 5 + 32 : celsius;
}

export function formatTemperatureFromCelsius(celsius: number, unit: TemperatureUnit): string {
  const converted = convertTemperatureFromCelsius(celsius, unit);
  const symbol = unit === 'fahrenheit' ? 'F' : 'C';
  return `${converted.toFixed(1)} \u00b0${symbol}`;
}

export function togglePinnedTracker(
  pinnedTrackers: readonly Tracker[],
  tracker: Tracker,
): readonly Tracker[] {
  if (pinnedTrackers.includes(tracker)) {
    return pinnedTrackers.filter((item) => item !== tracker);
  }
  return [...pinnedTrackers, tracker];
}

export function movePinnedTracker(
  pinnedTrackers: readonly Tracker[],
  tracker: Tracker,
  offset: -1 | 1,
): readonly Tracker[] {
  const currentIndex = pinnedTrackers.indexOf(tracker);
  const nextIndex = currentIndex + offset;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= pinnedTrackers.length) {
    return pinnedTrackers;
  }

  const next = [...pinnedTrackers];
  const current = next[currentIndex];
  const target = next[nextIndex];
  if (current === undefined || target === undefined) return pinnedTrackers;
  next[currentIndex] = target;
  next[nextIndex] = current;
  return next;
}
