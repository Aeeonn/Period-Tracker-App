import { describe, expect, it } from 'vitest';
import type { DayLog, Flow } from '../src/data/types.ts';
import { cycleDay, isPeriodDay, runEngine } from '../src/engine/index.ts';
import { addDays, date, type LocalDate } from '../src/lib/date.ts';

function period(start: string, length = 5, flow: Flow = 'medium'): DayLog[] {
  return Array.from({ length }, (_, index) => ({ date: addDays(date(start), index), flow }));
}

/** Periods every `cycle` days starting at `first`. */
function cycles(first: string, lengths: readonly number[]): DayLog[] {
  const days: DayLog[] = [];
  let start = date(first);
  for (const length of lengths) {
    days.push(...period(start));
    start = addDays(start, length);
  }
  days.push(...period(start));
  return days;
}

describe('runEngine', () => {
  it('predicts nothing without data', () => {
    const output = runEngine({ today: date('2026-03-01'), days: [], contraception: 'none' });
    expect(output.prediction).toEqual({ kind: 'none', reason: 'no_data' });
    expect(output.fertility.kind).toBe('none');
    expect(cycleDay(output, date('2026-03-01'))).toBeUndefined();
  });

  it('uses the typical cycle length with a wide window when there is no history', () => {
    const output = runEngine({
      today: date('2026-01-03'),
      days: period('2026-01-01'),
      contraception: 'none',
      cycleLength: 30,
    });
    expect(output.prediction).toMatchObject({
      kind: 'prediction',
      center: '2026-01-31',
      lo: '2026-01-26',
      hi: '2026-02-05',
      cyclesUsed: 0,
    });
    expect(cycleDay(output, date('2026-01-03'))).toBe(3);
  });

  it('narrows the window with regular cycles', () => {
    const days = cycles('2025-06-01', [28, 28, 28, 28, 28, 28]);
    const output = runEngine({ today: date('2025-11-20'), days, contraception: 'none' });
    expect(output.prediction).toMatchObject({
      kind: 'prediction',
      center: '2025-12-14',
      lo: '2025-12-12',
      hi: '2025-12-16',
      cyclesUsed: 6,
      cycleLength: 28,
      variability: 'regular',
    });
    expect(output.basis).toBe('Based on your last 6 cycles.');
  });

  it('flags a late period', () => {
    const days = cycles('2025-06-01', [28, 28, 28, 28, 28, 28]);
    const output = runEngine({ today: date('2025-12-20'), days, contraception: 'none' });
    expect(output.prediction).toMatchObject({ state: 'late', daysLate: 6 });
    expect(output.fertility).toEqual({ kind: 'none', reason: 'late' });
  });

  it('excludes a cycle that probably hides an unlogged period', () => {
    const days = cycles('2025-03-01', [28, 28, 28, 56, 28]);
    const output = runEngine({ today: date('2025-08-20'), days, contraception: 'none' });
    expect(output.cycles.map((cycle) => cycle.excluded)).toEqual([
      undefined,
      undefined,
      undefined,
      'possible_missed_log',
      undefined,
    ]);
    expect(output.prediction).toMatchObject({ cycleLength: 28, cyclesUsed: 4 });
  });

  it('keeps short gaps in one period and attaches spotting without starting a period', () => {
    const days: DayLog[] = [
      { date: date('2026-01-01'), flow: 'spotting' },
      { date: date('2026-01-02'), flow: 'heavy' },
      { date: date('2026-01-03'), flow: 'medium' },
      { date: date('2026-01-06'), flow: 'light' },
      { date: date('2026-01-20'), flow: 'spotting' },
    ];
    const output = runEngine({ today: date('2026-01-25'), days, contraception: 'none' });
    expect(output.episodes).toHaveLength(1);
    expect(output.episodes[0]).toMatchObject({
      start: '2026-01-02',
      end: '2026-01-06',
      bleedingDays: 3,
      spottingDays: ['2026-01-01'],
    });
    expect(isPeriodDay(output, date('2026-01-04'))).toBe(true);
  });

  it('assumes an ongoing period after a single logged start until a "none" log', () => {
    const days: DayLog[] = [
      { date: date('2026-01-01'), flow: 'medium' },
      { date: date('2026-01-04'), flow: 'none' },
    ];
    const output = runEngine({
      today: date('2026-01-10'),
      days,
      contraception: 'none',
      periodLength: 5,
    });
    expect(output.episodes[0]!.assumedDays).toEqual(['2026-01-02', '2026-01-03']);
  });

  it('ignores logs after today', () => {
    const output = runEngine({
      today: date('2026-01-01'),
      days: period('2026-02-01'),
      contraception: 'none',
    });
    expect(output.prediction.kind).toBe('none');
  });

  describe('hormonal IUD', () => {
    it('does not predict until three periods are logged', () => {
      const output = runEngine({
        today: date('2026-02-10'),
        days: [...period('2026-01-01'), ...period('2026-02-01')],
        contraception: 'hormonal_iud',
      });
      expect(output.prediction).toEqual({ kind: 'none', reason: 'hormonal_few_periods' });
      expect(output.basis).toContain('three logged periods');
    });

    it('never shows a fertile window and keeps the window at least 4 days wide', () => {
      const days = cycles('2025-06-01', [28, 28, 28, 28, 28, 28]);
      const output = runEngine({ today: date('2025-11-20'), days, contraception: 'hormonal_iud' });
      expect(output.fertility).toEqual({ kind: 'none', reason: 'hormonal' });
      expect(output.prediction).toMatchObject({ lo: '2025-12-10', hi: '2025-12-18' });
    });

    it('stops predicting when no period was logged for over 90 days', () => {
      const days = cycles('2025-01-01', [28, 28, 28]);
      const output = runEngine({ today: date('2025-08-01'), days, contraception: 'hormonal_iud' });
      expect(output.prediction).toEqual({ kind: 'none', reason: 'no_recent_period' });
    });
  });

  it('estimates the fertile window 14 days before the predicted period', () => {
    const days = cycles('2025-06-01', [28, 28, 28, 28, 28, 28]);
    const output = runEngine({ today: date('2025-11-20'), days, contraception: 'copper_iud' });
    expect(output.fertility).toMatchObject({
      kind: 'estimate',
      ovulation: '2025-11-30',
      window: { start: '2025-11-25', end: '2025-12-01' },
      higher: { start: '2025-11-28', end: '2025-11-30' },
      copperIud: true,
    });
  });

  it('warns about soaking with chest pain, breathlessness or dizziness today or yesterday', () => {
    const today = date('2026-01-10');
    const emergency = (day: LocalDate): DayLog => ({
      date: day,
      flow: 'very_heavy',
      soaking: true,
      symptoms: ['dizziness'],
    });
    expect(
      runEngine({ today, days: [emergency(addDays(today, -1))], contraception: 'none' }).warnings,
    ).toEqual([{ id: 'heavy_bleeding_emergency', dates: ['2026-01-09'] }]);
    expect(
      runEngine({ today, days: [emergency(addDays(today, -2))], contraception: 'none' }).warnings,
    ).toEqual([]);
    expect(
      runEngine({
        today,
        days: [{ date: today, flow: 'very_heavy', soaking: true, symptoms: ['cramps'] }],
        contraception: 'none',
      }).warnings,
    ).toEqual([]);
  });

  it('is deterministic', () => {
    const input = {
      today: date('2025-11-20'),
      days: cycles('2025-06-01', [27, 31, 29, 26, 30]),
      contraception: 'none' as const,
    };
    expect(runEngine(input)).toEqual(runEngine(input));
  });
});
