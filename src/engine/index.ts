import { isHormonal, type Contraception, type DayLog } from '../data/types.ts';
import { addDays, compare, diffDays, type DateRange, type LocalDate } from '../lib/date.ts';
import { deriveEpisodes, estimatePeriodLength, type Episode } from './episodes.ts';

export type { Episode } from './episodes.ts';

export interface EngineInput {
  /** Device-local today, passed in; the engine never reads a clock. */
  readonly today: LocalDate;
  readonly days: readonly DayLog[];
  readonly contraception: Contraception;
  readonly cycleLength?: number;
  readonly periodLength?: number;
}

export const PARAMS = {
  historyMaxCycles: 12,
  minCycleLength: 15,
  maxCycleLength: 90,
  maxCycleAgeDays: 365,
  recencyDecay: 0.85,
  defaultCycleLength: 28,
  defaultPeriodLength: 5,
  halfWidthNoHistory: { unknownTypical: 7, typicalGiven: 5 },
  halfWidthClamp: { min: 2, max: 10 },
  /** On a hormonal method: minimum episodes before predicting, and minimum half-width. */
  hormonal: { minEpisodes: 3, minHalfWidth: 4 },
  luteal: { min: 12, max: 16, convention: 14 },
  fertileWindow: { before: 5, after: 1 },
  missedLogRatio: { min: 1.6, max: 2.4 },
} as const;

export type CycleExclusion = 'too_short' | 'too_long' | 'too_old' | 'possible_missed_log';

export interface Cycle {
  readonly start: LocalDate;
  readonly nextStart: LocalDate;
  readonly length: number;
  readonly excluded?: CycleExclusion;
}

export interface Prediction {
  readonly kind: 'prediction';
  /** Most likely start of the next period. Invariant: lo <= center <= hi. */
  readonly center: LocalDate;
  readonly lo: LocalDate;
  readonly hi: LocalDate;
  readonly state: 'upcoming' | 'expected_now' | 'late';
  readonly daysLate?: number;
  readonly cyclesUsed: number;
  readonly cycleLength: number;
  readonly periodLength: number;
  readonly variability?: 'regular' | 'variable';
}

export type NoPredictionReason = 'no_data' | 'hormonal_few_periods' | 'no_recent_period';

export interface NoPrediction {
  readonly kind: 'none';
  readonly reason: NoPredictionReason;
}

export interface FertilityEstimate {
  readonly kind: 'estimate';
  readonly ovulation: LocalDate;
  /** Estimated fertile window: five days before ovulation through the day after. */
  readonly window: DateRange;
  /** The three days up to and including estimated ovulation. */
  readonly higher: DateRange;
  /** Wider band reflecting the uncertainty of the period prediction. */
  readonly possible: DateRange;
  /** A copper IUD doesn't change ovulation, so the estimate is shown with a note. */
  readonly copperIud: boolean;
}

export type NoFertilityReason = 'hormonal' | 'no_prediction' | 'late' | 'cycle_length';

export interface NoFertility {
  readonly kind: 'none';
  readonly reason: NoFertilityReason;
}

export interface Warning {
  readonly id: 'heavy_bleeding_emergency';
  readonly dates: readonly LocalDate[];
}

export interface EngineOutput {
  readonly today: LocalDate;
  readonly episodes: readonly Episode[];
  readonly cycles: readonly Cycle[];
  readonly prediction: Prediction | NoPrediction;
  readonly fertility: FertilityEstimate | NoFertility;
  readonly warnings: readonly Warning[];
  /** Start of the current cycle (latest period start), if any. */
  readonly cycleStart?: LocalDate;
  /** One or two sentences on what the prediction is based on. */
  readonly basis: string;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Weighted median of cycle lengths, newest cycle weighted 1, then decaying. */
function weightedMedian(newestFirst: readonly Cycle[], decay: number): number {
  const weighted = newestFirst
    .map((cycle, index) => ({ cycle, weight: decay ** index }))
    .sort((a, b) => a.cycle.length - b.cycle.length || compare(a.cycle.start, b.cycle.start));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cumulative = 0;
  for (const item of weighted) {
    cumulative += item.weight;
    if (cumulative >= total / 2) return item.cycle.length;
  }
  return weighted.at(-1)!.cycle.length;
}

function buildCycles(today: LocalDate, episodes: readonly Episode[]): Cycle[] {
  const cycles: Cycle[] = [];
  for (let index = 0; index + 1 < episodes.length; index += 1) {
    const start = episodes[index]!.start;
    const nextStart = episodes[index + 1]!.start;
    const length = diffDays(start, nextStart);
    let excluded: CycleExclusion | undefined;
    if (length < PARAMS.minCycleLength) excluded = 'too_short';
    else if (length > PARAMS.maxCycleLength) excluded = 'too_long';
    else if (compare(start, addDays(today, -PARAMS.maxCycleAgeDays)) < 0) excluded = 'too_old';
    cycles.push({ start, nextStart, length, ...(excluded ? { excluded } : {}) });
  }

  // A cycle about twice the usual length probably hides an unlogged period.
  const valid = cycles.filter((cycle) => cycle.excluded === undefined);
  return cycles.map((cycle) => {
    if (cycle.excluded !== undefined) return cycle;
    const others = valid.filter((candidate) => candidate !== cycle);
    if (others.length < 3) return cycle;
    const reference = weightedMedian([...others].reverse(), PARAMS.recencyDecay);
    const ratio = cycle.length / reference;
    if (ratio >= PARAMS.missedLogRatio.min && ratio <= PARAMS.missedLogRatio.max) {
      return { ...cycle, excluded: 'possible_missed_log' };
    }
    return cycle;
  });
}

function smallSamplePenalty(count: number): number {
  if (count === 1) return 3;
  if (count === 2) return 2;
  if (count <= 5) return 1;
  return 0;
}

function variability(
  today: LocalDate,
  cycles: readonly Cycle[],
): 'regular' | 'variable' | undefined {
  const recent = cycles.filter(
    (cycle) => cycle.excluded === undefined && compare(cycle.start, addDays(today, -183)) >= 0,
  );
  if (recent.length < 2) return undefined;
  const lengths = recent.map((cycle) => cycle.length);
  return Math.max(...lengths) - Math.min(...lengths) <= 7 ? 'regular' : 'variable';
}

function forecast(
  input: EngineInput,
  episodes: readonly Episode[],
  cycles: readonly Cycle[],
  lastStart: LocalDate,
  hormonal: boolean,
): Prediction {
  const valid = cycles
    .filter((cycle) => cycle.excluded === undefined)
    .slice(-PARAMS.historyMaxCycles);
  const newestFirst = [...valid].reverse();
  const used = newestFirst.length;
  const cycleLength =
    used === 0
      ? (input.cycleLength ?? PARAMS.defaultCycleLength)
      : weightedMedian(newestFirst, PARAMS.recencyDecay);
  const mad = used === 0 ? 0 : median(newestFirst.map((c) => Math.abs(c.length - cycleLength)));
  const unbounded =
    used === 0
      ? input.cycleLength === undefined
        ? PARAMS.halfWidthNoHistory.unknownTypical
        : PARAMS.halfWidthNoHistory.typicalGiven
      : Math.ceil(1.5 * mad) + smallSamplePenalty(used);
  let halfWidth = Math.max(
    PARAMS.halfWidthClamp.min,
    Math.min(PARAMS.halfWidthClamp.max, unbounded),
  );
  if (hormonal) halfWidth = Math.max(PARAMS.hormonal.minHalfWidth, halfWidth);

  const center = addDays(lastStart, cycleLength);
  let lo = addDays(center, -halfWidth);
  let hi = addDays(center, halfWidth);
  // Keep the last cycle's length inside the window so a recent change is never ruled out.
  const lastCycle = newestFirst[0];
  if (lastCycle !== undefined) {
    const repeat = addDays(lastStart, lastCycle.length);
    if (compare(repeat, lo) < 0) lo = repeat;
    if (compare(repeat, hi) > 0) hi = repeat;
  }

  const state =
    compare(input.today, lo) < 0
      ? 'upcoming'
      : compare(input.today, hi) <= 0
        ? 'expected_now'
        : 'late';
  const label = variability(input.today, cycles);
  return {
    kind: 'prediction',
    center,
    lo,
    hi,
    state,
    ...(state === 'late' ? { daysLate: diffDays(center, input.today) } : {}),
    cyclesUsed: used,
    cycleLength,
    periodLength: estimatePeriodLength(episodes, input.periodLength ?? PARAMS.defaultPeriodLength),
    ...(label ? { variability: label } : {}),
  };
}

function fertilityFor(
  input: EngineInput,
  prediction: Prediction | NoPrediction,
): FertilityEstimate | NoFertility {
  if (isHormonal(input.contraception)) return { kind: 'none', reason: 'hormonal' };
  if (prediction.kind === 'none') return { kind: 'none', reason: 'no_prediction' };
  if (prediction.state === 'late') return { kind: 'none', reason: 'late' };
  if (prediction.cyclesUsed >= 3 && (prediction.cycleLength < 21 || prediction.cycleLength > 45)) {
    return { kind: 'none', reason: 'cycle_length' };
  }
  const ovulation = addDays(prediction.center, -PARAMS.luteal.convention);
  return {
    kind: 'estimate',
    ovulation,
    window: {
      start: addDays(ovulation, -PARAMS.fertileWindow.before),
      end: addDays(ovulation, PARAMS.fertileWindow.after),
    },
    higher: { start: addDays(ovulation, -2), end: ovulation },
    possible: {
      start: addDays(prediction.lo, -PARAMS.luteal.max - PARAMS.fertileWindow.before),
      end: addDays(prediction.hi, -PARAMS.luteal.min + PARAMS.fertileWindow.after),
    },
    copperIud: input.contraception === 'copper_iud',
  };
}

const EMERGENCY_SYMPTOMS = new Set(['dizziness', 'breathlessness', 'chest_pain']);

/** Heavy-bleeding emergency: soaking plus a warning symptom on the same day, today or yesterday. */
function warningsFor(input: EngineInput): Warning[] {
  const recent = new Set([input.today, addDays(input.today, -1)]);
  const dates = input.days
    .filter(
      (day) =>
        recent.has(day.date) &&
        day.soaking === true &&
        (day.symptoms ?? []).some((symptom) => EMERGENCY_SYMPTOMS.has(symptom)),
    )
    .map((day) => day.date)
    .sort(compare);
  return dates.length > 0 ? [{ id: 'heavy_bleeding_emergency', dates }] : [];
}

function basisText(
  input: EngineInput,
  prediction: Prediction | NoPrediction,
  cycles: readonly Cycle[],
): string {
  if (prediction.kind === 'none') {
    if (prediction.reason === 'no_data') return 'Log a period to start predictions.';
    if (prediction.reason === 'hormonal_few_periods') {
      return 'Bleeding on a hormonal method varies. Predictions start after three logged periods.';
    }
    return 'No period logged in the last 90 days. On a hormonal method, periods often get lighter or stop, so there is no prediction right now.';
  }
  let text =
    prediction.cyclesUsed === 0
      ? 'Predictions get more personal after a few cycles. Until then the window is wider.'
      : `Based on your last ${prediction.cyclesUsed} ${prediction.cyclesUsed === 1 ? 'cycle' : 'cycles'}.`;
  const latest = cycles.filter((cycle) => cycle.excluded === undefined).at(-1);
  if (latest !== undefined && latest.length !== prediction.cycleLength) {
    text +=
      latest.length < prediction.cycleLength
        ? ' Your last cycle was shorter than usual.'
        : ' Your last cycle was longer than usual.';
  }
  if (isHormonal(input.contraception))
    text += ' On a hormonal method the window is at least 4 days wide.';
  return text;
}

/** Pure and deterministic: the same input always gives the same output. */
export function runEngine(input: EngineInput): EngineOutput {
  const days = input.days.filter((day) => compare(day.date, input.today) <= 0);
  const episodes = deriveEpisodes(days, input.today, {
    minCycleLength: PARAMS.minCycleLength,
    defaultPeriodLength: input.periodLength ?? PARAMS.defaultPeriodLength,
  });
  const cycles = buildCycles(input.today, episodes);
  const hormonal = isHormonal(input.contraception);
  const lastStart = episodes.at(-1)?.start;

  let prediction: Prediction | NoPrediction;
  if (lastStart === undefined) {
    prediction = { kind: 'none', reason: 'no_data' };
  } else if (hormonal && episodes.length < PARAMS.hormonal.minEpisodes) {
    prediction = { kind: 'none', reason: 'hormonal_few_periods' };
  } else if (hormonal && diffDays(lastStart, input.today) > PARAMS.maxCycleLength) {
    prediction = { kind: 'none', reason: 'no_recent_period' };
  } else {
    prediction = forecast(input, episodes, cycles, lastStart, hormonal);
  }

  return {
    today: input.today,
    episodes,
    cycles,
    prediction,
    fertility: fertilityFor(input, prediction),
    warnings: warningsFor({ ...input, days }),
    ...(lastStart ? { cycleStart: lastStart } : {}),
    basis: basisText(input, prediction, cycles),
  };
}

/** Cycle day (1 = first day of the latest period), or undefined before any period. */
export function cycleDay(output: EngineOutput, today: LocalDate): number | undefined {
  return output.cycleStart === undefined ? undefined : diffDays(output.cycleStart, today) + 1;
}

/** True when `date` falls inside a logged or assumed period. */
export function isPeriodDay(output: EngineOutput, date: LocalDate): boolean {
  return output.episodes.some(
    (episode) =>
      (compare(date, episode.start) >= 0 && compare(date, episode.end) <= 0) ||
      episode.assumedDays.includes(date),
  );
}
