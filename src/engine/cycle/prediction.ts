import type {
  CycleStat,
  EngineInput,
  EngineParams,
  Episode,
  PeriodPrediction,
  Suppressed,
} from '../../contracts/engine-api.ts';
import type { CycleExclusionReason } from '../../contracts/enums.ts';
import type { SuppressionReason } from '../../contracts/enums.ts';
import type { LocalDate } from '../../contracts/localdate.ts';
import { addDays, compare, diffDays } from '../../lib/localdate/index.ts';
import { estimatePeriodLength } from '../episodes/index.ts';
import {
  cycleOverlapsPregnancyOrPostpartum,
  currentHormonalEpisode,
  hasActiveHormonalMethod,
  hormonalMethodOverlaps,
  latestObservedPeriodStart,
  recentHormonalStop,
} from './shared.ts';

export interface CyclePredictionResult {
  readonly cycles: readonly CycleStat[];
  readonly prediction: PeriodPrediction | Suppressed;
  readonly coverageStart: LocalDate;
  readonly cycleLength?: number;
  readonly postPillSettling: boolean;
  readonly hormonalEpisodesOnMethod: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) throw new Error('Expected at least one median value');
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[middle - 1];
  if (lower === undefined) throw new Error('Expected an even median pair');
  return (lower + upper) / 2;
}

/** Weighted median with recency weights assigned newest-first. */
function weightedMedian(newestFirst: readonly CycleStat[], decay: number): number {
  if (newestFirst.length === 0) throw new Error('Expected at least one weighted value');
  const weighted = newestFirst
    .map((cycle, index) => ({ cycle, weight: decay ** index }))
    .sort(
      (left, right) =>
        left.cycle.length - right.cycle.length || compare(left.cycle.start, right.cycle.start),
    );
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cumulative = 0;
  for (const item of weighted) {
    cumulative += item.weight;
    if (cumulative >= total / 2) return item.cycle.length;
  }
  const last = weighted[weighted.length - 1];
  if (last === undefined) throw new Error('Expected a weighted median result');
  return last.cycle.length;
}

function exclusionReason(
  input: EngineInput,
  params: EngineParams,
  episodes: readonly Episode[],
  start: LocalDate,
  nextStart: LocalDate,
  length: number,
  methodMode: boolean,
  postPillStop: LocalDate | undefined,
): CycleExclusionReason | undefined {
  if (length < params.minCycleLen) return 'too_short';
  if (length > params.maxCycleLen) return 'too_long';
  if (compare(start, addDays(input.today, -params.maxCycleAgeDays)) < 0) return 'too_old';
  if (
    input.episodesOverride.some(
      (override) => override.kind === 'exclude_cycle' && override.localDate === start,
    )
  ) {
    return 'manual';
  }
  if (cycleOverlapsPregnancyOrPostpartum(input, episodes, start, nextStart)) {
    return 'pregnancy_or_postpartum';
  }
  if (!methodMode && postPillStop !== undefined && compare(start, postPillStop) <= 0) {
    return 'hormonal_method';
  }
  if (!methodMode && hormonalMethodOverlaps(input, start, nextStart)) return 'hormonal_method';
  return undefined;
}

function buildCycleStats(
  input: EngineInput,
  params: EngineParams,
  episodes: readonly Episode[],
  cycleEpisodes: readonly Episode[],
  methodMode: boolean,
  postPillStop: LocalDate | undefined,
): CycleStat[] {
  const ordered = [...cycleEpisodes].sort((left, right) => compare(left.start, right.start));
  const cycles: CycleStat[] = [];
  for (let index = 0; index + 1 < ordered.length; index += 1) {
    const current = ordered[index];
    const next = ordered[index + 1];
    if (current === undefined || next === undefined) continue;
    const length = diffDays(current.start, next.start);
    const reason = exclusionReason(
      input,
      params,
      episodes,
      current.start,
      next.start,
      length,
      methodMode,
      postPillStop,
    );
    cycles.push({
      start: current.start,
      nextStart: next.start,
      length,
      ...(reason === undefined ? {} : { excludedBecause: reason }),
    });
  }

  const valid = cycles.filter((cycle) => cycle.excludedBecause === undefined);
  return cycles.map((cycle) => {
    if (cycle.excludedBecause !== undefined) return cycle;
    const others = valid.filter((candidate) => candidate !== cycle);
    if (others.length < 3) return cycle;
    const referenceLength = weightedMedian([...others].reverse(), params.recencyDecay);
    const ratio = cycle.length / referenceLength;
    const confirmedLong = input.episodesOverride.some(
      (override) => override.kind === 'confirm_long_cycle' && override.localDate === cycle.start,
    );
    if (
      !confirmedLong &&
      ratio >= params.missedLogRatio.min &&
      ratio <= params.missedLogRatio.max
    ) {
      return {
        ...cycle,
        excludedBecause: 'possible_missed_log',
        missedLogPromptDate: addDays(cycle.start, referenceLength),
      };
    }
    return cycle;
  });
}

function smallSamplePenalty(cycles: number, params: EngineParams): number {
  if (cycles === 1) return params.smallSamplePenalty.n1;
  if (cycles === 2) return params.smallSamplePenalty.n2;
  if (cycles <= 5) return params.smallSamplePenalty.n3to5;
  return params.smallSamplePenalty.n6plus;
}

function variabilityLabel(
  input: EngineInput,
  params: EngineParams,
  cycles: readonly CycleStat[],
): 'regular' | 'variable' | undefined {
  const recent = cycles.filter(
    (cycle) =>
      cycle.excludedBecause === undefined && compare(cycle.start, addDays(input.today, -183)) >= 0,
  );
  if (recent.length < 2) return undefined;
  const lengths = recent.map((cycle) => cycle.length);
  const spread = Math.max(...lengths) - Math.min(...lengths);
  const year = Number(input.today.slice(0, 4));
  const age = input.profile.birthYear === undefined ? undefined : year - input.profile.birthYear;
  // V1 fallback: unknown ages and ages outside 18-41 use the 7-day limit; FIGO cites only 18-25 and 26-41.
  const figoLimit = age !== undefined && age >= 18 && age <= 25 ? 9 : 7;
  return spread <= figoLimit ? 'regular' : 'variable';
}

function forecast(
  input: EngineInput,
  params: EngineParams,
  episodes: readonly Episode[],
  cycles: readonly CycleStat[],
  lastStart: LocalDate,
  methodMode: boolean,
  postPillSettling: boolean,
): { readonly prediction: PeriodPrediction; readonly cycleLength: number } {
  const valid = cycles
    .filter((cycle) => cycle.excludedBecause === undefined)
    .slice(-params.historyMaxCycles);
  const newestFirst = [...valid].reverse();
  const used = newestFirst.length;
  const cycleLength =
    used === 0
      ? (input.profile.typicalCycleLength ?? params.defaultCycleLen)
      : weightedMedian(newestFirst, params.recencyDecay);
  const deviations = newestFirst.map((cycle) => Math.abs(cycle.length - cycleLength));
  const mad = deviations.length === 0 ? 0 : median(deviations);
  const settle = postPillSettling ? 2 : 0;
  const unboundedWidth =
    used === 0
      ? (input.profile.typicalCycleLength === undefined
          ? params.halfWidthNoHistory.unknownTypical
          : params.halfWidthNoHistory.typicalGiven) + settle
      : Math.ceil(1.5 * mad) + smallSamplePenalty(used, params) + settle;
  let halfWidth = Math.max(
    params.halfWidthClamp.min,
    Math.min(params.halfWidthClamp.max, unboundedWidth),
  );
  if (methodMode) halfWidth = Math.max(4, halfWidth);

  const center = addDays(lastStart, cycleLength);
  let lo = addDays(center, -halfWidth);
  let hi = addDays(center, halfWidth);
  const lastCycle = newestFirst[0];
  if (used > 0 && lastCycle !== undefined) {
    const lastCycleCenter = addDays(lastStart, lastCycle.length);
    if (compare(lastCycleCenter, lo) < 0) lo = lastCycleCenter;
    if (compare(lastCycleCenter, hi) > 0) hi = lastCycleCenter;
  }

  const state =
    compare(input.today, lo) < 0
      ? 'upcoming'
      : compare(input.today, hi) <= 0
        ? 'expected_now'
        : 'late';
  const expectedPeriodLength = estimatePeriodLength(input, episodes, params);
  const variability = variabilityLabel(input, params, cycles);
  const prediction: PeriodPrediction = {
    kind: 'prediction',
    center,
    lo,
    hi,
    state,
    ...(state === 'late' ? { daysLate: diffDays(center, input.today) } : {}),
    cyclesUsed: used,
    halfWidth,
    ...(variability === undefined ? {} : { variability }),
    expectedPeriodLength,
  };
  return { prediction, cycleLength };
}

export function calculateCyclePrediction(
  input: EngineInput,
  params: EngineParams,
  episodes: readonly Episode[],
): CyclePredictionResult {
  const activeHormonal = hasActiveHormonalMethod(input);
  const activeMethodEpisodes = episodes
    .filter(
      (episode) =>
        (episode.kind === 'period' || episode.kind === 'withdrawal') &&
        currentHormonalEpisode(input, episode),
    )
    .sort((left, right) => compare(left.start, right.start));
  const postPillStop = activeHormonal ? undefined : recentHormonalStop(input);
  const naturalEpisodes = episodes
    .filter(
      (episode) =>
        episode.kind === 'period' &&
        !hormonalMethodOverlaps(input, episode.start, episode.start) &&
        (postPillStop === undefined || compare(episode.start, postPillStop) > 0),
    )
    .sort((left, right) => compare(left.start, right.start));
  const methodMode = activeHormonal && activeMethodEpisodes.length >= 3;
  const cycleEpisodes = activeHormonal ? activeMethodEpisodes : naturalEpisodes;
  const cycles = buildCycleStats(
    input,
    params,
    episodes,
    cycleEpisodes,
    activeHormonal,
    postPillStop,
  );
  const coverageStart = latestObservedPeriodStart(episodes) ?? input.today;
  const postPillSettling = postPillStop !== undefined;

  let suppression: SuppressionReason | undefined;
  if (activeHormonal && activeMethodEpisodes.length < 3) suppression = 'hormonal';
  else if (cycleEpisodes.length === 0) suppression = 'no_data';

  if (suppression !== undefined) {
    return {
      cycles,
      prediction: { kind: 'suppressed', reason: suppression },
      coverageStart,
      postPillSettling,
      hormonalEpisodesOnMethod: activeMethodEpisodes.length,
    };
  }

  const lastStart = cycleEpisodes[cycleEpisodes.length - 1]?.start;
  if (lastStart === undefined) {
    return {
      cycles,
      prediction: { kind: 'suppressed', reason: 'no_data' },
      coverageStart,
      postPillSettling,
      hormonalEpisodesOnMethod: activeMethodEpisodes.length,
    };
  }
  const result = forecast(input, params, episodes, cycles, lastStart, methodMode, postPillSettling);
  return {
    cycles,
    prediction: result.prediction,
    coverageStart,
    cycleLength: result.cycleLength,
    postPillSettling,
    hormonalEpisodesOnMethod: activeMethodEpisodes.length,
  };
}
