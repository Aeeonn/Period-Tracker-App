// synthetic: true - deterministic walk-forward harness over frozen synthetic scenarios only.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EngineInput } from '../../src/contracts/engine-api.ts';
import type { LocalDate } from '../../src/contracts/localdate.ts';
import { runEngine, ENGINE_VERSION, hashEngineParams, PARAMS_V1 } from '../../src/engine/index.ts';
import { addDays, compare, diffDays } from '../../src/lib/localdate/index.ts';
import {
  GENERATOR_VERSION,
  generateScenario,
  type SyntheticScenarioOutput,
} from '../synthetic/generator.ts';

const FORMAT_VERSION = 1 as const;
const POOLED_FORMAT_VERSION = 2 as const;
export const POOLED_SEED_SET = { start: 1, end: 1000, count: 1000 } as const;
const KNOWN_IRREGULAR_CRASH_SEEDS = new Set([338, 341, 937, 991]);
const GENERATOR_CYCLE_LENGTH_ERROR = 'A generated cycle length cannot advance LocalDate:';
const SYNTHETIC_PROVENANCE =
  'Seeded tools/synthetic generator v1 only; synthetic results show neither real-world nor Flo-equivalent accuracy.';

const STRATA = [
  { name: '0', min: 0, max: 0 },
  { name: '1', min: 1, max: 1 },
  { name: '2', min: 2, max: 2 },
  { name: '3-5', min: 3, max: 5 },
  { name: '6+', min: 6, max: Number.POSITIVE_INFINITY },
] as const;

type StratumName = (typeof STRATA)[number]['name'];
type CyclePhase = SyntheticScenarioOutput['history']['cyclePhases'][number];
type ScenarioId = SyntheticScenarioOutput['scenario'];
type TargetStatus = 'met' | 'not-met' | 'report-only';
type MetricName =
  'maeDays' | 'within1Percent' | 'within2Percent' | 'coveragePercent' | 'meanWindowWidthDays';

export interface MetricSample {
  readonly errorDays: number;
  readonly inWindow?: boolean;
  /** Width is hi - lo in calendar days, using LocalDate arithmetic. */
  readonly windowWidthDays?: number;
}

export interface MetricSummary {
  readonly sampleCount: number;
  readonly maeDays: number | null;
  readonly within1Percent: number | null;
  readonly within2Percent: number | null;
  readonly coveragePercent: number | null;
  readonly meanWindowWidthDays: number | null;
}

export interface MetricSet {
  readonly v1: MetricSummary;
  readonly b28: MetricSummary;
  readonly bavg: MetricSummary;
}

export interface TargetResult {
  readonly id: string;
  readonly description: string;
  readonly status: TargetStatus;
  readonly evidence: Readonly<Record<string, number | string | null>>;
}

export interface StratumResult {
  readonly priorCycleStratum: StratumName;
  readonly metrics: MetricSet;
}

export interface ScenarioReport {
  readonly scenario: ScenarioId;
  readonly cohort: string;
  readonly variant?: SyntheticScenarioOutput['variant'];
  /** Null for pooled reports because a cohort has multiple generated profiles. */
  readonly profile: SyntheticScenarioOutput['profile'] | null;
  readonly participantCount?: number;
  readonly overall: MetricSet;
  readonly strata: readonly StratumResult[];
  readonly postChange?: MetricSet;
  readonly targets: readonly TargetResult[];
}

export interface SkippedScenario {
  readonly seed: number;
  readonly scenario: 'irregular';
}

export interface PooledSeedSet {
  readonly start: number;
  readonly end: number;
  readonly count: number;
}

export interface SingleSeedBacktestReport {
  readonly synthetic: true;
  readonly formatVersion: typeof FORMAT_VERSION;
  readonly provenance: typeof SYNTHETIC_PROVENANCE;
  readonly seed: number;
  readonly generatorVersion: 1;
  readonly engine: { readonly version: string; readonly paramsHash: string };
  readonly scenarios: readonly ScenarioReport[];
  readonly skippedScenarios?: readonly SkippedScenario[];
}

export interface PooledBacktestReport {
  readonly synthetic: true;
  readonly formatVersion: typeof POOLED_FORMAT_VERSION;
  readonly mode: 'pooled';
  readonly provenance: typeof SYNTHETIC_PROVENANCE;
  readonly seedSet: PooledSeedSet;
  readonly generatorVersion: 1;
  readonly engine: { readonly version: string; readonly paramsHash: string };
  readonly scenarios: readonly ScenarioReport[];
  readonly skippedScenarios: readonly SkippedScenario[];
}

export type BacktestReport = SingleSeedBacktestReport | PooledBacktestReport;

export interface MetricComparison {
  readonly reference: MetricSummary;
  readonly candidate: MetricSummary;
  readonly delta: Readonly<Record<MetricName | 'sampleCount', number | null>>;
}

export interface EngineVersionComparison {
  readonly synthetic: true;
  readonly formatVersion: typeof FORMAT_VERSION | typeof POOLED_FORMAT_VERSION;
  readonly mode: 'engine-version-comparison';
  readonly seed?: number;
  readonly seedSet?: PooledSeedSet;
  readonly skippedScenarios?: readonly SkippedScenario[];
  readonly generatorVersion: 1;
  readonly referenceEngine: BacktestReport['engine'];
  readonly candidateEngine: BacktestReport['engine'];
  readonly scenarios: readonly {
    readonly scenario: ScenarioId;
    readonly cohort: string;
    readonly variant?: SyntheticScenarioOutput['variant'];
    readonly overall: MetricComparison;
    readonly strata: readonly {
      readonly priorCycleStratum: StratumName;
      readonly metrics: MetricComparison;
    }[];
  }[];
}

export interface PredictionSample {
  readonly priorCycleCount: number;
  readonly targetPhase: CyclePhase;
  readonly v1: MetricSample;
  readonly b28: MetricSample;
  readonly bavg: MetricSample;
}

export interface ScenarioPoolMember {
  readonly profile: SyntheticScenarioOutput['profile'];
  readonly samples: readonly PredictionSample[];
}

function summarize(samples: readonly MetricSample[]): MetricSummary {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      maeDays: null,
      within1Percent: null,
      within2Percent: null,
      coveragePercent: null,
      meanWindowWidthDays: null,
    };
  }

  const windowed = samples.filter((sample) => sample.inWindow !== undefined);
  const widths = samples.filter((sample) => sample.windowWidthDays !== undefined);
  if (windowed.length !== 0 && windowed.length !== samples.length) {
    throw new TypeError('Coverage must be supplied for every sample or none.');
  }
  if (widths.length !== 0 && widths.length !== samples.length) {
    throw new TypeError('Window width must be supplied for every sample or none.');
  }

  const absoluteErrors = samples.map(({ errorDays }) => Math.abs(errorDays));
  const within1 = absoluteErrors.filter((error) => error <= 1).length;
  const within2 = absoluteErrors.filter((error) => error <= 2).length;
  const covered = windowed.filter((sample) => sample.inWindow).length;
  const totalWidth = widths.reduce((total, sample) => total + (sample.windowWidthDays ?? 0), 0);

  return {
    sampleCount: samples.length,
    maeDays: absoluteErrors.reduce((total, error) => total + error, 0) / samples.length,
    within1Percent: (within1 / samples.length) * 100,
    within2Percent: (within2 / samples.length) * 100,
    coveragePercent: windowed.length === 0 ? null : (covered / samples.length) * 100,
    meanWindowWidthDays: widths.length === 0 ? null : totalWidth / samples.length,
  };
}

export function calculateMetrics(samples: readonly MetricSample[]): MetricSummary {
  for (const sample of samples) {
    if (!Number.isFinite(sample.errorDays))
      throw new TypeError('Metric errors must be finite days.');
    if (sample.windowWidthDays !== undefined && sample.windowWidthDays < 0) {
      throw new RangeError('Window width cannot be negative.');
    }
  }
  return summarize(samples);
}

function stratumFor(priorCycleCount: number): StratumName {
  const stratum = STRATA.find(({ min, max }) => priorCycleCount >= min && priorCycleCount <= max);
  if (stratum === undefined) throw new RangeError(`Invalid prior-cycle count: ${priorCycleCount}`);
  return stratum.name;
}

function metricSet(samples: readonly PredictionSample[]): MetricSet {
  return {
    v1: summarize(samples.map(({ v1 }) => v1)),
    b28: summarize(samples.map(({ b28 }) => b28)),
    bavg: summarize(samples.map(({ bavg }) => bavg)),
  };
}

function validPriorLengths(observedStarts: readonly LocalDate[], currentIndex: number): number[] {
  const lengths: number[] = [];
  for (let index = 1; index <= currentIndex; index += 1) {
    const prior = observedStarts[index - 1];
    const current = observedStarts[index];
    if (prior === undefined || current === undefined) throw new Error('Invalid observed history.');
    const length = diffDays(prior, current);
    if (length >= 15 && length <= 90) lengths.push(length);
  }
  return lengths;
}

export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError('Round-half-up requires a finite non-negative value.');
  return Math.floor(value + 0.5);
}

function buildScenarioReport(
  scenario: ScenarioId,
  variant: SyntheticScenarioOutput['variant'],
  members: readonly ScenarioPoolMember[],
  pooled: boolean,
): ScenarioReport {
  if (members.length === 0) throw new RangeError('Cannot aggregate an empty scenario cohort.');
  const samples = members.flatMap(({ samples: memberSamples }) => memberSamples);
  const sampleProfiles = members.flatMap(({ profile, samples: memberSamples }) =>
    memberSamples.map(() => profile),
  );
  const overall = metricSet(samples);
  const strata: StratumResult[] = STRATA.map(({ name }) => ({
    priorCycleStratum: name,
    metrics: metricSet(samples.filter((sample) => stratumFor(sample.priorCycleCount) === name)),
  }));
  const targets: TargetResult[] = [];
  let postChange: MetricSet | undefined;

  if (scenario === 'stable') {
    for (const stratum of strata) {
      const limit =
        stratum.metrics.b28.maeDays === null || stratum.metrics.bavg.maeDays === null
          ? null
          : Math.min(stratum.metrics.b28.maeDays, stratum.metrics.bavg.maeDays) + 0.25;
      const observed = stratum.metrics.v1.maeDays;
      const gated = stratum.priorCycleStratum === '3-5' || stratum.priorCycleStratum === '6+';
      targets.push({
        id: `stable-mae-${stratum.priorCycleStratum}`,
        description: `Stable MAE(v1) <= min(MAE(B28), MAE(BAVG)) + 0.25 day in prior-cycle stratum ${stratum.priorCycleStratum}`,
        status: !gated
          ? 'report-only'
          : observed === null || limit === null
            ? 'not-met'
            : observed <= limit
              ? 'met'
              : 'not-met',
        evidence: {
          v1MaeDays: observed,
          b28MaeDays: stratum.metrics.b28.maeDays,
          bavgMaeDays: stratum.metrics.bavg.maeDays,
          limitMaeDays: limit,
        },
      });
    }

    const eligibleMembers = members.filter(({ profile }) => profile.withinPersonSdDays <= 3);
    const coverageSamples = samples.filter((sample, index) => {
      const profile = sampleProfiles[index];
      return (
        sample.priorCycleCount >= 6 && profile !== undefined && profile.withinPersonSdDays <= 3
      );
    });
    const coverage = summarize(coverageSamples.map(({ v1 }) => v1)).coveragePercent;
    targets.push({
      id: 'stable-window-coverage-6plus',
      description:
        'Stable, within-person SD <= 3 days: window coverage >= 70% with 6+ prior cycles',
      status:
        eligibleMembers.length === 0
          ? 'report-only'
          : coverage === null
            ? 'not-met'
            : coverage >= 70
              ? 'met'
              : 'not-met',
      evidence: {
        participants: members.length,
        eligibleParticipants: eligibleMembers.length,
        predictions: coverageSamples.length,
        coveragePercent: coverage,
      },
    });
  } else if (scenario === 'outliers') {
    const limit =
      overall.b28.maeDays === null || overall.bavg.maeDays === null
        ? null
        : Math.min(overall.b28.maeDays, overall.bavg.maeDays) + 0.25;
    targets.push({
      id: 'outliers-mae',
      description: 'Outliers MAE(v1) <= min(MAE(B28), MAE(BAVG)) + 0.25 day',
      status:
        overall.v1.maeDays === null || limit === null
          ? 'not-met'
          : overall.v1.maeDays <= limit
            ? 'met'
            : 'not-met',
      evidence: {
        v1MaeDays: overall.v1.maeDays,
        b28MaeDays: overall.b28.maeDays,
        bavgMaeDays: overall.bavg.maeDays,
        limitMaeDays: limit,
      },
    });
  } else if (scenario === 'drift') {
    const afterChangeSamples = samples.filter(({ targetPhase }) => targetPhase === 'after-step');
    postChange = metricSet(afterChangeSamples);
    const v1Mae = postChange.v1.maeDays;
    const bavgMae = postChange.bavg.maeDays;
    targets.push({
      id: 'drift-post-change-mae',
      description: 'Drift MAE(v1) < MAE(BAVG) over predictions after the change (TV-A2)',
      status: v1Mae === null || bavgMae === null ? 'not-met' : v1Mae < bavgMae ? 'met' : 'not-met',
      evidence: { v1MaeDays: v1Mae, bavgMaeDays: bavgMae, predictions: afterChangeSamples.length },
    });
  } else {
    targets.push({
      id: `${scenario}-report-only`,
      description: `${scenario} is reported only; A18 defines no pass/fail target`,
      status: 'report-only',
      evidence: { predictions: samples.length },
    });
  }

  const firstProfile = members[0]?.profile;
  if (firstProfile === undefined) throw new Error('Scenario cohort lost its first profile.');
  return {
    scenario,
    cohort: scenario,
    ...(variant === undefined ? {} : { variant }),
    profile: pooled ? null : firstProfile,
    ...(pooled ? { participantCount: members.length } : {}),
    overall,
    strata,
    ...(postChange === undefined ? {} : { postChange }),
    targets,
  };
}

export function aggregateScenarioSamples(
  scenario: ScenarioId,
  members: readonly ScenarioPoolMember[],
  variant?: SyntheticScenarioOutput['variant'],
): ScenarioReport {
  return buildScenarioReport(scenario, variant, members, true);
}

export function evaluateScenario(scenario: SyntheticScenarioOutput): {
  report: ScenarioReport;
  samples: PredictionSample[];
} {
  const { trueStarts, observedStarts, cyclePhases } = scenario.history;
  const samples: PredictionSample[] = [];

  for (let observedIndex = 0; observedIndex < observedStarts.length; observedIndex += 1) {
    const currentStart = observedStarts[observedIndex];
    if (currentStart === undefined) throw new Error('Observed history contains an empty date.');
    const trueIndex = trueStarts.indexOf(currentStart);
    if (trueIndex < 0) throw new Error('Observed start does not match a synthetic true start.');
    const actualStart = trueStarts[trueIndex + 1];
    if (actualStart === undefined) continue;
    const targetPhase = cyclePhases[trueIndex];
    if (targetPhase === undefined) throw new Error('Missing synthetic phase for a target cycle.');

    const input: EngineInput = {
      today: addDays(currentStart, 1),
      profile: { lifeStage: 'cycle', contraception: [] },
      dayLogs: scenario.dayBundles.filter((bundle) => compare(bundle.localDate, currentStart) <= 0),
      episodesOverride: [],
      pregnancies: [],
      coupleEntriesAllowedForInsights: [],
    };
    if (input.dayLogs.some((dayLog) => compare(dayLog.localDate, currentStart) > 0)) {
      throw new Error('Walk-forward input contains a future log.');
    }

    const result = runEngine(input);
    if (result.prediction.kind !== 'prediction') {
      throw new Error(
        `Engine prediction suppressed for synthetic ${scenario.scenario} at ${currentStart}.`,
      );
    }

    const b28Start = addDays(currentStart, 28);
    const priorLengths = validPriorLengths(observedStarts, observedIndex);
    const bavgLength =
      priorLengths.length === 0
        ? 28
        : roundHalfUp(
            priorLengths.reduce((total, length) => total + length, 0) / priorLengths.length,
          );
    const bavgStart = addDays(currentStart, bavgLength);
    const error = (predicted: LocalDate): number => diffDays(actualStart, predicted);

    samples.push({
      // A18 strata use all complete observed intervals, even beyond engine history caps.
      priorCycleCount: observedIndex,
      targetPhase,
      v1: {
        errorDays: error(result.prediction.center),
        inWindow:
          compare(result.prediction.lo, actualStart) <= 0 &&
          compare(actualStart, result.prediction.hi) <= 0,
        windowWidthDays: diffDays(result.prediction.lo, result.prediction.hi),
      },
      b28: { errorDays: error(b28Start) },
      bavg: { errorDays: error(bavgStart) },
    });
  }

  return {
    report: buildScenarioReport(
      scenario.scenario,
      scenario.variant,
      [{ profile: scenario.profile, samples }],
      false,
    ),
    samples,
  };
}

interface SeedScenarioSet {
  readonly scenarios: readonly SyntheticScenarioOutput[];
  readonly skippedScenarios: readonly SkippedScenario[];
}

function generateSeedScenarios(seed: number): SeedScenarioSet {
  const scenarios: SyntheticScenarioOutput[] = [];
  const skippedScenarios: SkippedScenario[] = [];
  const add = (scenario: ScenarioId, generate: () => SyntheticScenarioOutput): void => {
    try {
      scenarios.push(generate());
    } catch (error) {
      if (
        scenario === 'irregular' &&
        KNOWN_IRREGULAR_CRASH_SEEDS.has(seed) &&
        error instanceof RangeError &&
        error.message.startsWith(GENERATOR_CYCLE_LENGTH_ERROR)
      ) {
        skippedScenarios.push({ seed, scenario: 'irregular' });
        return;
      }
      throw error;
    }
  };
  const options = { seed };
  add('stable', () => generateScenario('stable', options));
  add('drift', () => generateScenario('drift', options));
  add('outliers', () => generateScenario('outliers', options));
  add('skipped-logs', () =>
    generateScenario('skipped-logs', { ...options, skippedLogProbability: 0.1 }),
  );
  add('skipped-logs', () =>
    generateScenario('skipped-logs', { ...options, skippedLogProbability: 0.2 }),
  );
  add('irregular', () => generateScenario('irregular', options));
  add('post-pill', () => generateScenario('post-pill', options));
  return { scenarios, skippedScenarios };
}

function engineTag(): BacktestReport['engine'] {
  return { version: ENGINE_VERSION, paramsHash: hashEngineParams(PARAMS_V1) };
}

export function runBacktest(seed = 42): SingleSeedBacktestReport {
  const generated = generateSeedScenarios(seed);
  const evaluated = generated.scenarios.map(evaluateScenario);
  return {
    synthetic: true,
    formatVersion: FORMAT_VERSION,
    provenance: SYNTHETIC_PROVENANCE,
    seed,
    generatorVersion: GENERATOR_VERSION,
    engine: engineTag(),
    scenarios: evaluated.map(({ report }) => report),
    ...(generated.skippedScenarios.length === 0
      ? {}
      : { skippedScenarios: generated.skippedScenarios }),
  };
}

export function runPooledBacktest(
  startSeed: number = POOLED_SEED_SET.start,
  endSeed: number = POOLED_SEED_SET.end,
): PooledBacktestReport {
  if (
    !Number.isSafeInteger(startSeed) ||
    !Number.isSafeInteger(endSeed) ||
    startSeed < 0 ||
    endSeed > 0xffff_ffff ||
    endSeed < startSeed
  ) {
    throw new RangeError('Pooled seed bounds must be an ascending unsigned 32-bit range.');
  }

  interface ScenarioAccumulator {
    readonly scenario: ScenarioId;
    readonly variant: SyntheticScenarioOutput['variant'];
    readonly members: ScenarioPoolMember[];
  }
  const accumulators = new Map<string, ScenarioAccumulator>();
  const skippedScenarios: SkippedScenario[] = [];
  for (let seed = startSeed; seed <= endSeed; seed += 1) {
    const generated = generateSeedScenarios(seed);
    skippedScenarios.push(...generated.skippedScenarios);
    for (const scenario of generated.scenarios) {
      const evaluated = evaluateScenario(scenario);
      const key = `${scenario.scenario}:${scenario.variant ?? ''}`;
      let accumulator = accumulators.get(key);
      if (accumulator === undefined) {
        accumulator = {
          scenario: scenario.scenario,
          variant: scenario.variant,
          members: [],
        };
        accumulators.set(key, accumulator);
      }
      accumulator.members.push({ profile: scenario.profile, samples: evaluated.samples });
    }
  }

  const scenarios = [...accumulators.values()].map(({ scenario, variant, members }) =>
    aggregateScenarioSamples(scenario, members, variant),
  );
  return {
    synthetic: true,
    formatVersion: POOLED_FORMAT_VERSION,
    mode: 'pooled',
    provenance: SYNTHETIC_PROVENANCE,
    seedSet: { start: startSeed, end: endSeed, count: endSeed - startSeed + 1 },
    generatorVersion: GENERATOR_VERSION,
    engine: engineTag(),
    scenarios,
    skippedScenarios,
  };
}

function numericDelta(reference: number | null, candidate: number | null): number | null {
  return reference === null || candidate === null ? null : candidate - reference;
}

function compareMetricSummaries(
  reference: MetricSummary,
  candidate: MetricSummary,
): MetricComparison {
  return {
    reference,
    candidate,
    delta: {
      sampleCount: candidate.sampleCount - reference.sampleCount,
      maeDays: numericDelta(reference.maeDays, candidate.maeDays),
      within1Percent: numericDelta(reference.within1Percent, candidate.within1Percent),
      within2Percent: numericDelta(reference.within2Percent, candidate.within2Percent),
      coveragePercent: numericDelta(reference.coveragePercent, candidate.coveragePercent),
      meanWindowWidthDays: numericDelta(
        reference.meanWindowWidthDays,
        candidate.meanWindowWidthDays,
      ),
    },
  };
}

function scenarioKey(scenario: ScenarioReport): string {
  return `${scenario.scenario}:${scenario.variant ?? ''}`;
}

export function compareEngineVersions(
  reference: BacktestReport,
  candidate: BacktestReport,
): EngineVersionComparison {
  if (
    reference.formatVersion !== candidate.formatVersion ||
    reference.generatorVersion !== candidate.generatorVersion
  ) {
    throw new TypeError(
      'Engine-version reports must use the same report mode and synthetic generator version.',
    );
  }
  if (reference.formatVersion === 1 && candidate.formatVersion === 1) {
    if (reference.seed !== candidate.seed) {
      throw new TypeError(
        'Engine-version reports must use the same seed and synthetic generator version.',
      );
    }
  } else if (reference.formatVersion === 2 && candidate.formatVersion === 2) {
    if (
      JSON.stringify(reference.seedSet) !== JSON.stringify(candidate.seedSet) ||
      JSON.stringify(reference.skippedScenarios) !== JSON.stringify(candidate.skippedScenarios)
    ) {
      throw new TypeError(
        'Pooled engine-version reports must use the same seed set and skipped scenarios.',
      );
    }
  } else {
    throw new TypeError('Engine-version reports must use the same report mode.');
  }

  const referenceScenarios = new Map(
    reference.scenarios.map((scenario) => [scenarioKey(scenario), scenario]),
  );
  const candidateScenarios = new Map(
    candidate.scenarios.map((scenario) => [scenarioKey(scenario), scenario]),
  );
  if (
    referenceScenarios.size !== candidateScenarios.size ||
    [...referenceScenarios.keys()].some((key) => !candidateScenarios.has(key))
  ) {
    throw new TypeError('Engine-version reports must contain the same synthetic scenario set.');
  }

  const scenarios = candidate.scenarios.map((scenario) => {
    const prior = referenceScenarios.get(scenarioKey(scenario));
    if (prior === undefined || JSON.stringify(prior.profile) !== JSON.stringify(scenario.profile)) {
      throw new TypeError('Engine-version reports must use identical generated scenario profiles.');
    }
    const priorStrata = new Map(
      prior.strata.map((stratum) => [stratum.priorCycleStratum, stratum]),
    );
    const strata = scenario.strata.map((stratum) => {
      const referenceStratum = priorStrata.get(stratum.priorCycleStratum);
      if (referenceStratum === undefined)
        throw new TypeError('Engine-version stratum sets differ.');
      return {
        priorCycleStratum: stratum.priorCycleStratum,
        metrics: compareMetricSummaries(referenceStratum.metrics.v1, stratum.metrics.v1),
      };
    });
    return {
      scenario: scenario.scenario,
      cohort: scenario.cohort,
      ...(scenario.variant === undefined ? {} : { variant: scenario.variant }),
      overall: compareMetricSummaries(prior.overall.v1, scenario.overall.v1),
      strata,
    };
  });

  const comparison: EngineVersionComparison = {
    synthetic: true,
    formatVersion: candidate.formatVersion,
    mode: 'engine-version-comparison',
    generatorVersion: candidate.generatorVersion,
    referenceEngine: reference.engine,
    candidateEngine: candidate.engine,
    scenarios,
    ...(candidate.formatVersion === 1
      ? { seed: candidate.seed }
      : {
          seedSet: candidate.seedSet,
          skippedScenarios: candidate.skippedScenarios,
        }),
  };
  return comparison;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isMetricSummary(value: unknown): value is MetricSummary {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.sampleCount) ||
    (value.sampleCount as number) < 0
  )
    return false;
  const metricNames: readonly MetricName[] = [
    'maeDays',
    'within1Percent',
    'within2Percent',
    'coveragePercent',
    'meanWindowWidthDays',
  ];
  return metricNames.every(
    (name) =>
      value[name] === null || (typeof value[name] === 'number' && Number.isFinite(value[name])),
  );
}

function isSkippedScenario(value: unknown): value is SkippedScenario {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.seed) &&
    (value.seed as number) >= 0 &&
    (value.seed as number) <= 0xffff_ffff &&
    value.scenario === 'irregular'
  );
}

function isScenarioReport(value: unknown, pooled: boolean): value is ScenarioReport {
  if (
    !isRecord(value) ||
    typeof value.scenario !== 'string' ||
    typeof value.cohort !== 'string' ||
    !(pooled ? value.profile === null : isRecord(value.profile)) ||
    (pooled &&
      (!Number.isSafeInteger(value.participantCount) || (value.participantCount as number) < 1)) ||
    !isRecord(value.overall) ||
    !isMetricSummary(value.overall.v1) ||
    !Array.isArray(value.strata) ||
    !Array.isArray(value.targets)
  ) {
    return false;
  }
  return value.strata.every(
    (stratum) =>
      isRecord(stratum) &&
      typeof stratum.priorCycleStratum === 'string' &&
      isRecord(stratum.metrics) &&
      isMetricSummary(stratum.metrics.v1),
  );
}

function isBacktestReport(value: unknown): value is BacktestReport {
  if (
    !isRecord(value) ||
    value.synthetic !== true ||
    value.provenance !== SYNTHETIC_PROVENANCE ||
    value.generatorVersion !== GENERATOR_VERSION ||
    !isRecord(value.engine) ||
    typeof value.engine.version !== 'string' ||
    typeof value.engine.paramsHash !== 'string' ||
    !Array.isArray(value.scenarios)
  ) {
    return false;
  }
  if (value.formatVersion === FORMAT_VERSION) {
    if (
      !Number.isSafeInteger(value.seed) ||
      (value.seed as number) < 0 ||
      (value.seed as number) > 0xffff_ffff ||
      (value.skippedScenarios !== undefined &&
        (!Array.isArray(value.skippedScenarios) ||
          !value.skippedScenarios.every(isSkippedScenario)))
    ) {
      return false;
    }
    return value.scenarios.every((scenario) => isScenarioReport(scenario, false));
  }
  if (
    value.formatVersion !== POOLED_FORMAT_VERSION ||
    value.mode !== 'pooled' ||
    !isRecord(value.seedSet) ||
    !Number.isSafeInteger(value.seedSet.start) ||
    !Number.isSafeInteger(value.seedSet.end) ||
    !Number.isSafeInteger(value.seedSet.count) ||
    (value.seedSet.start as number) < 0 ||
    (value.seedSet.end as number) > 0xffff_ffff ||
    (value.seedSet.end as number) < (value.seedSet.start as number) ||
    value.seedSet.count !== (value.seedSet.end as number) - (value.seedSet.start as number) + 1 ||
    !Array.isArray(value.skippedScenarios) ||
    !value.skippedScenarios.every(
      (scenario) =>
        isSkippedScenario(scenario) &&
        scenario.seed >= ((value.seedSet as Record<string, unknown>).start as number) &&
        scenario.seed <= ((value.seedSet as Record<string, unknown>).end as number),
    )
  ) {
    return false;
  }
  return value.scenarios.every((scenario) => isScenarioReport(scenario, true));
}

export function parseComparisonReport(json: string): BacktestReport {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch {
    throw new TypeError('Comparison input must be a JSON backtest report.');
  }
  if (!isBacktestReport(value)) {
    throw new TypeError(
      'Comparison input must be a synthetic report emitted by this backtest format.',
    );
  }
  return value;
}

function runCli(args: readonly string[]): void {
  let seed: number | undefined;
  let pooledRequested = false;
  let comparisonPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') {
      process.stdout.write(
        'Usage: npm run backtest [-- --pooled] [--seed <uint32>] [--compare <prior-synthetic-report.json>]\n',
      );
      return;
    }
    if (argument === '--pooled') {
      pooledRequested = true;
      continue;
    }
    if (argument === '--seed') {
      const rawSeed = args[index + 1];
      if (rawSeed === undefined || !/^\d+$/.test(rawSeed))
        throw new TypeError('--seed requires an unsigned 32-bit integer.');
      seed = Number(rawSeed);
      if (!Number.isSafeInteger(seed) || seed > 0xffff_ffff)
        throw new RangeError('--seed is outside the unsigned 32-bit range.');
      index += 1;
      continue;
    }
    if (argument === '--compare') {
      comparisonPath = args[index + 1];
      if (comparisonPath === undefined || comparisonPath.startsWith('--'))
        throw new TypeError('--compare requires a prior synthetic report path.');
      index += 1;
      continue;
    }
    throw new TypeError(`Unknown argument: ${String(argument)}`);
  }

  if (pooledRequested && seed !== undefined) {
    throw new TypeError('--pooled cannot be combined with --seed.');
  }
  const report = seed === undefined ? runPooledBacktest() : runBacktest(seed);
  const output =
    comparisonPath === undefined
      ? report
      : compareEngineVersions(
          parseComparisonReport(readFileSync(resolve(comparisonPath), 'utf8')),
          report,
        );
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

const invokedPath = process.argv[1] === undefined ? '' : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`backtest: ${message}\n`);
    process.exitCode = 1;
  }
}
