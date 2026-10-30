import type { EngineInput, EngineParams, Episode } from '../../contracts/engine-api.ts';
import type { EpisodeFlag, EpisodeKind } from '../../contracts/enums.ts';
import type { DayLog } from '../../contracts/entities.ts';
import type { LocalDate } from '../../contracts/localdate.ts';
import { addDays, compare, diffDays } from '../../lib/localdate/index.ts';

export type EpisodeParameters = Pick<EngineParams, 'defaultPeriodLen' | 'minCycleLen'>;

export interface EpisodeOptions extends EpisodeParameters {
  /** Optional explicit expected period length; defaults to the A3 estimate. */
  readonly expectedPeriodLength?: number;
}

/** A1/A3 DESIGN defaults from `algorithms-spec.md` Parameters v1. */
export const EPISODE_DEFAULTS: EpisodeParameters = {
  defaultPeriodLen: 5,
  minCycleLen: 15,
};

interface EpisodeDraft {
  readonly start: LocalDate;
  end: LocalDate;
  readonly bleedingDates: Set<LocalDate>;
  readonly spottingDays: LocalDate[];
  kind: EpisodeKind;
}

const PERIOD_FLOW = new Set(['light', 'medium', 'heavy', 'very_heavy']);
const WITHDRAWAL_METHODS = new Set(['combined_pill', 'patch', 'ring']);

function isPeriodFlow(flow: DayLog['flow']): boolean {
  return flow !== undefined && PERIOD_FLOW.has(flow);
}

// DESIGN extension pending P4 postpartum mode: positive lochia logs are labelled separately.
function isLochiaDay(log: DayLog | undefined): boolean {
  return log?.lochia !== undefined && log.lochia !== 'none';
}

function hasActiveWithdrawalMethod(date: LocalDate, input: EngineInput): boolean {
  return input.profile.contraception.some(
    (state) =>
      WITHDRAWAL_METHODS.has(state.method) &&
      state.regimen.breakDays > 0 &&
      compare(date, state.startDate) >= 0 &&
      (state.endDate === undefined || compare(date, state.endDate) <= 0),
  );
}

function kindForStart(date: LocalDate, input: EngineInput, log: DayLog | undefined): EpisodeKind {
  if (isLochiaDay(log)) return 'postpartum_lochia';
  return hasActiveWithdrawalMethod(date, input) ? 'withdrawal' : 'period';
}

function distanceFromEpisode(date: LocalDate, episode: EpisodeDraft): number {
  if (compare(date, episode.start) < 0) return diffDays(date, episode.start);
  if (compare(date, episode.end) > 0) return diffDays(episode.end, date);
  return 0;
}

/**
 * Derive A1 bleeding episodes from merged daily logs. Input arrays are never
 * mutated; logs and overrides after `today` are ignored (engine invariant E5).
 */
export function deriveEpisodes(
  input: EngineInput,
  options: EpisodeOptions = EPISODE_DEFAULTS,
): readonly Episode[] {
  // The EngineInput contract supplies one merged DayLog per localDate.
  const logsByDate = new Map<LocalDate, DayLog>();
  for (const log of input.dayLogs) {
    if (compare(log.localDate, input.today) <= 0) logsByDate.set(log.localDate, log);
  }

  const starts = new Set<LocalDate>();
  const notStarts = new Set<LocalDate>();
  for (const override of input.episodesOverride) {
    if (compare(override.localDate, input.today) > 0) continue;
    if (override.kind === 'start') starts.add(override.localDate);
    if (override.kind === 'not_start') notStarts.add(override.localDate);
  }

  const eventDates = new Set<LocalDate>(starts);
  for (const [date, log] of logsByDate) {
    if (isPeriodFlow(log.flow) || isLochiaDay(log)) eventDates.add(date);
  }

  const drafts: EpisodeDraft[] = [];
  let suppressedFlowEnd: LocalDate | undefined;
  const orderedEventDates = [...eventDates].sort(compare);
  for (const date of orderedEventDates) {
    const log = logsByDate.get(date);
    const hasFlow = isPeriodFlow(log?.flow);
    const hasLochia = isLochiaDay(log);
    const forcedStart = starts.has(date);
    const last = drafts[drafts.length - 1];
    const extendsOpenEpisode = !forcedStart && last !== undefined && diffDays(last.end, date) <= 2;

    if (forcedStart) suppressedFlowEnd = undefined;
    if (
      !forcedStart &&
      hasFlow &&
      !hasLochia &&
      !extendsOpenEpisode &&
      suppressedFlowEnd !== undefined
    ) {
      if (diffDays(suppressedFlowEnd, date) <= 2) {
        suppressedFlowEnd = date;
        continue;
      }
      suppressedFlowEnd = undefined;
    }

    if (extendsOpenEpisode && last !== undefined) {
      last.end = date;
      last.bleedingDates.add(date);
      if (hasLochia) last.kind = 'postpartum_lochia';
      if (hasFlow) suppressedFlowEnd = undefined;
      continue;
    }

    if (!hasFlow && !hasLochia && !forcedStart) continue;
    if (!hasLochia && !forcedStart && notStarts.has(date)) {
      if (hasFlow) suppressedFlowEnd = date;
      continue;
    }

    suppressedFlowEnd = undefined;
    drafts.push({
      start: date,
      end: date,
      // A start override asserts a period start even if no flow value was logged.
      bleedingDates: new Set([date]),
      spottingDays: [],
      kind: kindForStart(date, input, log),
    });
  }

  const spottingDates = [...logsByDate.entries()]
    .filter(([date, log]) => log.flow === 'spotting' && !starts.has(date))
    .map(([date]) => date)
    .sort(compare);
  for (const date of spottingDates) {
    let nearest: EpisodeDraft | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const draft of drafts) {
      const distance = distanceFromEpisode(date, draft);
      if (distance <= 2 && distance < nearestDistance) {
        nearest = draft;
        nearestDistance = distance;
      }
    }
    nearest?.spottingDays.push(date);
  }

  const baseEpisodes: Episode[] = drafts.map((draft, index) => {
    const flags: EpisodeFlag[] = [];
    const previous = drafts[index - 1];
    if (previous !== undefined && diffDays(previous.start, draft.start) < options.minCycleLen) {
      flags.push('short_interval');
    }
    return {
      start: draft.start,
      end: draft.end,
      bleedingDays: draft.bleedingDates.size,
      spottingDays: draft.spottingDays,
      assumedDays: [],
      kind: draft.kind,
      flags,
    };
  });

  const latest = drafts[drafts.length - 1];
  const latestEpisode = baseEpisodes[baseEpisodes.length - 1];
  const latestIsInProgress =
    latest !== undefined &&
    latestEpisode !== undefined &&
    latest.bleedingDates.size === 1 &&
    latest.bleedingDates.has(latest.start);
  const completedEpisodes = latestIsInProgress ? baseEpisodes.slice(0, -1) : baseEpisodes;
  const expectedPeriodLength =
    options.expectedPeriodLength ??
    estimatePeriodLength(input, completedEpisodes, { defaultPeriodLen: options.defaultPeriodLen });

  const assumedDays: LocalDate[] = [];
  if (latest !== undefined && latestIsInProgress) {
    const elapsed = diffDays(latest.start, input.today);
    if (elapsed >= 0 && elapsed < expectedPeriodLength) {
      const assumedCount = Math.min(elapsed, expectedPeriodLength - 1);
      for (let offset = 1; offset <= assumedCount; offset += 1) {
        const assumedDate = addDays(latest.start, offset);
        if (logsByDate.get(assumedDate)?.flow === undefined) assumedDays.push(assumedDate);
      }
    }
  }

  return baseEpisodes.map((episode, index) =>
    index === baseEpisodes.length - 1 ? { ...episode, assumedDays } : episode,
  );
}

/** Estimate A3 period duration from up to six recent completed period episodes. */
export function estimatePeriodLength(
  input: EngineInput,
  episodes: readonly Episode[],
  options: Pick<EngineParams, 'defaultPeriodLen'> = EPISODE_DEFAULTS,
): number {
  const recent = [...episodes]
    .filter(
      (episode) =>
        episode.kind === 'period' &&
        episode.assumedDays.length === 0 &&
        !episode.flags.includes('short_interval'),
    )
    .sort((left, right) => compare(left.start, right.start))
    .slice(-6);
  if (recent.length === 0) return input.profile.typicalPeriodLength ?? options.defaultPeriodLen;

  const lengths = recent.map((episode) => episode.bleedingDays).sort((left, right) => left - right);
  const middle = Math.floor(lengths.length / 2);
  const middleValue = lengths[middle];
  if (middleValue === undefined) throw new Error('Expected at least one period length');
  if (lengths.length % 2 === 1) return middleValue;

  const lowerMiddle = lengths[middle - 1];
  if (lowerMiddle === undefined) throw new Error('Expected an even median pair');
  return Math.floor((lowerMiddle + middleValue) / 2 + 0.5);
}
