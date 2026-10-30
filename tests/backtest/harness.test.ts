// synthetic: true - TV-A2 and T-ENG-04 checks use synthetic-only fixtures.
import { describe, expect, it } from 'vitest';
import type { SyntheticScenarioOutput } from '../../tools/synthetic/generator.ts';
import type { LocalDate } from '../../src/contracts/localdate.ts';
import {
  aggregateScenarioSamples,
  compareEngineVersions,
  evaluateScenario,
  parseComparisonReport,
  runBacktest,
  runPooledBacktest,
  type PredictionSample,
  type ScenarioPoolMember,
} from '../../tools/backtest/index.ts';
import { addDays, parse } from '../../src/lib/localdate/index.ts';

function date(value: string): LocalDate {
  const parsed = parse(value);
  if (parsed === null) throw new Error(`Invalid synthetic LocalDate: ${value}`);
  return parsed;
}

function handSample(
  priorCycleCount: number,
  targetPhase: PredictionSample['targetPhase'],
  v1Error: number,
  b28Error: number,
  bavgError: number,
  inWindow: boolean,
): PredictionSample {
  return {
    priorCycleCount,
    targetPhase,
    v1: { errorDays: v1Error, inWindow, windowWidthDays: 6 },
    b28: { errorDays: b28Error },
    bavg: { errorDays: bavgError },
  };
}

function member(
  withinPersonSdDays: number,
  samples: readonly PredictionSample[],
): ScenarioPoolMember {
  return { profile: { meanCycleLengthDays: 28, withinPersonSdDays }, samples };
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

describe('T-ENG-04 pooled aggregation and gate vectors', () => {
  it('pools prediction samples by stratum and gates only Stable 3-5 and 6+', () => {
    const report = aggregateScenarioSamples('stable', [
      member(2, [
        handSample(0, 'stable', 8, 0, 0, false),
        handSample(1, 'stable', 7, 0, 0, false),
        handSample(2, 'stable', 6, 0, 0, false),
        handSample(3, 'stable', 4, 0, 0, false),
        handSample(6, 'stable', 2, 0, 0, true),
      ]),
      member(4, [
        handSample(3, 'stable', 0, 0, 0, false),
        handSample(3, 'stable', 0, 0, 0, false),
        handSample(3, 'stable', 0, 0, 0, false),
        handSample(6, 'stable', 0, 0, 0, false),
        handSample(6, 'stable', 0, 0, 0, false),
        handSample(6, 'stable', 0, 0, 0, false),
      ]),
    ]);

    expect(report.profile).toBeNull();
    expect(report.participantCount).toBe(2);
    expect(report.strata.map(({ metrics }) => metrics.v1.sampleCount)).toEqual([1, 1, 1, 4, 4]);
    expect(
      report.strata.find(({ priorCycleStratum }) => priorCycleStratum === '3-5')?.metrics.v1
        .maeDays,
    ).toBe(1);
    expect(
      report.targets.filter(({ id }) => id.startsWith('stable-mae-')).map(({ status }) => status),
    ).toEqual(['report-only', 'report-only', 'report-only', 'not-met', 'not-met']);

    const coverage = report.targets.find(({ id }) => id === 'stable-window-coverage-6plus');
    expect(coverage?.status).toBe('met');
    expect(coverage?.evidence).toMatchObject({
      participants: 2,
      eligibleParticipants: 1,
      predictions: 1,
      coveragePercent: 100,
    });
    expect(
      report.strata.find(({ priorCycleStratum }) => priorCycleStratum === '6+')?.metrics.v1
        .coveragePercent,
    ).toBe(25);
  });

  it('pools Outliers parity and Drift post-change metrics before judging', () => {
    const outliers = aggregateScenarioSamples('outliers', [
      member(2, [handSample(3, 'stable', 1, 2, 2, true)]),
      member(4, [handSample(6, 'stable', 2, 2, 3, true)]),
    ]);
    expect(outliers.overall.v1.maeDays).toBe(1.5);
    expect(outliers.targets[0]?.status).toBe('met');

    const drift = aggregateScenarioSamples('drift', [
      member(1, [
        handSample(2, 'before-step', 0, 0, 0, true),
        handSample(8, 'after-step', 2, 4, 4, true),
      ]),
      member(1, [handSample(8, 'after-step', 4, 4, 6, false)]),
    ]);
    expect(drift.postChange?.v1.maeDays).toBe(3);
    expect(drift.postChange?.bavg.maeDays).toBe(5);
    expect(drift.targets[0]?.status).toBe('met');
  });

  it('skips only generator-v1 irregular seed 338 and preserves pooled comparison', () => {
    const crashedSeed = runPooledBacktest(338, 338);
    expect(crashedSeed.skippedScenarios).toEqual([{ seed: 338, scenario: 'irregular' }]);
    expect(
      crashedSeed.scenarios.map(
        ({ scenario, variant }) => `${scenario}${variant ? `/${variant}` : ''}`,
      ),
    ).toEqual([
      'stable',
      'drift',
      'outliers',
      'skipped-logs/unlogged-0.1',
      'skipped-logs/unlogged-0.2',
      'post-pill',
    ]);
    expect(crashedSeed.scenarios.every(({ participantCount }) => participantCount === 1)).toBe(
      true,
    );
    expect(runBacktest(338).skippedScenarios).toEqual([{ seed: 338, scenario: 'irregular' }]);

    const reference = runPooledBacktest(1, 2);
    const candidate = {
      ...reference,
      engine: { version: 'cycle-engine/test-candidate', paramsHash: 'synthetic-test-hash' },
    };
    expect(JSON.stringify(runPooledBacktest(1, 2))).toBe(JSON.stringify(reference));
    const comparison = compareEngineVersions(reference, candidate);
    expect(comparison.formatVersion).toBe(2);
    expect(comparison.seedSet).toEqual({ start: 1, end: 2, count: 2 });
    expect(parseComparisonReport(JSON.stringify(reference))).toEqual(reference);
    expect(() => compareEngineVersions(reference, runPooledBacktest(1, 3))).toThrow(
      'Pooled engine-version reports must use the same seed set and skipped scenarios.',
    );
  });
});
