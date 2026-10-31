import { describe, expect, it } from 'vitest';
import type { LocalDate } from '../../src/contracts/localdate.ts';
import { addDays, parse } from '../../src/lib/localdate/index.ts';
import { CALENDAR_PREVIEW_FIXTURE } from '../../src/ui/screens/calendar/preview-fixtures.ts';
import {
  calendarWeekdays,
  cycleForDate,
  markersForDate,
  monthCells,
  shiftMonth,
} from '../../src/ui/screens/calendar/calendar-model.ts';

function localDate(value: string): LocalDate {
  const date = parse(value);
  if (date === null) throw new RangeError(`Invalid synthetic LocalDate: ${value}`);
  return date;
}

describe('calendar LocalDate model', () => {
  it('builds a leap-month grid with adjacent dates without using timestamps', () => {
    const cells = monthCells(localDate('2024-02-01'));
    const daysInMonth = cells.filter((cell) => cell.inCurrentMonth);

    expect(cells).toHaveLength(35);
    expect(daysInMonth).toHaveLength(29);
    expect(cells[0]?.date).toBe(localDate('2024-01-28'));
    expect(cells.at(-1)?.date).toBe(localDate('2024-03-02'));
    expect(daysInMonth[28]?.date).toBe(localDate('2024-02-29'));
  });

  it('starts the calendar grid and weekday labels on the saved ISO week start', () => {
    const february = localDate('2024-02-01');
    const mondayFirst = monthCells(february, 1);
    const sundayFirst = monthCells(february, 7);

    expect(calendarWeekdays(1)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(calendarWeekdays(7)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(mondayFirst[0]?.date).toBe(localDate('2024-01-29'));
    expect(sundayFirst[0]?.date).toBe(localDate('2024-01-28'));
  });

  it('shifts months across year boundaries and stops outside LocalDate limits', () => {
    expect(shiftMonth(localDate('2026-12-01'), 1)).toBe(localDate('2027-01-01'));
    expect(shiftMonth(localDate('2027-01-01'), -1)).toBe(localDate('2026-12-01'));
    expect(shiftMonth(localDate('0000-01-01'), -1)).toBeNull();
    expect(shiftMonth(localDate('9999-12-01'), 1)).toBeNull();
    expect(monthCells(localDate('0000-01-01')).some((cell) => cell.date === null)).toBe(true);
    expect(monthCells(localDate('9999-12-01')).some((cell) => cell.date === null)).toBe(true);
  });

  it('keeps logged, assumed, spotting, and extra-log markers distinct', () => {
    const { engineOutput, today, logDates } = CALENDAR_PREVIEW_FIXTURE;

    expect(markersForDate(engineOutput, localDate('2026-10-11'))).toContain('logged-period');
    expect(markersForDate(engineOutput, localDate('2026-10-13'))).toContain('assumed');
    expect(markersForDate(engineOutput, localDate('2026-10-13'))).not.toContain('logged-period');
    expect(markersForDate(engineOutput, localDate('2026-10-14'))).toContain('spotting');
    expect(markersForDate(engineOutput, localDate('2026-10-14'))).not.toContain('logged-period');
    expect(markersForDate(engineOutput, today, logDates)).toContain('log');
  });

  it('marks inclusive prediction and fertility ranges from EngineOutput', () => {
    const { engineOutput } = CALENDAR_PREVIEW_FIXTURE;
    expect(engineOutput.prediction.kind).toBe('prediction');
    expect(engineOutput.fertility.kind).toBe('fertility');
    if (
      engineOutput.prediction.kind !== 'prediction' ||
      engineOutput.fertility.kind !== 'fertility'
    ) {
      throw new Error('Synthetic preview fixture should include prediction and fertility ranges');
    }

    expect(markersForDate(engineOutput, engineOutput.prediction.lo)).toContain('predicted');
    expect(markersForDate(engineOutput, addDays(engineOutput.prediction.lo, -1))).not.toContain(
      'predicted',
    );
    expect(markersForDate(engineOutput, engineOutput.fertility.coreWindow.start)).toContain(
      'core-fertile',
    );
    expect(markersForDate(engineOutput, engineOutput.fertility.higherDays.start)).toContain(
      'higher-fertile',
    );
  });

  it('finds a cycle on its start day and treats its next start as exclusive', () => {
    const output = CALENDAR_PREVIEW_FIXTURE.engineOutput;
    const cycle = output.cycles[0];
    expect(cycle).toBeDefined();
    if (!cycle) return;

    expect(cycleForDate(output, cycle.start)).toBe(cycle);
    expect(cycleForDate(output, addDays(cycle.nextStart, -1))).toBe(cycle);
    expect(cycleForDate(output, cycle.nextStart)).not.toBe(cycle);
  });
});
