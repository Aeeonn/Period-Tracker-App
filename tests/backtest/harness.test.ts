// synthetic: true - TV-A2 and T-ENG-04 checks use synthetic-only fixtures.
import { describe, expect, it } from 'vitest';
import type { SyntheticScenarioOutput } from '../../tools/synthetic/generator.ts';
import type { LocalDate } from '../../src/contracts/localdate.ts';
import {
  compareEngineVersions,
  evaluateScenario,
  parseComparisonReport,
  runBacktest,
} from '../../tools/backtest/index.ts';
import { addDays, parse } from '../../src/lib/localdate/index.ts';

function date(value: string): LocalDate {
  const parsed = parse(value);
  if (parsed === null) throw new Error(`Invalid synthetic LocalDate: ${value}`);
  return parsed;
}

function driftVector(): SyntheticScenarioOutput {
  const cycleLengthsDays = [...Array(8).fill(28), ...Array(6).fill(24)];
  const trueStarts: LocalDate[] = [date('2020-01-01')];
  for (const length of cycleLengthsDays) {
    const lastStart = trueStarts[trueStarts.length - 1];
    if (lastStart === undefined) throw new Error('Synthetic drift fixture has no anchor.');
    trueStarts.push(addDays(lastStart, length));
  }
  return {
    synthetic: true,
    provenance: 'Synthetic hand-computed TV-A2 history; no real records.',
    generatorVersion: 1,
    scenario: 'drift',
    seed: 42,
    profile: { meanCycleLengthDays: 28, withinPersonSdDays: 1 },
    history: {
      trueStarts,
      observedStarts: trueStarts,
      cycleLengthsDays,
      cyclePhases: cycleLengthsDays.map((_, index) => (index < 8 ? 'before-step' : 'after-step')),
    },
    dayBundles: trueStarts.map((localDate) => ({ localDate, flow: 'medium', fieldHlc: {} })),
  };
}

describe('A18 TV-A2 drift vector', () => {
  it('walks forward to the exact v1, BAVG, and B28 errors', () => {
    const result = evaluateScenario(driftVector());
    const afterChange = result.samples.filter((sample) => sample.targetPhase === 'after-step');

    expect(afterChange.map((sample) => sample.priorCycleCount)).toEqual([8, 9, 10, 11, 12, 13]);
    expect(afterChange.map((sample) => sample.v1.errorDays)).toEqual([4, 4, 4, 4, 0, 0]);
    expect(afterChange.map((sample) => sample.bavg.errorDays)).toEqual([4, 4, 3, 3, 3, 2]);
    expect(afterChange.map((sample) => sample.b28.errorDays)).toEqual([4, 4, 4, 4, 4, 4]);
    expect(result.report.postChange?.v1.maeDays).toBeCloseTo(16 / 6);
    expect(result.report.postChange?.bavg.maeDays).toBeCloseTo(19 / 6);
    expect(result.report.targets[0]?.status).toBe('met');
  });
});

describe('T-ENG-04 frozen-seed reporting and engine-version comparison', () => {
  it('reports all frozen cohorts, prior-cycle strata, and unrelaxed targets', () => {
    const report = runBacktest(42);
    expect(report.synthetic).toBe(true);
    expect(
      report.scenarios.map(({ scenario, variant }) => `${scenario}${variant ? `/${variant}` : ''}`),
    ).toEqual([
      'stable',
      'drift',
      'outliers',
      'skipped-logs/unlogged-0.1',
      'skipped-logs/unlogged-0.2',
      'irregular',
      'post-pill',
    ]);
    for (const scenario of report.scenarios) {
      expect(scenario.strata.map(({ priorCycleStratum }) => priorCycleStratum)).toEqual([
        '0',
        '1',
        '2',
        '3-5',
        '6+',
      ]);
      expect(scenario.targets.length).toBeGreaterThan(0);
    }
    expect(report.scenarios.find(({ scenario }) => scenario === 'stable')?.targets).toHaveLength(6);
    expect(
      report.scenarios
        .filter(
          ({ scenario }) =>
            scenario === 'skipped-logs' || scenario === 'irregular' || scenario === 'post-pill',
        )
        .flatMap(({ targets }) => targets)
        .every(({ status }) => status === 'report-only'),
    ).toBe(true);
  });

  it('compares same-seed synthetic reports by engine version and validates imported reports', () => {
    const reference = runBacktest(42);
    const candidate = {
      ...reference,
      engine: { version: 'cycle-engine/test-candidate', paramsHash: 'synthetic-test-hash' },
    };
    const comparison = compareEngineVersions(reference, candidate);
    expect(comparison.mode).toBe('engine-version-comparison');
    expect(comparison.referenceEngine.version).toBe(reference.engine.version);
    expect(comparison.candidateEngine.version).toBe(candidate.engine.version);
    expect(comparison.scenarios[0]?.overall.delta.maeDays).toBe(0);
    expect(parseComparisonReport(JSON.stringify(reference))).toEqual(reference);
    expect(() => parseComparisonReport('{"synthetic":false}')).toThrow(
      'Comparison input must be a synthetic report emitted by this backtest format.',
    );
    expect(() => compareEngineVersions(reference, { ...candidate, seed: 43 })).toThrow(
      'Engine-version reports must use the same seed and synthetic generator version.',
    );
  });
});
