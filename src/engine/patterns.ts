import type { DayLog, Mood } from '../data/types.ts';
import { addDays, compare, diffDays, type LocalDate } from '../lib/date.ts';
import type { EngineOutput } from './index.ts';
import { isPeriodDay } from './index.ts';

export const PHASES = ['period', 'after', 'middle', 'before'] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABEL: Record<Phase, string> = {
  period: 'Period',
  after: 'After period',
  middle: 'Mid-cycle',
  before: 'Before period',
};

/**
 * Rough cycle phase for a date: during a period, the first half after it, the
 * last seven days before the next start, or the middle. Unknown without a
 * period before the date or a known/predicted next start.
 */
export function phaseOf(output: EngineOutput, date: LocalDate): Phase | undefined {
  if (isPeriodDay(output, date)) return 'period';
  const starts = output.episodes.map((episode) => episode.start);
  const previous = starts.filter((start) => compare(start, date) <= 0).at(-1);
  if (previous === undefined) return undefined;
  const next =
    starts.find((start) => compare(start, date) > 0) ??
    (output.prediction.kind === 'prediction' ? output.prediction.center : undefined);
  if (next === undefined || compare(next, date) <= 0) return undefined;
  if (compare(date, addDays(next, -7)) >= 0) return 'before';
  if (diffDays(previous, date) <= Math.floor(diffDays(previous, next) / 2)) return 'after';
  return 'middle';
}

export const MIN_DAYS_FOR_PATTERN = 5;

/** A share with how many logged days it is based on; undefined below the minimum. */
export interface Share {
  readonly percent?: number;
  readonly basedOn: number;
}

export interface PhasePattern {
  readonly phase: Phase;
  readonly loggedDays: number;
  readonly desire: Share;
  readonly sex: Share;
  readonly satisfaction: Share;
  readonly comfort: Share;
  readonly energy: Share;
  readonly averageSleep?: number;
  readonly topMoods: readonly Mood[];
}

function share(days: readonly DayLog[], counts: (day: DayLog) => boolean | undefined): Share {
  const relevant = days.map(counts).filter((value) => value !== undefined);
  if (relevant.length < MIN_DAYS_FOR_PATTERN) return { basedOn: relevant.length };
  const yes = relevant.filter(Boolean).length;
  return { percent: Math.round((100 * yes) / relevant.length), basedOn: relevant.length };
}

/**
 * Summaries of past logs by phase. They describe what was logged, never what
 * anyone wants now.
 */
export function phasePatterns(
  output: EngineOutput,
  days: readonly DayLog[],
): readonly PhasePattern[] {
  const grouped = new Map<Phase, DayLog[]>(PHASES.map((phase) => [phase, []]));
  for (const day of days) {
    if (compare(day.date, output.today) > 0) continue;
    const phase = phaseOf(output, day.date);
    if (phase !== undefined) grouped.get(phase)!.push(day);
  }
  return PHASES.map((phase) => {
    const logs = grouped.get(phase)!;
    const sleep = logs.flatMap((day) => (day.sleepHours === undefined ? [] : [day.sleepHours]));
    const moodCounts = new Map<Mood, number>();
    for (const day of logs) {
      for (const mood of day.mood ?? []) moodCounts.set(mood, (moodCounts.get(mood) ?? 0) + 1);
    }
    const topMoods = [...moodCounts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([mood]) => mood);
    return {
      phase,
      loggedDays: logs.length,
      desire: share(logs, (day) =>
        day.desire === undefined ? undefined : day.desire === 'medium' || day.desire === 'high',
      ),
      // Sex is only counted on days with something logged, so an unlogged day is not "no sex".
      sex: share(logs, (day) => day.sex !== undefined),
      satisfaction: share(logs, (day) =>
        day.sex?.satisfaction === undefined ? undefined : day.sex.satisfaction === 'high',
      ),
      comfort: share(logs, (day) =>
        day.sex?.comfort === undefined
          ? undefined
          : day.sex.comfort === 'okay' || day.sex.comfort === 'comfortable',
      ),
      energy: share(logs, (day) => (day.energy === undefined ? undefined : day.energy === 'high')),
      ...(sleep.length >= MIN_DAYS_FOR_PATTERN
        ? {
            averageSleep:
              Math.round((10 * sleep.reduce((sum, hours) => sum + hours, 0)) / sleep.length) / 10,
          }
        : {}),
      topMoods,
    };
  });
}
