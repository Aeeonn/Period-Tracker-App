// synthetic: true - hand-computed A18 TV-A1 metrics and deterministic metric edge cases.
import { describe, expect, it } from 'vitest';
import { calculateMetrics, roundHalfUp } from '../../tools/backtest/index.ts';

describe('A18 TV-A1 backtest metrics', () => {
  it('computes MAE, within-one, within-two, coverage, and width', () => {
    const result = calculateMetrics([
      { errorDays: 0, inWindow: true, windowWidthDays: 4 },
      { errorDays: 1, inWindow: true, windowWidthDays: 4 },
      { errorDays: -2, inWindow: true, windowWidthDays: 4 },
      { errorDays: 3, inWindow: false, windowWidthDays: 4 },
    ]);

    expect(result).toEqual({
      sampleCount: 4,
      maeDays: 1.5,
      within1Percent: 50,
      within2Percent: 75,
      coveragePercent: 75,
      meanWindowWidthDays: 4,
    });
  });

  it('returns explicit null metrics for an empty stratum', () => {
    expect(calculateMetrics([])).toEqual({
      sampleCount: 0,
      maeDays: null,
      within1Percent: null,
      within2Percent: null,
      coveragePercent: null,
      meanWindowWidthDays: null,
    });
  });

  it('uses round-half-up for positive baseline means', () => {
    expect(roundHalfUp(27.49)).toBe(27);
    expect(roundHalfUp(27.5)).toBe(28);
  });

  it('rejects partial window data and invalid errors', () => {
    expect(() => calculateMetrics([{ errorDays: 0, inWindow: true }, { errorDays: 1 }])).toThrow(
      'Coverage must be supplied for every sample or none.',
    );
    expect(() => calculateMetrics([{ errorDays: Number.NaN }])).toThrow(
      'Metric errors must be finite days.',
    );
  });
});
