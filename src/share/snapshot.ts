import type { DayLog, ShareCategory } from '../data/types.ts';
import { SHARE_CATEGORIES } from '../data/types.ts';
import type { EngineOutput } from '../engine/index.ts';
import { addDays, compare, diffDays, type DateRange, type LocalDate } from '../lib/date.ts';

/** Which day fields each category shares. Notes are never shared. */
export const CATEGORY_FIELDS: Record<
  Exclude<ShareCategory, 'fertility'>,
  readonly (keyof DayLog)[]
> = {
  period: ['flow', 'soaking', 'pain'],
  body: ['symptoms', 'energy', 'discharge'],
  mood: ['mood'],
  desire: ['desire'],
  sex: ['sex'],
  habits: ['sleepHours', 'sleepQuality', 'activityMinutes', 'alcohol', 'water'],
};

export const SNAPSHOT_DAYS = 183;

export type SharedDay = Partial<Omit<DayLog, 'notes'>> & { readonly date: LocalDate };

export interface SharedPeriod {
  readonly cycleStart?: LocalDate;
  readonly periodDays: readonly LocalDate[];
  readonly prediction?: {
    readonly center: LocalDate;
    readonly lo: LocalDate;
    readonly hi: LocalDate;
  };
  readonly noPredictionReason?: string;
  readonly basis: string;
}

export interface SharedFertility {
  readonly window: DateRange;
  readonly higher: DateRange;
}

export interface Snapshot {
  readonly v: 1;
  /** Milliseconds since the epoch, from her phone. */
  readonly createdAt: number;
  /** Her local date when the snapshot was made. */
  readonly madeOn: LocalDate;
  readonly paused: boolean;
  readonly categories: readonly ShareCategory[];
  readonly period?: SharedPeriod;
  readonly fertility?: SharedFertility;
  readonly days: readonly SharedDay[];
}

/**
 * Build what her partner may see: only the categories she switched on, only the
 * last six months, never notes. A paused snapshot carries no data at all.
 */
export function buildSnapshot(input: {
  readonly output: EngineOutput;
  readonly days: readonly DayLog[];
  readonly categories: readonly ShareCategory[];
  readonly paused: boolean;
  readonly now: number;
}): Snapshot {
  const { output, paused } = input;
  const today = output.today;
  const categories = SHARE_CATEGORIES.filter((category) => input.categories.includes(category));
  const base = { v: 1 as const, createdAt: input.now, madeOn: today, paused };
  if (paused) return { ...base, categories: [], days: [] };

  const from = addDays(today, -(SNAPSHOT_DAYS - 1));
  const recent = (date: LocalDate): boolean =>
    compare(date, from) >= 0 && compare(date, today) <= 0;

  const fields = new Set<keyof DayLog>(
    categories.flatMap((category) => (category === 'fertility' ? [] : CATEGORY_FIELDS[category])),
  );
  const days: SharedDay[] = [];
  for (const day of [...input.days].sort((a, b) => compare(a.date, b.date))) {
    if (!recent(day.date)) continue;
    const shared: Record<string, unknown> = {};
    for (const field of fields) if (day[field] !== undefined) shared[field] = day[field];
    if (Object.keys(shared).length > 0) days.push({ date: day.date, ...shared } as SharedDay);
  }

  let period: SharedPeriod | undefined;
  if (categories.includes('period')) {
    const periodDays: LocalDate[] = [];
    for (const episode of output.episodes) {
      for (let offset = 0; offset <= diffDays(episode.start, episode.end); offset += 1) {
        periodDays.push(addDays(episode.start, offset));
      }
      periodDays.push(...episode.assumedDays);
    }
    const prediction = output.prediction;
    period = {
      ...(output.cycleStart ? { cycleStart: output.cycleStart } : {}),
      periodDays: periodDays.filter(recent).sort(compare),
      ...(prediction.kind === 'prediction'
        ? { prediction: { center: prediction.center, lo: prediction.lo, hi: prediction.hi } }
        : { noPredictionReason: prediction.reason }),
      basis: output.basis,
    };
  }

  let fertility: SharedFertility | undefined;
  if (categories.includes('fertility') && output.fertility.kind === 'estimate') {
    fertility = { window: output.fertility.window, higher: output.fertility.higher };
  }

  return {
    ...base,
    categories,
    ...(period ? { period } : {}),
    ...(fertility ? { fertility } : {}),
    days,
  };
}

/** Loose structural check for a decrypted snapshot. */
export function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== 'object' || value === null) return false;
  const snapshot = value as Partial<Snapshot>;
  return (
    snapshot.v === 1 &&
    typeof snapshot.createdAt === 'number' &&
    typeof snapshot.madeOn === 'string' &&
    typeof snapshot.paused === 'boolean' &&
    Array.isArray(snapshot.categories) &&
    Array.isArray(snapshot.days)
  );
}
