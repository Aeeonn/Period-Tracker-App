import { describe, expect, it } from 'vitest';
import type { DeviceId } from '../../../../src/contracts/brand.ts';
import type { LocalDate } from '../../../../src/contracts/localdate.ts';
import { createLogRepo } from '../../../../src/data/repos/index.ts';
import { parse } from '../../../../src/lib/localdate/index.ts';
import { formatDaySummary } from '../../../../src/ui/screens/log/day-summary.ts';
import { MemoryRecordStore } from '../../../data/repos/memory-record-store.ts';

function localDate(value: string): LocalDate {
  const date = parse(value);
  if (date === null) throw new RangeError(`Synthetic test date did not parse: ${value}`);
  return date;
}

const DATE = localDate('2032-04-05');

describe('day summary formatting', () => {
  it('shows friendly labels and values for saved trackers only', async () => {
    const store = new MemoryRecordStore();
    const repo = createLogRepo(store, {
      deviceId: 'synthetic-day-summary-device' as DeviceId,
      nowMs: () => 1_800_000_000_000,
    });
    await repo.setTracker(DATE, 'flow', 'medium');
    await repo.setTracker(DATE, 'mood', ['calm', 'content']);
    await repo.setTracker(DATE, 'notes', 'A synthetic note.');

    expect(formatDaySummary(await repo.getDay(DATE))).toEqual([
      { tracker: 'flow', label: 'Flow', value: 'Medium' },
      { tracker: 'mood', label: 'Mood', value: 'Calm, Content' },
      { tracker: 'notes', label: 'Notes', value: 'A synthetic note.' },
    ]);
    expect(formatDaySummary(undefined)).toEqual([]);
  });
});
