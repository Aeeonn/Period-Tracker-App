import type { DayBundle, Hlc } from '../../src/contracts/entities.ts';
import type { DeviceId } from '../../src/contracts/brand.ts';
import type { LocalDate } from '../../src/contracts/localdate.ts';
import { addDays, parse } from '../../src/lib/localdate/index.ts';

export const GENERATOR_VERSION = 1 as const;
const parsedStartDate = parse('2020-01-01');
if (parsedStartDate === null) throw new Error('The fixed synthetic date anchor must be valid.');
export const DEFAULT_START_DATE: LocalDate = parsedStartDate;

const SYNTHETIC_DEVICE_ID = 'synthetic-generator-v1' as DeviceId;
const PROVENANCE =
  'Synthetic generator output from the versioned A18 scenario parameters; no real records. Not clinically validated.';
const STABLE_CYCLE_COUNT = 12;
const DEFAULT_DRIFT_MEAN = 28;
const POST_PILL_CYCLES = 2;

type ScenarioId = 'stable' | 'drift' | 'outliers' | 'skipped-logs' | 'irregular' | 'post-pill';
type SkippedLogProbability = 0.1 | 0.2;
type CyclePhase = 'stable' | 'before-step' | 'after-step' | 'post-pill';

export interface SyntheticHistory {
  readonly trueStarts: readonly LocalDate[];
  readonly observedStarts: readonly LocalDate[];
  /** One value per pair of consecutive true starts. */
  readonly cycleLengthsDays: readonly number[];
  /** One phase label for each cycle length, useful for synthetic scenario inspection. */
  readonly cyclePhases: readonly CyclePhase[];
}

export interface SyntheticScenarioOutput {
  readonly synthetic: true;
  readonly provenance: string;
  readonly generatorVersion: typeof GENERATOR_VERSION;
  readonly scenario: ScenarioId;
  readonly seed: number;
  readonly variant?: `unlogged-${SkippedLogProbability}`;
  readonly profile: {
    readonly meanCycleLengthDays: number;
    readonly withinPersonSdDays: number;
  };
  readonly history: SyntheticHistory;
  readonly dayBundles: readonly DayBundle[];
}

export interface SyntheticPreviewData {
  readonly synthetic: true;
  readonly provenance: string;
  readonly generatorVersion: typeof GENERATOR_VERSION;
  readonly seed: number;
  readonly scenarios: readonly SyntheticScenarioOutput[];
}

interface RandomSource {
  next(): number;
}

interface ScenarioOptions {
  readonly seed: number;
  readonly startDate?: LocalDate;
  readonly skippedLogProbability?: SkippedLogProbability;
}

function requireSeed(seed: number): void {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff)
    throw new RangeError(`Seed must be an unsigned 32-bit integer: ${String(seed)}`);
}

/** Mulberry32: a small, explicit PRNG; no ambient or platform random state. */
function createRandomSource(seed: number): RandomSource {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
    },
  };
}

function uniform(random: RandomSource, min: number, max: number): number {
  return min + random.next() * (max - min);
}

function uniformInteger(random: RandomSource, min: number, max: number): number {
  return min + Math.floor(random.next() * (max - min + 1));
}

function gaussian(random: RandomSource, mean: number, standardDeviation: number): number {
  let first = random.next();
  while (first === 0) first = random.next();
  const second = random.next();
  const standardNormal = Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
  return Math.round(mean + standardDeviation * standardNormal);
}

function drawStableProfile(random: RandomSource): {
  readonly meanCycleLengthDays: number;
  readonly withinPersonSdDays: number;
} {
  const standardDeviations = [1, 2, 3, 4] as const;
  return {
    meanCycleLengthDays: uniform(random, 24, 35),
    withinPersonSdDays:
      standardDeviations[uniformInteger(random, 0, standardDeviations.length - 1)]!,
  };
}

function startsFromLengths(startDate: LocalDate, lengths: readonly number[]): LocalDate[] {
  const starts = [startDate];
  let current = startDate;
  for (const length of lengths) {
    if (!Number.isSafeInteger(length) || length <= 0)
      throw new RangeError(`A generated cycle length cannot advance LocalDate: ${String(length)}`);
    current = addDays(current, length);
    starts.push(current);
  }
  return starts;
}

function makeDayBundles(observedStarts: readonly LocalDate[]): DayBundle[] {
  return observedStarts.map((localDate, index) => {
    const flowHlc: Hlc = {
      // Deterministic synthetic ordering metadata, not a clock reading.
      wallMs: 0,
      counter: index,
      deviceId: SYNTHETIC_DEVICE_ID,
    };
    return {
      localDate,
      flow: 'medium',
      fieldHlc: { flow: flowHlc },
    };
  });
}

function makeOutput(
  scenario: ScenarioId,
  seed: number,
  profile: SyntheticScenarioOutput['profile'],
  cycleLengthsDays: readonly number[],
  cyclePhases: readonly CyclePhase[],
  options: ScenarioOptions,
): SyntheticScenarioOutput {
  const trueStarts = startsFromLengths(options.startDate ?? DEFAULT_START_DATE, cycleLengthsDays);
  let observedStarts = trueStarts;
  let variant: SyntheticScenarioOutput['variant'];

  if (scenario === 'skipped-logs') {
    const probability = options.skippedLogProbability;
    if (probability !== 0.1 && probability !== 0.2)
      throw new TypeError('Skipped-log generation requires an explicit probability of 0.1 or 0.2.');
    variant = `unlogged-${probability}`;
    const random = createRandomSource((seed ^ 0x9e37_79b9) >>> 0);
    // Keep the first start as an anchor; each subsequent true start represents one cycle.
    observedStarts = trueStarts.filter(
      (start, index) => index === 0 || random.next() >= probability,
    );
  }

  const result: SyntheticScenarioOutput = {
    synthetic: true,
    provenance: PROVENANCE,
    generatorVersion: GENERATOR_VERSION,
    scenario,
    seed,
    ...(variant === undefined ? {} : { variant }),
    profile,
    history: {
      trueStarts,
      observedStarts,
      cycleLengthsDays,
      cyclePhases,
    },
    dayBundles: makeDayBundles(observedStarts),
  };
  return result;
}

export function generateScenario(
  scenario: ScenarioId,
  options: ScenarioOptions,
): SyntheticScenarioOutput {
  requireSeed(options.seed);
  const random = createRandomSource(options.seed);
  const startDate = options.startDate ?? DEFAULT_START_DATE;
  let profile: SyntheticScenarioOutput['profile'];
  let cycleLengthsDays: number[];
  let cyclePhases: CyclePhase[];

  switch (scenario) {
    case 'stable':
      profile = drawStableProfile(random);
      cycleLengthsDays = Array.from({ length: STABLE_CYCLE_COUNT }, () =>
        gaussian(random, profile.meanCycleLengthDays, profile.withinPersonSdDays),
      );
      cyclePhases = cycleLengthsDays.map(() => 'stable');
      break;
    case 'drift':
      profile = {
        meanCycleLengthDays: DEFAULT_DRIFT_MEAN,
        withinPersonSdDays: 1,
      };
      cycleLengthsDays = [
        ...Array.from({ length: 8 }, () => gaussian(random, DEFAULT_DRIFT_MEAN, 1)),
        ...Array.from({ length: 6 }, () => gaussian(random, DEFAULT_DRIFT_MEAN - 4, 1)),
      ];
      cyclePhases = cycleLengthsDays.map((_, index) => (index < 8 ? 'before-step' : 'after-step'));
      break;
    case 'outliers':
      profile = drawStableProfile(random);
      cycleLengthsDays = Array.from({ length: STABLE_CYCLE_COUNT }, () => {
        const baseLength = gaussian(
          random,
          profile.meanCycleLengthDays,
          profile.withinPersonSdDays,
        );
        return random.next() < 0.05 ? baseLength + uniformInteger(random, 8, 14) : baseLength;
      });
      cyclePhases = cycleLengthsDays.map(() => 'stable');
      break;
    case 'skipped-logs':
      profile = drawStableProfile(random);
      cycleLengthsDays = Array.from({ length: STABLE_CYCLE_COUNT }, () =>
        gaussian(random, profile.meanCycleLengthDays, profile.withinPersonSdDays),
      );
      cyclePhases = cycleLengthsDays.map(() => 'stable');
      break;
    case 'irregular': {
      const meanCycleLengthDays = uniform(random, 24, 35);
      const irregularSd = uniform(random, 5, 9);
      profile = {
        meanCycleLengthDays,
        withinPersonSdDays: irregularSd,
      };
      cycleLengthsDays = Array.from({ length: STABLE_CYCLE_COUNT }, () =>
        gaussian(random, meanCycleLengthDays, irregularSd),
      );
      cyclePhases = cycleLengthsDays.map(() => 'stable');
      break;
    }
    case 'post-pill':
      profile = drawStableProfile(random);
      cycleLengthsDays = [
        ...Array.from({ length: POST_PILL_CYCLES }, () =>
          gaussian(random, profile.meanCycleLengthDays + 5, 5),
        ),
        ...Array.from({ length: STABLE_CYCLE_COUNT }, () =>
          gaussian(random, profile.meanCycleLengthDays, profile.withinPersonSdDays),
        ),
      ];
      cyclePhases = cycleLengthsDays.map((_, index) =>
        index < POST_PILL_CYCLES ? 'post-pill' : 'stable',
      );
      break;
  }

  return makeOutput(scenario, options.seed, profile, cycleLengthsDays, cyclePhases, {
    ...options,
    startDate,
  });
}

export function generatePreviewData(seed = 42): SyntheticPreviewData {
  requireSeed(seed);
  const options = { seed };
  return {
    synthetic: true,
    provenance: PROVENANCE,
    generatorVersion: GENERATOR_VERSION,
    seed,
    scenarios: [
      generateScenario('stable', options),
      generateScenario('drift', options),
      generateScenario('outliers', options),
      generateScenario('skipped-logs', { ...options, skippedLogProbability: 0.1 }),
      generateScenario('skipped-logs', { ...options, skippedLogProbability: 0.2 }),
      generateScenario('irregular', options),
      generateScenario('post-pill', options),
    ],
  };
}
