import { describe, expect, it } from 'vitest';
import type { Base64Url, DeviceId, LogicalId, PregnancyId, ReminderId } from '../../../src/contracts/brand.ts';
import type {
  ContraceptionState,
  DeviceIdentity,
  Hlc,
  PeriodOverride,
  PregnancyRecord,
  Profile,
  ReminderRule,
  SexEvent,
} from '../../../src/contracts/entities.ts';
import type { LocalDate, LocalDateTime, LocalTime } from '../../../src/contracts/localdate.ts';
import { createLogRepo, createSettingsRepo, compareHlc, createHlcClock } from '../../../src/data/repos/index.ts';
import { parse } from '../../../src/lib/localdate/index.ts';
import { MemoryRecordStore } from './memory-record-store.ts';

const deviceId = 'synthetic-repo-device' as DeviceId;

function date(value: string): LocalDate {
  const parsed = parse(value);
  if (!parsed) throw new Error(`Invalid synthetic LocalDate: ${value}`);
  return parsed;
}

function overrideId(localDate: LocalDate, kind: PeriodOverride['kind']): LogicalId {
  return JSON.stringify([localDate, kind]) as LogicalId;
}

function stamp(wallMs = 1_800_000_000_000, counter = 0, author = deviceId): Hlc {
  return { wallMs, counter, deviceId: author };
}

function profile(): Profile {
  return {
    goal: 'track',
    lifeStage: 'cycle',
    units: { temp: 'celsius', weight: 'kg' },
    weekStart: 1,
    theme: 'system',
    lockTimeoutSec: 300,
    quickHideEnabled: false,
  };
}

describe('LogRepo', () => {
  it('clears a tracker as an ordered field tombstone and publishes committed changes', async () => {
    const store = new MemoryRecordStore();
    const repo = createLogRepo(store, { deviceId, nowMs: () => 1_800_000_000_000 });
    const day = date('2032-01-02');
    const changes: LocalDate[][] = [];
    const unsubscribe = repo.onChange((change) => changes.push([...change.localDates]));

    await repo.setTracker(day, 'flow', 'heavy');
    const setStamp = (await repo.getDay(day))?.fieldHlc.flow;
    expect((await repo.getDay(day))?.flow).toBe('heavy');

    await repo.clearTracker(day, 'flow');
    const cleared = await repo.getDay(day);
    expect(cleared?.flow).toBeUndefined();
    expect(cleared?.fieldHlc.flow).toBeDefined();
    expect(compareHlc(cleared!.fieldHlc.flow!, setStamp!)).toBe(1);
    const persisted = store.inspect('DayBundle', day as unknown as LogicalId);
    expect(persisted?.deleted).toBe(false);
    if (!persisted || persisted.deleted) throw new Error('Expected the day bundle to remain active');
    expect(persisted.body.flow).toBeUndefined();
    expect(persisted.body.fieldHlc.flow).toEqual(cleared?.fieldHlc.flow);
    expect(changes).toEqual([[day], [day]]);

    unsubscribe();
    await repo.setTracker(day, 'desire', 'low');
    expect(changes).toHaveLength(2);
  });

  it('stores the F-012/F-105 sex and desire inputs in a dated bundle without consent side effects', async () => {
    const store = new MemoryRecordStore();
    const repo = createLogRepo(store, { deviceId, nowMs: () => 1_800_000_000_000 });
    const day = date('2032-02-03');
    const event: SexEvent = {
      activity: ['vaginal'],
      protection: ['external_condom'],
      comfort: 'painful',
      satisfaction: 'low',
    };

    await repo.setTracker(day, 'desire', 'high');
    await repo.setTracker(day, 'sex', [event]);
    const bundle = await repo.getDay(day);

    expect(bundle?.desire).toBe('high');
    expect(bundle?.sex).toEqual([event]);
    expect(bundle?.fieldHlc.desire).toBeDefined();
    expect(bundle?.fieldHlc.sex).toBeDefined();
    expect(await store.list('ConsentEvent')).toEqual([]);
    expect(await store.list('ShareSetting')).toEqual([]);
  });

  it('lists days and overrides inclusively in LocalDate order and tombstones removed overrides', async () => {
    const store = new MemoryRecordStore();
    const repo = createLogRepo(store, { deviceId, nowMs: () => 1_800_000_000_000 });
    const first = date('2032-03-01');
    const middle = date('2032-03-02');
    const last = date('2032-03-03');
    await repo.setTracker(last, 'flow', 'light');
    await repo.setTracker(first, 'flow', 'medium');
    await repo.setTracker(middle, 'flow', 'heavy');

    expect(await repo.listDays({ start: middle, end: last })).toEqual([
      await repo.getDay(middle),
      await repo.getDay(last),
    ]);
    expect(await repo.listDays({ start: last, end: middle })).toEqual([]);

    const override = { localDate: middle, kind: 'start' as const };
    await repo.putOverride(override);
    expect(await repo.listOverrides()).toEqual([override]);
    const before = store.inspect('PeriodOverride', overrideId(middle, 'start'));
    await repo.removeOverride(override);
    const after = store.inspect('PeriodOverride', overrideId(middle, 'start'));
    expect(await repo.listOverrides()).toEqual([]);
    expect(after?.deleted).toBe(true);
    if (!before || before.deleted || !after || !after.deleted) {
      throw new Error('Expected an active override followed by its tombstone');
    }
    expect(compareHlc(after.hlc, before.hlc)).toBe(1);
  });

  it('allows different override kinds on one date and removes only the matching kind', async () => {
    const store = new MemoryRecordStore();
    const repo = createLogRepo(store, { deviceId, nowMs: () => 1_800_000_000_000 });
    const localDate = date('2032-03-10');
    const start = { localDate, kind: 'start' as const };
    const exclusion = { localDate, kind: 'exclude_cycle' as const };

    await repo.putOverride(start);
    await repo.putOverride(exclusion);
    expect(await repo.listOverrides()).toEqual([exclusion, start]);

    await repo.removeOverride({ localDate, kind: 'not_start' });
    expect(await repo.listOverrides()).toEqual([exclusion, start]);
    await repo.removeOverride(start);
    expect(await repo.listOverrides()).toEqual([exclusion]);

    const removedStart = store.inspect('PeriodOverride', overrideId(localDate, 'start'));
    const survivingExclusion = store.inspect('PeriodOverride', overrideId(localDate, 'exclude_cycle'));
    expect(removedStart?.deleted).toBe(true);
    expect(survivingExclusion?.deleted).toBe(false);
  });

  it('replaces only the contradictory start/not_start override', async () => {
    const store = new MemoryRecordStore();
    const repo = createLogRepo(store, { deviceId, nowMs: () => 1_800_000_000_000 });
    const localDate = date('2032-03-11');
    const notStart = { localDate, kind: 'not_start' as const };
    const exclusion = { localDate, kind: 'exclude_cycle' as const };
    const start = { localDate, kind: 'start' as const };

    await repo.putOverride(notStart);
    await repo.putOverride(exclusion);
    await repo.putOverride(start);
    expect(await repo.listOverrides()).toEqual([exclusion, start]);
    expect(store.inspect('PeriodOverride', overrideId(localDate, 'not_start'))?.deleted).toBe(true);

    await repo.putOverride(notStart);
    expect(await repo.listOverrides()).toEqual([exclusion, notStart]);
    expect(store.inspect('PeriodOverride', overrideId(localDate, 'start'))?.deleted).toBe(true);
    expect(store.inspect('PeriodOverride', overrideId(localDate, 'exclude_cycle'))?.deleted).toBe(false);
  });
  it('merges observed HLC wall time and counter when the local clock lags', () => {
    const remoteDevice = 'synthetic-remote-device' as DeviceId;
    const clock = createHlcClock(deviceId, () => 10);
    const next = clock.tick([stamp(20, 7, remoteDevice)]);
    expect(next).toEqual(stamp(20, 8));
    expect(compareHlc(next, stamp(20, 7, remoteDevice))).toBe(1);
  });
});

describe('SettingsRepo', () => {
  it('upserts profiles and enumerated settings through the RecordStore', async () => {
    const store = new MemoryRecordStore();
    const repo = createSettingsRepo(store, { deviceId, nowMs: () => 1_800_000_000_000 });
    const day = date('2032-04-05');
    const contraception: ContraceptionState = {
      method: 'condoms',
      startDate: day,
      regimen: { activeDays: 1, breakDays: 0, continuous: true },
    };
    const pregnancy: PregnancyRecord = {
      id: 'synthetic-pregnancy' as PregnancyId,
      lmp: day,
      eddSource: 'lmp',
      fetusCount: 1,
    };
    const reminder: ReminderRule = {
      id: 'synthetic-reminder' as ReminderId,
      kind: 'daily_symptom_log',
      localTime: '09:00' as LocalTime,
      days: [1, 3, 5],
      condition: 'always',
      enabled: true,
    };

    expect(await repo.getProfile()).toBeUndefined();
    await repo.putProfile(profile());
    expect(await repo.getProfile()).toEqual(profile());
    await repo.putContraception(contraception);
    await repo.putPregnancy(pregnancy);
    await repo.putReminder(reminder);
    expect(await repo.listContraception()).toEqual([contraception]);
    expect(await repo.listPregnancies()).toEqual([pregnancy]);
    expect(await repo.listReminders()).toEqual([reminder]);
    expect(await repo.getBackupMeta()).toEqual({});
  });

  it('reads the current device identity and backup metadata using encrypted records', async () => {
    const store = new MemoryRecordStore();
    const repo = createSettingsRepo(store, { deviceId, nowMs: () => 1_800_000_000_000 });
    const identity: DeviceIdentity = {
      deviceId,
      role: 'owner',
      signPub: 'synthetic-signing-key' as Base64Url,
      agreePub: 'synthetic-agreement-key' as Base64Url,
      displayName: 'Synthetic device',
      createdAt: '2032-04-05T12:00' as LocalDateTime,
    };
    const backup = { lastBackupAt: '2032-04-05T12:15' as LocalDateTime };
    store.seed({
      entity: 'DeviceIdentity',
      logicalId: deviceId as unknown as LogicalId,
      authorDevice: deviceId,
      hlc: stamp(),
      deleted: false,
      body: identity,
    });
    store.seed({
      entity: 'BackupMeta',
      logicalId: 'backup-meta' as LogicalId,
      authorDevice: deviceId,
      hlc: stamp(),
      deleted: false,
      body: backup,
    });

    expect(await repo.getDeviceIdentity()).toEqual(identity);
    expect(await repo.getBackupMeta()).toEqual(backup);
  });
});
