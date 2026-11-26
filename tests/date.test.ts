import { describe, expect, it } from 'vitest';
import {
  addDays,
  compare,
  date,
  diffDays,
  epochDay,
  fromEpochDay,
  parse,
  shortLabel,
  todayLocal,
  weekday,
  type EpochDay,
} from '../src/lib/date.ts';

describe('date', () => {
  it('parses only real YYYY-MM-DD dates', () => {
    expect(parse('2024-02-29')).toBe('2024-02-29');
    expect(parse('2023-02-29')).toBeNull();
    expect(parse('1900-02-29')).toBeNull();
    expect(parse('2000-02-29')).toBe('2000-02-29');
    expect(parse('2024-2-1')).toBeNull();
    expect(parse('2024-13-01')).toBeNull();
  });

  it('converts to and from epoch days', () => {
    expect(epochDay(date('1970-01-01'))).toBe(0);
    expect(epochDay(date('2000-03-01'))).toBe(11017);
    expect(fromEpochDay(-1 as EpochDay)).toBe('1969-12-31');
    for (let day = -800; day < 800; day += 37) {
      expect(epochDay(fromEpochDay(day as EpochDay))).toBe(day);
    }
  });

  it('adds and compares days across month, year and leap boundaries', () => {
    expect(addDays(date('2024-02-28'), 1)).toBe('2024-02-29');
    expect(addDays(date('2024-12-31'), 1)).toBe('2025-01-01');
    expect(addDays(date('2025-03-01'), -1)).toBe('2025-02-28');
    expect(diffDays(date('2024-01-01'), date('2025-01-01'))).toBe(366);
    expect(compare(date('2025-01-02'), date('2025-01-10'))).toBe(-1);
    expect(compare(date('2025-01-10'), date('2025-01-10'))).toBe(0);
  });

  it('knows weekdays and short labels', () => {
    expect(weekday(date('1970-01-01'))).toBe(4);
    expect(weekday(date('2026-11-15'))).toBe(0);
    expect(shortLabel(date('2026-11-05'))).toBe('Nov 5');
  });

  it("reads today's date in the given time zone", () => {
    const nowMs = Date.UTC(2026, 0, 1, 3, 0);
    expect(todayLocal({ nowMs, timeZone: 'UTC' })).toBe('2026-01-01');
    expect(todayLocal({ nowMs, timeZone: 'America/Toronto' })).toBe('2025-12-31');
    expect(todayLocal({ nowMs, timeZone: 'Pacific/Auckland' })).toBe('2026-01-01');
  });
});
