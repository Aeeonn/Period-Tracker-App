import { describe, expect, it } from 'vitest';
import type { Tracker } from '../../../src/contracts/enums.ts';
import {
  convertTemperatureFromCelsius,
  convertTemperatureToCelsius,
  formatTemperatureFromCelsius,
  movePinnedTracker,
  togglePinnedTracker,
} from '../../../src/ui/screens/settings/main/preferences.ts';

describe('settings display preferences', () => {
  it('converts Celsius only for display and leaves the stored value unchanged', () => {
    const syntheticReading = { celsius: 20 };

    expect(formatTemperatureFromCelsius(syntheticReading.celsius, 'fahrenheit')).toBe(
      '68.0 \u00b0F',
    );
    expect(syntheticReading.celsius).toBe(20);
    expect(convertTemperatureFromCelsius(syntheticReading.celsius, 'celsius')).toBe(20);
  });

  it('converts boundary temperatures deterministically', () => {
    expect(convertTemperatureFromCelsius(0, 'fahrenheit')).toBe(32);
    expect(convertTemperatureFromCelsius(100, 'fahrenheit')).toBe(212);
    expect(convertTemperatureFromCelsius(-40, 'fahrenheit')).toBe(-40);
  });

  it('converts Fahrenheit entry back to canonical Celsius for storage', () => {
    expect(convertTemperatureToCelsius(95, 'fahrenheit')).toBe(35);
    expect(convertTemperatureToCelsius(107.6, 'fahrenheit')).toBeCloseTo(42, 10);
    expect(convertTemperatureToCelsius(98.2, 'fahrenheit')).toBeCloseTo(36.7777778, 6);
    expect(convertTemperatureToCelsius(36.55, 'celsius')).toBe(36.55);
  });

  it('toggles a tracker without changing the prior array', () => {
    const trackers: readonly Tracker[] = ['flow', 'mood'];

    expect(togglePinnedTracker(trackers, 'mood')).toEqual(['flow']);
    expect(togglePinnedTracker(trackers, 'energy')).toEqual(['flow', 'mood', 'energy']);
    expect(trackers).toEqual(['flow', 'mood']);
  });

  it('moves pinned trackers in either direction and preserves order at the edges', () => {
    const trackers: readonly Tracker[] = ['flow', 'mood', 'energy'];

    expect(movePinnedTracker(trackers, 'mood', -1)).toEqual(['mood', 'flow', 'energy']);
    expect(movePinnedTracker(trackers, 'mood', 1)).toEqual(['flow', 'energy', 'mood']);
    expect(movePinnedTracker(trackers, 'flow', -1)).toBe(trackers);
    expect(movePinnedTracker(trackers, 'notes', 1)).toBe(trackers);
  });
});
