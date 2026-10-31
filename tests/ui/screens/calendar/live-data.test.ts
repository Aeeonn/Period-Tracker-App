import { describe, expect, it } from 'vitest';
import type { DeviceId } from '../../../../src/contracts/brand.ts';
import type { LocalDate, LocalTime } from '../../../../src/contracts/localdate.ts';
import { createLogRepo, createSettingsRepo } from '../../../../src/data/repos/index.ts';
import { parse } from '../../../../src/lib/localdate/index.ts';
import { createCalendarScreenProps } from '../../../../src/ui/screens/calendar/live-data.ts';
import { MemoryRecordStore } from '../../../data/repos/memory-record-store.ts';

function localDate(value: string): LocalDate {
  const date = parse(value);
  if (date === null) throw new RangeError(`Synthetic test date did not parse: ${value}`);
  return date;
}

const TODAY = localDate('2032-04-05');

describe('live calendar data', () => {
  it('loads real log dates and day summaries across the LocalDate range', async () => {
    const store = new MemoryRecordStore();
    const options = {
      deviceId: 'synthetic-calendar-live-device' as DeviceId,
      nowMs: () => 1_800_000_000_000,
    };
    const repositories = {
      logRepo: createLogRepo(store, options),
      settingsRepo: createSettingsRepo(store, options),
    };
    await repositories.settingsRepo.putProfile({
      goal: 'track',
      lifeStage: 'cycle',
      units: { temp: 'celsius', weight: 'kg' },
      weekStart: 7,
      theme: 'system',
      lockTimeoutSec: 300,
      quickHideEnabled: false,
    });
    const before = localDate('2032-04-04');
    const after = localDate('2032-04-06');
    await repositories.logRepo.setTracker(before, 'flow', 'medium');
    await repositories.logRepo.setTracker(after, 'mood', ['calm']);

    const props = await createCalendarScreenProps(repositories, {
      today: TODAY,
      now: '12:00' as LocalTime,
    });

    expect(props.logDates).toEqual([before, after]);
    expect(props.dayLogs?.map((day) => day.localDate)).toEqual([before, after]);
    expect(props.engineOutput).toBeDefined();
    expect(props.today).toBe(TODAY);
    expect(props.weekStart).toBe(7);
  });
});
