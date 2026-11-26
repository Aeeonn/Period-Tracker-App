import { describe, expect, it } from 'vitest';
import type { DayLog } from '../src/data/types.ts';
import { runEngine } from '../src/engine/index.ts';
import { phaseOf, phasePatterns } from '../src/engine/patterns.ts';
import { addDays, date } from '../src/lib/date.ts';

function period(start: string): DayLog[] {
  return Array.from({ length: 5 }, (_, index) => ({
    date: addDays(date(start), index),
    flow: 'medium' as const,
  }));
}

const days: DayLog[] = [...period('2026-01-01'), ...period('2026-01-29'), ...period('2026-02-26')];
const today = date('2026-03-10');
const output = runEngine({ today, days, contraception: 'none' });

describe('phases', () => {
  it('splits a cycle into period, after, mid-cycle and before', () => {
    expect(phaseOf(output, date('2026-01-03'))).toBe('period');
    expect(phaseOf(output, date('2026-01-10'))).toBe('after');
    expect(phaseOf(output, date('2026-01-18'))).toBe('middle');
    expect(phaseOf(output, date('2026-01-25'))).toBe('before');
    expect(phaseOf(output, date('2025-12-25'))).toBeUndefined();
    // Uses the prediction for the current cycle.
    expect(phaseOf(output, date('2026-03-24'))).toBe('before');
  });
});

describe('phasePatterns', () => {
  it('needs five logged days before showing a figure', () => {
    const logs: DayLog[] = [
      ...days,
      ...[16, 17, 18, 19].map((day) => ({ date: date(`2026-01-${day}`), desire: 'high' as const })),
    ];
    const middle = phasePatterns(output, logs).find((pattern) => pattern.phase === 'middle')!;
    expect(middle.desire).toEqual({ basedOn: 4 });
  });

  it('summarises desire, sex and sleep per phase', () => {
    const logs: DayLog[] = [
      ...days,
      ...[13, 14, 15, 16, 17, 18].map((day, index) => ({
        date: date(`2026-02-${day}`),
        desire: index < 3 ? ('high' as const) : ('low' as const),
        sleepHours: 7 + (index % 2),
        mood: ['playful' as const],
        ...(index === 0 ? { sex: { satisfaction: 'high' as const } } : {}),
      })),
    ];
    const middle = phasePatterns(output, logs).find((pattern) => pattern.phase === 'middle')!;
    expect(middle.desire).toEqual({ percent: 50, basedOn: 6 });
    expect(middle.sex).toEqual({ percent: 17, basedOn: 6 });
    expect(middle.averageSleep).toBe(7.5);
    expect(middle.topMoods).toEqual(['playful']);
  });
});
