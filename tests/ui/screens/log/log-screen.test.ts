import { describe, expect, it } from 'vitest';
import type { DeviceId } from '../../../../src/contracts/brand.ts';
import type { PeriImpact, SexEvent } from '../../../../src/contracts/entities.ts';
import type { LocalTime } from '../../../../src/contracts/localdate.ts';
import { createLogRepo } from '../../../../src/data/repos/index.ts';
import { parse } from '../../../../src/lib/localdate/index.ts';
import { persistLogEntries } from '../../../../src/ui/screens/log/log-screen.tsx';
import type { LogEntry, LogRepo } from '../../../../src/ui/screens/log/types.ts';
import { MemoryRecordStore } from '../../../data/repos/memory-record-store.ts';

const DEVICE_ID = 'synthetic-log-screen-device' as DeviceId;
const DATE = parse('2032-04-05');
if (!DATE) throw new Error('Synthetic test date did not parse.');

function createFixture(): { readonly repo: LogRepo; readonly store: MemoryRecordStore } {
  const store = new MemoryRecordStore();
  const repo = createLogRepo(store, {
    deviceId: DEVICE_ID,
    nowMs: () => 1_800_000_000_000,
  });
  return { repo, store };
}

const syntheticSexEvent: SexEvent = {
  activity: ['vaginal', 'manual'],
  protection: ['external_condom'],
  comfort: 'okay',
  satisfaction: 'high',
  bleeding_after: 'no',
};

const syntheticImpact: PeriImpact = {
  hot_flushes: 1,
  night_sweats: 2,
  sleep: 3,
  mood: 0,
  anxiety: 1,
  joint_aches: 2,
  concentration: 1,
  vaginal_dryness: 0,
  libido_change: 2,
  fatigue: 3,
};

const allTrackerEntries: readonly LogEntry[] = [
  { tracker: 'flow', value: 'heavy' },
  { tracker: 'heavy_detail', value: ['flooding', 'clots_over_2_5cm'] },
  { tracker: 'period_pain', value: 'moderate' },
  { tracker: 'discharge', value: 'clear_stretchy' },
  { tracker: 'symptoms_body', value: ['cramps', 'fatigue'] },
  { tracker: 'mood', value: ['calm', 'content'] },
  { tracker: 'energy', value: 2 },
  { tracker: 'stress', value: 1 },
  { tracker: 'desire', value: 'high' },
  { tracker: 'sex', value: [syntheticSexEvent] },
  {
    tracker: 'tests',
    value: { pregnancy: 'negative', lh: 'peak', sti: { taken: true, result: 'pending' } },
  },
  {
    tracker: 'bbt',
    value: { valueC: 36.55, measuredAt: '06:30' as LocalTime, disturbances: ['short_sleep'] },
  },
  { tracker: 'ovulation_manual', value: 'yes' },
  { tracker: 'pill_intake', value: 'late' },
  { tracker: 'medication', value: [{ name: 'Synthetic supplement', taken: true }] },
  { tracker: 'weight', value: 61.2 },
  { tracker: 'water', value: 1400 },
  { tracker: 'sleep', value: { hours: 7.5, quality: 2 } },
  { tracker: 'activity', value: { minutes: 35, type: 'walk' } },
  { tracker: 'alcohol', value: 0 },
  { tracker: 'notes', value: '<script>alert(1)</script><img src=x onerror=alert(1)>' },
  { tracker: 'peri_impact', value: syntheticImpact },
  { tracker: 'lochia', value: 'moderate' },
];

describe('Log screen repository integration', () => {
  it('records each P1 tracker through the real LogRepo using a synthetic LocalDate', async () => {
    const { repo } = createFixture();
    await persistLogEntries(repo, DATE, allTrackerEntries);

    const saved = await repo.getDay(DATE);
    expect(saved).toMatchObject(
      Object.fromEntries(allTrackerEntries.map(({ tracker, value }) => [tracker, value])),
    );
    expect(saved?.localDate).toBe(DATE);
    expect(saved?.fieldHlc.sex).toBeDefined();
    expect(saved?.fieldHlc.desire).toBeDefined();
  });

  it('stores sex and desire without creating consent, sharing, or projection records', async () => {
    const { repo, store } = createFixture();
    await persistLogEntries(repo, DATE, [
      { tracker: 'desire', value: 'medium' },
      { tracker: 'sex', value: [syntheticSexEvent] },
    ]);

    expect((await repo.getDay(DATE))?.desire).toBe('medium');
    expect((await repo.getDay(DATE))?.sex).toEqual([syntheticSexEvent]);
    expect(await store.list('ConsentEvent')).toEqual([]);
    expect(await store.list('ShareSetting')).toEqual([]);
    expect(await store.list('Projection')).toEqual([]);
  });

  it('keeps script and event-handler payloads as ordinary note text', async () => {
    const { repo } = createFixture();
    const payload = '<script>alert(1)</script><img src=x onerror=alert(1)>';
    await persistLogEntries(repo, DATE, [{ tracker: 'notes', value: payload }]);

    expect((await repo.getDay(DATE))?.notes).toBe(payload);
  });
});
