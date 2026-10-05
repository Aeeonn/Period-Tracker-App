// synthetic: true — deterministic A0 calendar vectors and generated valid date property cases.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  addDays,
  compare,
  diffDays,
  epochDay,
  format,
  fromEpochDay,
  parse,
  todayLocal,
} from '../../src/lib/localdate/index.ts';
import type { EpochDay, LocalDate } from '../../src/contracts/localdate.ts';

const TIME_ZONES = [
  'Pacific/Auckland',
  'America/New_York',
  'Europe/Berlin',
  'UTC',
  'America/Los_Angeles',
] as const;
const PROPERTY_SEED = 20261002;
const PROPERTY_RUNS = 10_000;

interface GoldenBase {
  readonly id: string;
}

interface EpochVector extends GoldenBase {
  readonly operation: 'epochDay';
  readonly input: { readonly date: string };
  readonly expected: number;
}

interface DifferenceVector extends GoldenBase {
  readonly operation: 'diffDays';
  readonly timeZone: string;
  readonly input: { readonly a: string; readonly b: string };
  readonly expected: number;
}

interface TodayVector extends GoldenBase {
  readonly operation: 'todayLocal';
  readonly timeZone: string;
  readonly input: { readonly nowMs: number };
  readonly expected: string;
}

type GoldenVector = EpochVector | DifferenceVector | TodayVector;

interface GoldenFixture {
  readonly synthetic: true;
  readonly provenance: string;
  readonly source: string;
  readonly vectors: readonly GoldenVector[];
}

const fixture = JSON.parse(
  readFileSync(new URL('./a0-dates.json', import.meta.url), 'utf8'),
) as GoldenFixture;

function requireDate(text: string): LocalDate {
  const date = parse(text);
  if (date === null) throw new Error(`Expected valid synthetic LocalDate: ${text}`);
  return date;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

const validDateText = fc
  .integer({ min: 0, max: 9999 })
  .chain((year) =>
    fc
      .integer({ min: 1, max: 12 })
      .chain((month) =>
        fc
          .integer({ min: 1, max: daysInMonth(year, month) })
          .map(
            (day) =>
              `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          ),
      ),
  );

const hostExpectedForVectorClock: Readonly<Record<(typeof TIME_ZONES)[number], string>> = {
  'Pacific/Auckland': '2026-10-02',
  'America/New_York': '2026-10-01',
  'Europe/Berlin': '2026-10-01',
  UTC: '2026-10-01',
  'America/Los_Angeles': '2026-10-01',
};

describe('A0 LocalDate golden vectors TV-D1–TV-D6', () => {
  it('loads exactly the synthetic A0 reference vectors with provenance', () => {
    expect(fixture.synthetic).toBe(true);
    expect(fixture.source).toBe('docs/plan/algorithms-spec.md §A0');
    expect(fixture.provenance).toContain('before implementation');
    expect(fixture.vectors.map(({ id }) => id)).toEqual([
      'TV-D1',
      'TV-D2',
      'TV-D3',
      'TV-D4',
      'TV-D5',
      'TV-D6',
    ]);
  });

  it.each(fixture.vectors)('$id: $operation', (vector) => {
    switch (vector.operation) {
      case 'epochDay':
        expect(epochDay(requireDate(vector.input.date))).toBe(vector.expected);
        break;
      case 'diffDays':
        expect(diffDays(requireDate(vector.input.a), requireDate(vector.input.b))).toBe(
          vector.expected,
        );
        break;
      case 'todayLocal':
        expect(todayLocal({ nowMs: vector.input.nowMs, timeZone: vector.timeZone })).toBe(
          vector.expected,
        );
        break;
    }
  });
});

describe('A0 calendar parsing and arithmetic', () => {
  it.each([
    '2026-2-01',
    '2026-02-1',
    ' 2026-02-01',
    '2026-02-01 ',
    '2026-00-01',
    '2026-13-01',
    '2026-04-31',
    '2025-02-29',
    '1900-02-29',
    '10000-01-01',
    '-001-01-01',
  ])('rejects invalid calendar text %s', (text) => {
    expect(parse(text)).toBeNull();
  });

  it('accepts Gregorian leap days, including year zero, within the four-digit range', () => {
    expect(parse('0000-02-29')).toBe('0000-02-29');
    expect(parse('2000-02-29')).toBe('2000-02-29');
    expect(parse('2024-02-29')).toBe('2024-02-29');
    expect(parse('2100-02-29')).toBeNull();
    expect(parse('9999-12-31')).toBe('9999-12-31');
  });

  it('formats canonical dates and rejects a forged invalid brand', () => {
    expect(format(requireDate('0000-02-29'))).toBe('0000-02-29');
    expect(() => format('2026-02-29' as LocalDate)).toThrow(RangeError);
  });

  it('adds calendar days across leap days and year boundaries', () => {
    expect(addDays(requireDate('2024-02-28'), 1)).toBe('2024-02-29');
    expect(addDays(requireDate('2024-02-28'), 2)).toBe('2024-03-01');
    expect(addDays(requireDate('2024-03-01'), -1)).toBe('2024-02-29');
    expect(addDays(requireDate('2025-12-31'), 1)).toBe('2026-01-01');
    expect(() => addDays(requireDate('0000-01-01'), -1)).toThrow(RangeError);
  });

  it('computes signed differences and chronological ordering', () => {
    const earlier = requireDate('2026-01-01');
    const later = requireDate('2026-10-02');
    expect(diffDays(earlier, later)).toBe(274);
    expect(diffDays(later, earlier)).toBe(-274);
    expect(compare(earlier, later)).toBe(-1);
    expect(compare(later, earlier)).toBe(1);
    expect(compare(earlier, earlier)).toBe(0);
  });

  it('round-trips 10,000 reproducible random valid dates through epochDay', () => {
    fc.assert(
      fc.property(validDateText, (text) => {
        const date = parse(text);
        if (date === null) throw new Error(`Generator produced an invalid date: ${text}`);
        const day = epochDay(date);
        const reconstructed = fromEpochDay(day);
        expect(reconstructed).toBe(date);
        expect(epochDay(reconstructed)).toBe(day);
      }),
      { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED, endOnFailure: true },
    );
  });

  it('rejects fractional offsets, invalid epoch days, and arithmetic beyond the supported range', () => {
    const firstEpochDay = epochDay(requireDate('0000-01-01'));
    const lastEpochDay = epochDay(requireDate('9999-12-31'));
    expect(() => addDays(requireDate('2026-01-01'), 0.5)).toThrow(RangeError);
    expect(() => fromEpochDay(1.5 as EpochDay)).toThrow(RangeError);
    expect(() => fromEpochDay((firstEpochDay - 1) as EpochDay)).toThrow(RangeError);
    expect(() => fromEpochDay((lastEpochDay + 1) as EpochDay)).toThrow(RangeError);
    expect(() => addDays(requireDate('9999-12-31'), 1)).toThrow(RangeError);
    expect(() => addDays(requireDate('0000-01-01'), -1)).toThrow(RangeError);
  });

  it('keeps DST-boundary differences and offsets equal to calendar days', () => {
    expect(diffDays(requireDate('2026-03-08'), requireDate('2026-03-09'))).toBe(1);
    expect(addDays(requireDate('2026-03-08'), 1)).toBe('2026-03-09');
    expect(diffDays(requireDate('2026-10-25'), requireDate('2026-10-26'))).toBe(1);
    expect(addDays(requireDate('2026-10-25'), 1)).toBe('2026-10-26');
  });
});

describe('A0 todayLocal time-zone boundary', () => {
  it('uses the active TZ matrix entry for the device-resolved zone', () => {
    const configuredTimeZone = process.env.TZ;
    const resolvedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (configuredTimeZone !== undefined) {
      expect(TIME_ZONES).toContain(configuredTimeZone);
      expect(resolvedTimeZone).toBe(configuredTimeZone);
      expect(todayLocal({ nowMs: 1790854200000 })).toBe(
        hostExpectedForVectorClock[configuredTimeZone as (typeof TIME_ZONES)[number]],
      );
    }
  });

  it('rejects invalid timestamps and time-zone identifiers', () => {
    expect(() => todayLocal({ nowMs: Number.NaN, timeZone: 'UTC' })).toThrow(RangeError);
    expect(() => todayLocal({ nowMs: 0, timeZone: 'Not/A_Real_Zone' })).toThrow(RangeError);
  });
});
