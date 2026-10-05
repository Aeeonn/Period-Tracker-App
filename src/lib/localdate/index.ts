import type { EpochDay, LocalDate, LocalDateApi } from '../../contracts/localdate.ts';

const MIN_YEAR = 0;
const MAX_YEAR = 9999;
const DAYS_PER_400_YEARS = 146097;
const UNIX_EPOCH_OFFSET = 719468;
const MAX_DATE_TIME = 8.64e15;

interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

function parseParts(text: string): CivilDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function requireParts(date: LocalDate): CivilDate {
  const parts = parseParts(date);
  if (parts === null) throw new RangeError(`Invalid LocalDate: ${String(date)}`);
  return parts;
}

/** Proleptic Gregorian days-from-civil; the only non-date constant is the epoch origin. */
function daysFromCivil({ year, month, day }: CivilDate): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const shiftedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * DAYS_PER_400_YEARS + dayOfEra - UNIX_EPOCH_OFFSET;
}

/** Inverse of daysFromCivil, for integer epoch days only. */
function civilFromDays(epochDay: number): CivilDate {
  const shiftedDay = epochDay + UNIX_EPOCH_OFFSET;
  const era = Math.floor(shiftedDay / DAYS_PER_400_YEARS);
  const dayOfEra = shiftedDay - era * DAYS_PER_400_YEARS;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  let year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return { year, month, day };
}

function formatParts({ year, month, day }: CivilDate): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as LocalDate;
}

function epochDayNumber(date: LocalDate): number {
  return daysFromCivil(requireParts(date));
}

/** Parse the exact four-digit `YYYY-MM-DD` form, returning null for invalid dates. */
export function parse(text: string): LocalDate | null {
  if (typeof text !== 'string' || parseParts(text) === null) return null;
  return text as LocalDate;
}

/** Return canonical `YYYY-MM-DD` text after checking the branded value at runtime. */
export function format(date: LocalDate): string {
  requireParts(date);
  return date;
}

/** Convert a validated LocalDate to an integer count of Gregorian days from 1970-01-01. */
export function epochDay(date: LocalDate): EpochDay {
  return epochDayNumber(date) as EpochDay;
}

/** Convert an integer epoch day to a four-digit-year LocalDate. */
export function fromEpochDay(day: EpochDay): LocalDate {
  if (!Number.isSafeInteger(day)) throw new RangeError(`Invalid epoch day: ${String(day)}`);
  const result = civilFromDays(day);
  if (result.year < MIN_YEAR || result.year > MAX_YEAR) {
    throw new RangeError(`Epoch day is outside the LocalDate range: ${String(day)}`);
  }
  return formatParts(result);
}

/** Add an integral number of calendar days without timestamp or time-zone arithmetic. */
export function addDays(date: LocalDate, days: number): LocalDate {
  if (!Number.isSafeInteger(days))
    throw new RangeError(`Days must be a safe integer: ${String(days)}`);
  return fromEpochDay((epochDayNumber(date) + days) as EpochDay);
}

/** Return `epochDay(b) - epochDay(a)`. */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return epochDayNumber(b) - epochDayNumber(a);
}

/** Chronological comparison independent of the host time zone. */
export function compare(a: LocalDate, b: LocalDate): -1 | 0 | 1 {
  const difference = diffDays(a, b);
  return difference > 0 ? -1 : difference < 0 ? 1 : 0;
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const part = parts.find((candidate) => candidate.type === type);
  if (part === undefined) throw new RangeError(`Intl did not provide a ${type} date field`);
  return part.value;
}

/**
 * Extract the calendar date at an explicit or device-resolved IANA time zone.
 * Date construction here is the intentional timestamp-to-local-date boundary;
 * LocalDate arithmetic above never uses Date, UTC offsets, or milliseconds.
 */
export function todayLocal(
  options: {
    readonly nowMs?: number;
    readonly timeZone?: string;
  } = {},
): LocalDate {
  const nowMs = options.nowMs ?? Date.now();
  if (!Number.isFinite(nowMs) || Math.abs(nowMs) > MAX_DATE_TIME) {
    throw new RangeError(`Invalid clock timestamp: ${String(nowMs)}`);
  }

  const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    era: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date(nowMs));
  const yearOfEra = Number(partValue(parts, 'year'));
  const era = partValue(parts, 'era');
  const year = era === 'BC' ? 1 - yearOfEra : yearOfEra;
  const month = Number(partValue(parts, 'month'));
  const day = Number(partValue(parts, 'day'));

  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new RangeError(`Local date is outside the supported year range: ${String(year)}`);
  }
  const result = formatParts({ year, month, day });
  if (parseParts(result) === null)
    throw new RangeError(`Intl produced an invalid LocalDate: ${result}`);
  return result;
}

/** Contract-shaped namespace for consumers that prefer a single API object. */
export const localDateApi: LocalDateApi = {
  parse,
  format,
  epochDay,
  fromEpochDay,
  addDays,
  diffDays,
  compare,
  todayLocal,
};

export type { EpochDay, LocalDate } from '../../contracts/localdate.ts';
