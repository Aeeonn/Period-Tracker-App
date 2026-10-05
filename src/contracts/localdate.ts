import type { Brand } from './brand.ts';

/**
 * A calendar date in the user's local zone, formatted "YYYY-MM-DD"
 * (algorithms-spec.md §0 and A0). It is never a timestamp: no `Date` object is
 * ever created from it, and it is never converted between time zones.
 */
export type LocalDate = Brand<string, 'LocalDate'>;

/** A local wall-clock time "HH:MM" (24 h), e.g. a reminder or BBT time. */
export type LocalTime = Brand<string, 'LocalTime'>;

/**
 * A local date and time "YYYY-MM-DDTHH:MM", used only for non-health
 * bookkeeping such as consent history and backup times (architecture.md §5.1).
 */
export type LocalDateTime = Brand<string, 'LocalDateTime'>;

/** Integer day count since 1970-01-01 (proleptic Gregorian, A0). */
export type EpochDay = Brand<number, 'EpochDay'>;

/** Inclusive range of calendar dates, `start <= end`. */
export interface LocalDateRange {
  readonly start: LocalDate;
  readonly end: LocalDate;
}

/**
 * Contract for the A0 date engine (`lib/localdate`, task p0-localdate).
 * All health date arithmetic goes through these functions (invariant E7).
 */
export interface LocalDateApi {
  /** Parses "YYYY-MM-DD"; returns `null` for any invalid calendar date. */
  parse(text: string): LocalDate | null;
  /** Canonical "YYYY-MM-DD" text of a date. */
  format(date: LocalDate): string;
  epochDay(date: LocalDate): EpochDay;
  fromEpochDay(day: EpochDay): LocalDate;
  addDays(date: LocalDate, days: number): LocalDate;
  /** `epochDay(b) - epochDay(a)`. */
  diffDays(a: LocalDate, b: LocalDate): number;
  compare(a: LocalDate, b: LocalDate): -1 | 0 | 1;
  /**
   * Device-local "today" via `Intl` in the given or resolved IANA zone, with
   * an injectable clock for tests. Read by the UI only, never inside the engine.
   */
  todayLocal(options?: { readonly nowMs?: number; readonly timeZone?: string }): LocalDate;
}
