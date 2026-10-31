import type { CycleStat, EngineOutput } from '../../../contracts/engine-api.ts';
import type { IsoWeekday } from '../../../contracts/enums.ts';
import type { LocalDate, LocalDateRange } from '../../../contracts/localdate.ts';
import { addDays, compare, epochDay, parse } from '../../../lib/localdate/index.ts';

export const CALENDAR_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type CalendarMarker =
  | 'logged-period'
  | 'assumed'
  | 'predicted'
  | 'core-fertile'
  | 'higher-fertile'
  | 'log'
  | 'spotting';

export const CALENDAR_MARKER_LABELS: Readonly<Record<CalendarMarker, string>> = {
  'logged-period': 'logged period',
  assumed: 'assumed day',
  predicted: 'predicted period window',
  'core-fertile': 'core fertile day',
  'higher-fertile': 'Higher fertile day',
  log: 'log present',
  spotting: 'logged spotting',
};

export interface CalendarCell {
  readonly date: LocalDate | null;
  readonly inCurrentMonth: boolean;
}

function requireLocalDate(value: string): LocalDate {
  const date = parse(value);
  if (date === null) throw new RangeError(`Invalid calendar LocalDate: ${value}`);
  return date;
}

export function monthStart(date: LocalDate): LocalDate {
  return requireLocalDate(`${date.slice(0, 7)}-01`);
}

export function shiftMonth(date: LocalDate, amount: number): LocalDate | null {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const shifted = year * 12 + month - 1 + amount;
  const nextYear = Math.floor(shifted / 12);
  if (nextYear < 0 || nextYear > 9999) return null;
  const nextMonth = (((shifted % 12) + 12) % 12) + 1;
  return parse(`${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`);
}

function daysInMonth(date: LocalDate): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function weekdayIndex(date: LocalDate): number {
  return (((Number(epochDay(date)) + 4) % 7) + 7) % 7;
}

function firstWeekdayIndex(weekStart: IsoWeekday): number {
  return weekStart % 7;
}

export function calendarWeekdays(weekStart: IsoWeekday = 7): readonly string[] {
  const first = firstWeekdayIndex(weekStart);
  return [...CALENDAR_WEEKDAYS.slice(first), ...CALENDAR_WEEKDAYS.slice(0, first)];
}

export function monthLabel(date: LocalDate): string {
  const month = Number(date.slice(5, 7));
  return `${CALENDAR_MONTH_NAMES[month - 1]} ${date.slice(0, 4)}`;
}

export function fullDateLabel(date: LocalDate): string {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return `${CALENDAR_MONTH_NAMES[month - 1]} ${day}, ${date.slice(0, 4)}`;
}

export function monthCells(date: LocalDate, weekStart: IsoWeekday = 7): readonly CalendarCell[] {
  const first = monthStart(date);
  const days = daysInMonth(first);
  const offset = (weekdayIndex(first) - firstWeekdayIndex(weekStart) + 7) % 7;
  const count = Math.ceil((offset + days) / 7) * 7;

  return Array.from({ length: count }, (_, index) => {
    const day = index - offset + 1;
    if (day < 1) {
      const previousMonth = shiftMonth(first, -1);
      if (previousMonth === null) return { date: null, inCurrentMonth: false };
      return {
        date: addDays(previousMonth, daysInMonth(previousMonth) + day - 1),
        inCurrentMonth: false,
      };
    }
    if (day > days) {
      const nextMonth = shiftMonth(first, 1);
      if (nextMonth === null) return { date: null, inCurrentMonth: false };
      return { date: addDays(nextMonth, day - days - 1), inCurrentMonth: false };
    }
    return { date: addDays(first, day - 1), inCurrentMonth: true };
  });
}

function isInRange(date: LocalDate, range: LocalDateRange): boolean {
  return compare(date, range.start) >= 0 && compare(date, range.end) <= 0;
}

export function markersForDate(
  engineOutput: EngineOutput,
  date: LocalDate,
  logDates: readonly LocalDate[] = [],
): readonly CalendarMarker[] {
  const assumed = engineOutput.episodes.some((episode) => episode.assumedDays.includes(date));
  const spotting = engineOutput.episodes.some((episode) => episode.spottingDays.includes(date));
  const inEpisode = engineOutput.episodes.some(
    (episode) => compare(date, episode.start) >= 0 && compare(date, episode.end) <= 0,
  );
  const markers: CalendarMarker[] = [];

  if (inEpisode && !assumed && !spotting) markers.push('logged-period');
  if (assumed) markers.push('assumed');
  if (
    engineOutput.prediction.kind === 'prediction' &&
    isInRange(date, { start: engineOutput.prediction.lo, end: engineOutput.prediction.hi })
  ) {
    markers.push('predicted');
  }
  if (engineOutput.fertility.kind === 'fertility') {
    if (isInRange(date, engineOutput.fertility.coreWindow)) markers.push('core-fertile');
    if (isInRange(date, engineOutput.fertility.higherDays)) markers.push('higher-fertile');
  }
  if (logDates.includes(date)) markers.push('log');
  if (spotting) markers.push('spotting');
  return markers;
}

export function cycleForDate(engineOutput: EngineOutput, date: LocalDate): CycleStat | undefined {
  return engineOutput.cycles.find(
    (cycle) => compare(date, cycle.start) >= 0 && compare(date, cycle.nextStart) < 0,
  );
}
