import type { DayLog, Flow } from '../data/types.ts';
import { addDays, compare, diffDays, type LocalDate } from '../lib/date.ts';

/** A bleeding episode derived from flow logs. */
export interface Episode {
  readonly start: LocalDate;
  readonly end: LocalDate;
  /** Days with logged period flow (assumed days excluded). */
  readonly bleedingDays: number;
  readonly spottingDays: readonly LocalDate[];
  /** Unlogged days after a single logged start, assumed to be period days. */
  readonly assumedDays: readonly LocalDate[];
  /** Started less than `minCycleLength` days after the previous episode. */
  readonly shortInterval: boolean;
}

const PERIOD_FLOW: ReadonlySet<Flow> = new Set(['light', 'medium', 'heavy', 'very_heavy']);

export function isPeriodFlow(flow: Flow | undefined): boolean {
  return flow !== undefined && PERIOD_FLOW.has(flow);
}

interface Draft {
  readonly start: LocalDate;
  end: LocalDate;
  readonly bleedingDates: Set<LocalDate>;
  readonly spottingDays: LocalDate[];
}

function distance(date: LocalDate, draft: Draft): number {
  if (compare(date, draft.start) < 0) return diffDays(date, draft.start);
  if (compare(date, draft.end) > 0) return diffDays(draft.end, date);
  return 0;
}

/** Median of the last six completed periods' bleeding days, rounded half up. */
export function estimatePeriodLength(episodes: readonly Episode[], fallback: number): number {
  const lengths = episodes
    .filter((episode) => episode.assumedDays.length === 0 && !episode.shortInterval)
    .slice(-6)
    .map((episode) => episode.bleedingDays)
    .sort((a, b) => a - b);
  if (lengths.length === 0) return fallback;
  const middle = Math.floor(lengths.length / 2);
  if (lengths.length % 2 === 1) return lengths[middle]!;
  return Math.floor((lengths[middle - 1]! + lengths[middle]!) / 2 + 0.5);
}

/**
 * Group period-flow days into episodes. Gaps of up to two days stay in one
 * episode; spotting within two days attaches to the nearest episode but never
 * starts one. Logs after `today` are ignored.
 */
export function deriveEpisodes(
  days: readonly DayLog[],
  today: LocalDate,
  options: { readonly minCycleLength: number; readonly defaultPeriodLength: number },
): readonly Episode[] {
  const byDate = new Map<LocalDate, DayLog>();
  for (const day of days) if (compare(day.date, today) <= 0) byDate.set(day.date, day);

  const drafts: Draft[] = [];
  const flowDates = [...byDate.values()]
    .filter((day) => isPeriodFlow(day.flow))
    .map((day) => day.date)
    .sort(compare);
  for (const date of flowDates) {
    const last = drafts.at(-1);
    // Up to two unlogged days between flow days keep the same period going.
    if (last !== undefined && diffDays(last.end, date) <= 3) {
      last.end = date;
      last.bleedingDates.add(date);
    } else {
      drafts.push({ start: date, end: date, bleedingDates: new Set([date]), spottingDays: [] });
    }
  }

  const spotting = [...byDate.values()]
    .filter((day) => day.flow === 'spotting')
    .map((day) => day.date)
    .sort(compare);
  for (const date of spotting) {
    let nearest: Draft | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const draft of drafts) {
      const gap = distance(date, draft);
      if (gap <= 2 && gap < best) {
        nearest = draft;
        best = gap;
      }
    }
    nearest?.spottingDays.push(date);
  }

  const episodes: Episode[] = drafts.map((draft, index) => {
    const previous = drafts[index - 1];
    return {
      start: draft.start,
      end: draft.end,
      bleedingDays: draft.bleedingDates.size,
      spottingDays: draft.spottingDays,
      assumedDays: [],
      shortInterval:
        previous !== undefined && diffDays(previous.start, draft.start) < options.minCycleLength,
    };
  });

  // A single logged start day implies an ongoing period until the expected length or a "none" log.
  const latest = drafts.at(-1);
  if (latest === undefined || latest.bleedingDates.size !== 1) return episodes;
  const expected = estimatePeriodLength(episodes.slice(0, -1), options.defaultPeriodLength);
  const elapsed = diffDays(latest.start, today);
  const stoppedOn = [...byDate.values()]
    .filter((day) => day.flow === 'none' && compare(day.date, latest.start) > 0)
    .map((day) => day.date)
    .sort(compare)[0];
  const assumed: LocalDate[] = [];
  for (let offset = 1; offset <= Math.min(elapsed, expected - 1); offset += 1) {
    const day = addDays(latest.start, offset);
    if (stoppedOn !== undefined && compare(day, stoppedOn) >= 0) break;
    if (byDate.get(day)?.flow === undefined) assumed.push(day);
  }
  const last = episodes.at(-1)!;
  episodes[episodes.length - 1] = { ...last, assumedDays: assumed };
  return episodes;
}
