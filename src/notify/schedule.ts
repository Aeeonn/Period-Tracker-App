import type { LocalDate } from '../lib/date.ts';
import type { Planned } from './plan.ts';

/** The relay keeps at most this many future send times per phone. */
export const MAX_TIMES = 60;

/** Minutes after midnight for an 'HH:MM' time, or undefined if it isn't one. */
export function minutesOf(time: string): number | undefined {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
}

/**
 * The instant a reminder day's chosen time falls on in this phone's time zone.
 * This is the one place a calendar date becomes a timestamp.
 */
export function instantOf(date: LocalDate, time: string): number {
  const minutes = minutesOf(time) ?? 0;
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60).getTime();
}

/** First day reminders can still go out: today until the chosen time has passed, then tomorrow. */
export function firstReminderDay(
  today: LocalDate,
  tomorrow: LocalDate,
  time: string,
  nowMs: number,
): LocalDate {
  return instantOf(today, time) > nowMs ? today : tomorrow;
}

/** Unique future send times (whole minutes), soonest first, capped at {@link MAX_TIMES}. */
export function sendTimes(plan: readonly Planned[], time: string, nowMs: number): number[] {
  const times = new Set<number>();
  for (const item of plan) {
    const at = instantOf(item.date, time);
    if (at > nowMs) times.add(at - (at % 60_000));
  }
  return [...times].sort((a, b) => a - b).slice(0, MAX_TIMES);
}
